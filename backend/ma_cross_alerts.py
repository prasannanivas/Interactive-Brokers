"""
MA Cross (EMA 9, EMA 21) Alerts
Key buy/sell signal - notifies immediately when EMA9 crosses EMA21 on the daily chart.

Notifies via Telegram - the server bot from .env (if configured) plus every user who
connected their own bot on the Settings page - and the dashboard WebSocket.

Each cross is alerted once per symbol + direction + cross bar date (deduped in MongoDB),
so restarts and repeated monitoring cycles do not re-send the same alert.
"""

from datetime import datetime
from typing import List, Optional

from pymongo.errors import DuplicateKeyError

from database import get_ma_cross_alerts_collection
from user_telegram import list_ma_cross_recipients, send_telegram

# A cross on the live bar or the bar just closed is considered "new".
# (1 also catches a cross completed on the prior daily close, e.g. right after a restart.)
MAX_BARS_SINCE_CROSS = 1


def detect_ma_cross(symbol_data: dict) -> Optional[dict]:
    """Return alert payload if symbol_data shows a new EMA9/EMA21 cross, else None"""
    daily = symbol_data.get('daily_indicators') or {}
    ma = daily.get('ma_crossover') if isinstance(daily, dict) else None
    if not isinstance(ma, dict):
        return None

    bars_since = ma.get('bars_since_cross')
    direction = ma.get('last_cross_direction')
    cross_date = ma.get('last_cross_date')
    if bars_since is None or bars_since > MAX_BARS_SINCE_CROSS or not direction or not cross_date:
        return None
    # Ignore a cross that has already reversed (current state disagrees with cross direction)
    if ma.get('signal') != direction:
        return None

    return {
        'symbol': symbol_data.get('symbol'),
        'direction': direction,
        'cross_date': cross_date,
        'price': symbol_data.get('last_price'),
        'fast_ema': ma.get('fast_ema'),
        'slow_ema': ma.get('slow_ema'),
        'bars_since_cross': bars_since,
        'timestamp': datetime.now().isoformat()
    }


def _display_symbol(symbol: str) -> str:
    return (symbol or '').replace('C:', '')


def format_telegram(alert: dict) -> str:
    is_buy = alert['direction'] == 'BUY'
    arrow = '🟢⬆️' if is_buy else '🔴⬇️'
    rel = 'EMA 9 crossed ABOVE EMA 21' if is_buy else 'EMA 9 crossed BELOW EMA 21'
    price = alert.get('price')
    price_str = f"{price:.5f}" if isinstance(price, (int, float)) else 'N/A'
    return (
        f"🚨 <b>MA CROSS {alert['direction']}</b> {arrow}\n\n"
        f"<b>{_display_symbol(alert['symbol'])}</b> @ {price_str}\n"
        f"{rel} (Daily)\n"
        f"EMA 9: {alert.get('fast_ema')}  |  EMA 21: {alert.get('slow_ema')}\n"
        f"📅 Cross bar: {alert['cross_date']}\n"
        f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    )


class MACrossAlerter:
    def __init__(self, telegram_bot):
        self.telegram_bot = telegram_bot

    async def _record_if_new(self, alert: dict, has_channels: bool) -> bool:
        """Insert alert; returns False if this cross was already alerted.
        A cross whose Telegram send failed earlier is retried once a Telegram channel works."""
        try:
            await get_ma_cross_alerts_collection().insert_one(dict(alert))
            return True
        except DuplicateKeyError:
            if not has_channels:
                return False
            existing = await get_ma_cross_alerts_collection().find_one(
                {'symbol': alert['symbol'], 'direction': alert['direction'], 'cross_date': alert['cross_date']},
                {'telegram_sent': 1}
            )
            return bool(existing) and existing.get('telegram_sent') is False

    async def process(self, symbols: List[dict]) -> List[dict]:
        """Detect new crosses in a batch of symbol updates, notify, and return new alerts"""
        new_alerts = []
        recipients = None  # users' own bots, loaded only when a cross is detected
        for symbol_data in symbols:
            alert = detect_ma_cross(symbol_data)
            if not alert:
                continue
            if recipients is None:
                try:
                    recipients = await list_ma_cross_recipients()
                except Exception as e:
                    print(f"✗ Failed to load MA Cross recipients: {e}")
                    recipients = []
            has_channels = self.telegram_bot.is_configured() or len(recipients) > 0
            if not await self._record_if_new(alert, has_channels):
                continue

            print(f"🚨 MA CROSS {alert['direction']}: {alert['symbol']} (cross bar {alert['cross_date']})")
            message = format_telegram(alert)
            delivered = 0
            if self.telegram_bot.is_configured():
                try:
                    await self.telegram_bot.send_message(message)
                    delivered += 1
                except Exception as e:
                    print(f"✗ MA Cross Telegram alert failed: {e}")

            for r in recipients:
                ok, err = await send_telegram(r['telegram_bot_token'], r['telegram_chat_id'], message)
                if ok:
                    delivered += 1
                else:
                    print(f"✗ MA Cross Telegram alert to {r.get('email')} failed: {err}")

            telegram_sent = delivered > 0
            alert['telegram_sent'] = telegram_sent
            alert['telegram_deliveries'] = delivered
            try:
                await get_ma_cross_alerts_collection().update_one(
                    {'symbol': alert['symbol'], 'direction': alert['direction'], 'cross_date': alert['cross_date']},
                    {'$set': {'telegram_sent': telegram_sent, 'telegram_deliveries': delivered}}
                )
            except Exception:
                pass
            new_alerts.append(alert)

        return new_alerts


async def get_recent_alerts(limit: int = 50) -> List[dict]:
    cursor = get_ma_cross_alerts_collection().find({}, {'_id': 0}).sort('timestamp', -1).limit(limit)
    return [doc async for doc in cursor]
