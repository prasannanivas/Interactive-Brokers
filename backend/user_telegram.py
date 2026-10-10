"""
Per-user Telegram settings
Each user can connect their own Telegram bot (token + chat id) from the Settings page
and receive MA Cross (EMA 9, EMA 21) alerts there.
"""

from datetime import datetime
from typing import List, Optional, Tuple

import aiohttp

from database import get_user_notification_settings_collection

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
