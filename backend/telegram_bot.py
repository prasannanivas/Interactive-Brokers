"""
Telegram Bot - Send trading signals to Telegram
"""

import aiohttp
from typing import Optional


class TelegramBot:
    def __init__(self):
        self.bot_token: Optional[str] = None
        self.chat_id: Optional[str] = None
        self.base_url: Optional[str] = None

    def configure(self, bot_token: str, chat_id: str):
        """Configure Telegram bot"""
        self.bot_token = bot_token
        self.chat_id = chat_id
        self.base_url = f"https://api.telegram.org/bot{bot_token}"

    def is_configured(self) -> bool:
        """Check if bot is configured"""
        return self.bot_token is not None and self.chat_id is not None

    async def send_message(self, text: str):
        """Send text message to Telegram"""
        if not self.is_configured():
            raise ValueError("Telegram bot not configured")

        url = f"{self.base_url}/sendMessage"
        payload = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": "HTML"
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as response:
                if response.status != 200:
                    raise Exception(f"Telegram API error: {await response.text()}")

    async def send_signal(self, signal_data: dict):
        """Send trading signal notification"""
        symbol = signal_data.get("symbol")
        signal = signal_data.get("signal")
        price = signal_data.get("price")
        rsi = signal_data.get("rsi")
        macd = signal_data.get("macd")

        # Format message
        emoji = "🟢" if signal == "BULLISH" else "🔴" if signal == "BEARISH" else "⚪"

        message = f"""
{emoji} <b>SIGNAL CHANGE: {symbol}</b>

Signal: <b>{signal}</b>
Price: ${price:.2f}
RSI: {rsi:.2f}
MACD: {macd:.4f}

📊 Check your dashboard for details!
"""

        await self.send_message(message.strip())
