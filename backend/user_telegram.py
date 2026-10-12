"""
Per-user Telegram settings
Each user can connect their own Telegram bot (token + chat id) from the Settings page
and receive MA Cross (EMA 9, EMA 21) alerts there.
"""

from datetime import datetime
import time
from typing import List, Optional, Tuple

import aiohttp

from database import get_user_notification_settings_collection, get_telegram_messages_collection, get_telegram_seen_chats_collection

TELEGRAM_API = "https://api.telegram.org/bot{token}/{method}"


def mask_token(token: Optional[str]) -> Optional[str]:
    if not token:
        return None
    if len(token) <= 12:
        return "•" * len(token)
    return f"{token[:6]}••••••{token[-4:]}"


def friendly_error(method: str, status: int, description: str) -> str:
    """Translate Telegram API errors into instructions the user can act on"""
    desc = (description or '').lower()
    if status == 401 or 'unauthorized' in desc:
        return "Bot token is invalid or was revoked. Copy the token again from @BotFather (/mybots → your bot → API Token)."
    if status == 404 and method == 'getMe':
        return "Bot token format is wrong. It should look like 123456789:AAH... (numbers, a colon, then letters)."
    if 'chat not found' in desc:
        return "Chat not found. Open your bot in Telegram and press Start (or send it any message), then check the Chat ID."
    if 'bot was blocked' in desc:
        return "You blocked this bot in Telegram. Open the bot chat, unblock it and press Start."
    if "bot can't initiate conversation" in desc or 'bot can\'t send messages to bots' in desc:
        return "The bot can't message this chat yet. Open your bot in Telegram and press Start first."
    if 'not enough rights' in desc or 'have no rights' in desc:
        return "The bot doesn't have permission to post in this group/channel. Make it an admin or allow it to send messages."
    if status == 409:
        return "This bot has a webhook set, so Chat ID detection can't read messages. Enter the Chat ID manually (e.g. from @userinfobot)."
    if status == 429:
        return "Telegram is rate-limiting this bot. Wait a minute and try again."
    return f"Telegram error ({status}): {description}"


async def telegram_call(token: str, method: str, payload: Optional[dict] = None) -> Tuple[bool, dict]:
    """Call the Telegram Bot API. Returns (ok, result) or (False, {'error': friendly message})"""
    if not token or ':' not in token:
        return False, {'error': "Bot token format is wrong. It should look like 123456789:AAH... (numbers, a colon, then letters)."}
    url = TELEGRAM_API.format(token=token.strip(), method=method)
    try:
        timeout = aiohttp.ClientTimeout(total=15)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, json=payload or {}) as resp:
                try:
                    data = await resp.json(content_type=None)
                except Exception:
                    data = {'ok': False, 'description': await resp.text()}
                if resp.status == 200 and data.get('ok'):
                    return True, data.get('result')
                return False, {'error': friendly_error(method, resp.status, data.get('description', ''))}
    except Exception as e:
        return False, {'error': f"Could not reach Telegram: {e}"}


async def send_telegram(token: str, chat_id: str, text: str) -> Tuple[bool, Optional[str]]:
    ok, result = await telegram_call(token, 'sendMessage', {
        'chat_id': chat_id,
        'text': text,
        'parse_mode': 'HTML'
    })
    return ok, None if ok else result.get('error')


async def get_user_settings(user_id: str) -> Optional[dict]:
    return await get_user_notification_settings_collection().find_one({'user_id': user_id})


async def save_user_settings(user_id: str, email: str, fields: dict):
    await get_user_notification_settings_collection().update_one(
        {'user_id': user_id},
        {'$set': {**fields, 'email': email, 'updated_at': datetime.utcnow()},
         '$setOnInsert': {'created_at': datetime.utcnow()}},
        upsert=True
    )


async def delete_user_settings(user_id: str):
    await get_user_notification_settings_collection().delete_one({'user_id': user_id})


async def list_ma_cross_recipients() -> List[dict]:
    """Users who connected Telegram and want MA Cross alerts"""
    cursor = get_user_notification_settings_collection().find({
        'telegram_enabled': True,
        'ma_cross_alerts': True,
        'telegram_bot_token': {'$nin': [None, '']},
        'telegram_chat_id': {'$nin': [None, '']}
    })
    return [doc async for doc in cursor]


def bot_id_from_token(token: Optional[str]) -> Optional[str]:
    return token.split(':', 1)[0] if token and ':' in token else None


async def send_and_log(token: str, chat_id: str, text: str, *, kind: str, user_id: Optional[str] = None,
                       email: Optional[str] = None, detected_at: Optional[str] = None,
                       symbol: Optional[str] = None, direction: Optional[str] = None,
                       cross_date: Optional[str] = None) -> Tuple[bool, Optional[str], dict]:
    """Send a Telegram message and store it in the history with timing.
    detected_at: server-local ISO time the event was detected (for detection -> delivery delay)."""
    started = time.perf_counter()
    ok, err = await send_telegram(token, chat_id, text)
    telegram_ms = int((time.perf_counter() - started) * 1000)
    now_local = datetime.now()

    delay_ms = None
    if detected_at:
        try:
            delay_ms = int((now_local - datetime.fromisoformat(detected_at)).total_seconds() * 1000)
        except Exception:
            pass

    record = {
        'user_id': user_id,
        'email': email,
        'bot_id': bot_id_from_token(token),
        'chat_id': str(chat_id),
        'kind': kind,                      # ma_cross | test_alert | command_reply | connection_test
        'symbol': symbol,
        'direction': direction,
        'cross_date': cross_date,
        'detected_at': detected_at,
        'sent_at': datetime.utcnow(),
        'telegram_ms': telegram_ms,        # Telegram API round trip
        'delay_ms': delay_ms,              # detected -> confirmed delivered
        'ok': ok,
        'error': err,
        'preview': text[:300],
    }
    try:
        await get_telegram_messages_collection().insert_one(dict(record))
    except Exception as e:
        print(f"✗ Failed to log Telegram message: {e}")
    return ok, err, record


async def get_message_history(user_id: str, limit: int = 50) -> List[dict]:
    cursor = get_telegram_messages_collection().find({'user_id': user_id}, {'_id': 0}).sort('sent_at', -1).limit(limit)
    rows = []
    async for doc in cursor:
        if isinstance(doc.get('sent_at'), datetime):
            doc['sent_at'] = doc['sent_at'].isoformat() + 'Z'
        rows.append(doc)
    return rows


async def record_seen_chat(bot_id: str, chat: dict):
    name = chat.get('title') or ' '.join(filter(None, [chat.get('first_name'), chat.get('last_name')])) or chat.get('username') or str(chat['id'])
    await get_telegram_seen_chats_collection().update_one(
        {'bot_id': bot_id, 'chat_id': str(chat['id'])},
        {'$set': {'name': name, 'username': chat.get('username'), 'type': chat.get('type'), 'last_seen': datetime.utcnow()}},
        upsert=True
    )


async def get_seen_chats(bot_id: str) -> List[dict]:
    cursor = get_telegram_seen_chats_collection().find({'bot_id': bot_id}, {'_id': 0}).sort('last_seen', -1).limit(20)
    return [{'chat_id': d['chat_id'], 'name': d.get('name'), 'username': d.get('username'), 'type': d.get('type')} async for d in cursor]
