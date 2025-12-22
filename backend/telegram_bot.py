"""
Telegram Bot - Send trading signals to Telegram
"""

import aiohttp
from typing import Optional, List
from signal_formatter import SignalFormatter


class TelegramBot:
    def __init__(self):
        self.bot_token: Optional[str] = None
        self.chat_id: Optional[str] = None
        self.base_url: Optional[str] = None
        self.formatter = SignalFormatter()

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

    async def send_signal(self, symbol_data: dict):
        """
        Send comprehensive trading signal notification with all indicators
        
        Args:
            symbol_data: Dictionary containing symbol, price, indicators, and signals
        """
        message = self.formatter.format_telegram_message(symbol_data)
        await self.send_message(message)
    
    async def send_signal_change(self, symbol_data: dict, previous_data: dict):
        """
        Send notification when signals change
        
        Args:
            symbol_data: Current symbol data with new signals
            previous_data: Previous symbol data for comparison
        """
        message = self.formatter.format_signal_change_message(symbol_data, previous_data)
        await self.send_message(message)
    
    async def send_summary(self, watchlist_data: List[dict]):
        """
        Send summary of all trading pairs
        
        Args:
            watchlist_data: List of all symbols with their data
        """
        message = self.formatter.format_summary_message(watchlist_data)
        await self.send_message(message)
