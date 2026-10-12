"""
Telegram bot commands
Polls every connected bot (the server bot from .env plus each user's own bot) for new messages
and replies to commands:

  /start, /help - welcome message with the chat's Chat ID and link status
  /status       - current MA Cross (EMA 9 / EMA 21) picture across the watchlist
  /last         - most recent MA Cross alerts
  /test         - sends a sample MA Cross alert and reports how long delivery took
  /id           - this chat's Chat ID

Chats that message a bot are remembered so 'Detect my Chat ID' on the Settings page keeps working
(polling consumes the bot's pending updates).
"""

import asyncio
import time
from datetime import datetime
from typing import Callable, Dict, List, Optional

from database import get_user_notification_settings_collection, get_ma_cross_alerts_collection
from ma_cross_alerts import format_telegram
from user_telegram import telegram_call, send_and_log, record_seen_chat, bot_id_from_token

POLL_INTERVAL_SECONDS = 3
REPLY_MAX_AGE_SECONDS = 600     # don't answer commands older than this (e.g. sent while server was down)
FAILED_TOKEN_BACKOFF_SECONDS = 300


def _display_symbol(symbol: str) -> str:
    return (symbol or '').replace('C:', '')


class TelegramCommandPoller:
    def __init__(self, server_bot, get_watchlist: Callable[[], Dict[str, dict]]):
        self.server_bot = server_bot
        self.get_watchlist = get_watchlist
        self.offsets: Dict[str, int] = {}
        self.backoff_until: Dict[str, float] = {}

    async def _tokens(self) -> List[str]:
        tokens = []
        if self.server_bot.is_configured():
            tokens.append(self.server_bot.bot_token)
        cursor = get_user_notification_settings_collection().find(
            {'telegram_bot_token': {'$nin': [None, '']}}, {'telegram_bot_token': 1})
        async for doc in cursor:
            tokens.append(doc['telegram_bot_token'])
        return list(dict.fromkeys(tokens))

    async def run(self):
        print("✓ Telegram command listener started (/start, /status, /last, /test, /help)")
        while True:
            try:
                for token in await self._tokens():
                    if self.backoff_until.get(token, 0) > time.time():
                        continue
                    await self._poll(token)
            except Exception as e:
                print(f"✗ Telegram command listener error: {e}")
            await asyncio.sleep(POLL_INTERVAL_SECONDS)

    async def _poll(self, token: str):
        payload = {'timeout': 0, 'allowed_updates': ['message', 'channel_post', 'my_chat_member']}
        if token in self.offsets:
            payload['offset'] = self.offsets[token]
        ok, result = await telegram_call(token, 'getUpdates', payload)
        if not ok:
            # Invalid token, webhook set, or another process polling this bot - try again later
            self.backoff_until[token] = time.time() + FAILED_TOKEN_BACKOFF_SECONDS
            print(f"⚠ Telegram command listener paused for bot {bot_id_from_token(token)}: {result.get('error')}")
            return

        bot_id = bot_id_from_token(token)
        for update in result or []:
            self.offsets[token] = update['update_id'] + 1
            msg = update.get('message') or update.get('channel_post') or {}
            chat = msg.get('chat') or (update.get('my_chat_member') or {}).get('chat')
            if not chat:
                continue
            try:
                await record_seen_chat(bot_id, chat)
            except Exception as e:
                print(f"✗ Failed to remember Telegram chat: {e}")

            text = (msg.get('text') or '').strip()
            if not text.startswith('/'):
                continue
            if time.time() - msg.get('date', 0) > REPLY_MAX_AGE_SECONDS:
                continue
            command = text.split()[0].split('@')[0].lower()
            try:
                await self._handle(token, str(chat['id']), command)
            except Exception as e:
                print(f"✗ Failed to handle Telegram command {command}: {e}")

    async def _linked_user(self, token: str, chat_id: str) -> Optional[dict]:
        if self.server_bot.is_configured() and token == self.server_bot.bot_token and chat_id == str(self.server_bot.chat_id):
            return {'user_id': 'server', 'email': None, 'label': 'server alerts'}
        doc = await get_user_notification_settings_collection().find_one(
            {'telegram_bot_token': token, 'telegram_chat_id': chat_id})
        if doc:
            return {'user_id': doc.get('user_id'), 'email': doc.get('email'), 'label': doc.get('email') or 'your account',
                    'enabled': doc.get('telegram_enabled', False) and doc.get('ma_cross_alerts', True)}
        return None

    async def _reply(self, token: str, chat_id: str, text: str, linked: Optional[dict], **timing):
        return await send_and_log(token, chat_id, text, kind=timing.pop('kind', 'command_reply'),
                           user_id=(linked or {}).get('user_id'), email=(linked or {}).get('email'), **timing)

    async def _handle(self, token: str, chat_id: str, command: str):
        linked = await self._linked_user(token, chat_id)

        if command in ('/start', '/help'):
            if linked:
                status = (f"✅ This chat is linked to <b>{linked['label']}</b>.\n"
                          + ("🔔 MA Cross alerts are ON." if linked.get('enabled', True) else "🔕 MA Cross alerts are OFF (turn them on in Settings)."))
            else:
                status = ("⚠️ This chat isn't linked yet.\n"
                          "Open the dashboard → ⚙️ Settings → Telegram Alerts, paste your bot token and this Chat ID, "
                          "then click Test Connection and Save.")
            text = (
                "👋 <b>Trading Signal Monitor</b>\n\n"
                "You'll get an instant alert here when EMA 9 crosses EMA 21 on the daily chart:\n"
                "🟢⬆️ <b>BUY</b> - EMA 9 crosses above EMA 21\n"
                "🔴⬇️ <b>SELL</b> - EMA 9 crosses below EMA 21\n\n"
                f"🆔 Your Chat ID: <code>{chat_id}</code>\n"
                f"{status}\n\n"
                "<b>Commands</b>\n"
                "/status - current MA Cross picture\n"
                "/last - latest MA Cross alerts\n"
                "/test - send a sample alert and measure delivery time\n"
                "/id - show this Chat ID\n"
                "/help - this message"
            )
            await self._reply(token, chat_id, text, linked)

        elif command == '/id':
            await self._reply(token, chat_id, f"🆔 Your Chat ID: <code>{chat_id}</code>", linked)

        elif command == '/status':
            await self._reply(token, chat_id, self._status_text(), linked)

        elif command == '/last':
            await self._reply(token, chat_id, await self._last_text(), linked)

        elif command == '/test':
            detected_at = datetime.now().isoformat()
            sample = {
                'symbol': 'C:USDCAD', 'direction': 'BUY', 'cross_date': datetime.now().strftime('%Y-%m-%d'),
                'price': 1.42820, 'fast_ema': 1.41250, 'slow_ema': 1.40500, 'timestamp': detected_at,
            }
            text = "🧪 <b>TEST ALERT - not a real signal</b>\n\n" + format_telegram(sample)
            ok, _, record = await self._reply(token, chat_id, text, linked, kind='test_alert', detected_at=detected_at,
                                              symbol='TEST', direction='BUY', cross_date=sample['cross_date'])
            if ok:
                await self._reply(token, chat_id,
                                  f"⏱ Test alert delivered in <b>{record['delay_ms']} ms</b> "
                                  f"(Telegram API {record['telegram_ms']} ms).", linked)

        else:
            await self._reply(token, chat_id, "Unknown command. Send /help to see what I can do.", linked)

    def _status_text(self) -> str:
        watchlist = self.get_watchlist() or {}
        buys, sells, recent = [], [], []
        for symbol, data in watchlist.items():
            ma = ((data or {}).get('daily_indicators') or {}).get('ma_crossover') or {}
            if not isinstance(ma, dict) or not ma.get('signal'):
                continue
            (buys if ma['signal'] == 'BUY' else sells).append(_display_symbol(symbol))
            bars = ma.get('bars_since_cross')
            if bars is not None and bars <= 3:
                recent.append((bars, _display_symbol(symbol), ma.get('last_cross_direction'), ma.get('last_cross_date')))
        if not buys and not sells:
            return "No MA Cross data yet - the monitor is still processing the watchlist. Try again in a minute."
        lines = [
            "📊 <b>MA Cross (EMA 9 / EMA 21) - Daily</b>\n",
            f"🟢 BUY (EMA 9 above EMA 21): {len(buys)}",
            f"🔴 SELL (EMA 9 below EMA 21): {len(sells)}",
        ]
        if recent:
            lines.append("\n<b>Recent crosses (last 3 bars)</b>")
            for bars, sym, direction, date in sorted(recent):
                arrow = '🟢⬆️' if direction == 'BUY' else '🔴⬇️'
                lines.append(f"{arrow} {sym} {direction} - {date}")
        else:
            lines.append("\nNo crosses in the last 3 bars.")
        return "\n".join(lines)

    async def _last_text(self) -> str:
        cursor = get_ma_cross_alerts_collection().find({}, {'_id': 0}).sort('timestamp', -1).limit(5)
        rows = [doc async for doc in cursor]
        if not rows:
            return "No MA Cross alerts yet."
        lines = ["🕘 <b>Latest MA Cross alerts</b>\n"]
        for a in rows:
            arrow = '🟢⬆️' if a.get('direction') == 'BUY' else '🔴⬇️'
            price = a.get('price')
            price_str = f" @ {price:.5f}" if isinstance(price, (int, float)) else ''
            detected = (a.get('timestamp') or '')[:16].replace('T', ' ')
            lines.append(f"{arrow} <b>{_display_symbol(a.get('symbol'))}</b> {a.get('direction')}{price_str}\n"
                         f"     cross bar {a.get('cross_date')} · detected {detected}")
        return "\n".join(lines)
