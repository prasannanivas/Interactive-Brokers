"""
Test the new signal formatter and Telegram bot integration
"""

import asyncio
from signal_formatter import SignalFormatter
from telegram_bot import TelegramBot
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()


def test_formatter():
    """Test the signal formatter with sample data"""
    
    print("="*80)
    print("TESTING SIGNAL FORMATTER")
    print("="*80)
    
    # Sample data matching the new structure
    sample_data = {
        'symbol': 'C:EURUSD',
        'last_price': 1.08950,
        'buy_signals': ['SMA_50_Daily', 'MACD_Daily', 'EMA_100_Hourly'],
        'sell_signals': [],
        'daily_indicators': {
            'bollinger_band': {
                'upper_band': 1.09200,
                'middle_band': 1.08900,
                'lower_band': 1.08600,
                'signal': None
            },
            'rsi_9': {
                'rsi_value': 45.23,
                'period': 9,
                'signal': None
            },
            'sma_9': 1.08910,
            'sma_20': 1.08880,
            'sma_50': {
                'sma_value': 1.08850,
                'period': 50,
                'signal': 'BUY'
            },
            'sma_200': 1.08700,
            'ma_crossover': {
                'fast_ema': 1.08920,
                'slow_ema': 1.08890,
                'signal': None
            },
            'macd': {
                'macd_line': 0.00015,
                'signal_line': 0.00012,
                'histogram': 0.00003,
                'signal': 'BUY'
            }
        },
        'hourly_indicators': {
            'ema_100': {
                'ema_value': 1.08930,
                'period': 100,
                'signal': 'BUY'
            }
        }
    }
    
    print("\n1. Testing Telegram Message Format:")
    print("-" * 80)
    telegram_msg = SignalFormatter.format_telegram_message(sample_data)
    print(telegram_msg)
    
    print("\n\n2. Testing Plain Text Format:")
    print("-" * 80)
    plain_msg = SignalFormatter.format_plain_text(sample_data)
    print(plain_msg)
    
    print("\n\n3. Testing Email Format:")
    print("-" * 80)
    email_msg = SignalFormatter.format_email_message(sample_data)
    print(f"Subject: {email_msg['subject']}")
    print(f"Body:\n{email_msg['body']}")
    
    print("\n\n4. Testing Signal Change Message:")
    print("-" * 80)
    previous_data = sample_data.copy()
    previous_data['buy_signals'] = ['SMA_50_Daily']
    previous_data['sell_signals'] = ['RSI_9_Daily']
    
    change_msg = SignalFormatter.format_signal_change_message(sample_data, previous_data)
    print(change_msg)
    
    print("\n\n5. Testing Summary Message:")
    print("-" * 80)
    watchlist_sample = [
        {
            'symbol': 'C:EURUSD',
            'buy_signals': ['SMA_50_Daily', 'MACD_Daily'],
            'sell_signals': []
        },
        {
            'symbol': 'C:GBPUSD',
            'buy_signals': [],
            'sell_signals': ['RSI_9_Daily', 'EMA_100_Hourly']
        },
        {
            'symbol': 'C:USDJPY',
            'buy_signals': [],
            'sell_signals': []
        }
    ]
    summary_msg = SignalFormatter.format_summary_message(watchlist_sample)
    print(summary_msg)


async def test_telegram_bot():
    """Test actual Telegram bot (requires valid credentials)"""
    
    print("\n\n")
    print("="*80)
    print("TESTING TELEGRAM BOT")
    print("="*80)
    
    bot = TelegramBot()
    
    # Check if configured
    bot_token = os.getenv('TELEGRAM_BOT_TOKEN')
    chat_id = os.getenv('TELEGRAM_CHAT_ID')
    
    if not bot_token or not chat_id:
        print("\n⚠️  Telegram credentials not configured in .env file")
        print("Skipping Telegram bot test")
        return
    
    bot.configure(bot_token, chat_id)
    print(f"\n✓ Telegram bot configured")
    print(f"   Token: {bot_token[:20]}...")
    print(f"   Chat ID: {chat_id}")
    
    # Test data
    test_data = {
        'symbol': 'C:EURUSD',
        'last_price': 1.08950,
        'buy_signals': ['SMA_50_Daily', 'MACD_Daily', 'EMA_100_Hourly'],
        'sell_signals': [],
        'daily_indicators': {
            'bollinger_band': {
                'upper_band': 1.09200,
                'middle_band': 1.08900,
                'lower_band': 1.08600,
                'signal': None
            },
            'rsi_9': {
                'rsi_value': 45.23,
                'signal': None
            },
            'sma_50': {
                'sma_value': 1.08850,
                'signal': 'BUY'
            },
            'macd': {
                'macd_line': 0.00015,
                'signal_line': 0.00012,
                'histogram': 0.00003,
                'signal': 'BUY'
            }
        },
        'hourly_indicators': {
            'ema_100': {
                'ema_value': 1.08930,
                'signal': 'BUY'
            }
        }
    }
    
    try:
        print("\n📤 Sending test signal to Telegram...")
        await bot.send_signal(test_data)
        print("✓ Message sent successfully!")
        
        # Test summary
        print("\n📤 Sending test summary to Telegram...")
        watchlist_sample = [
            {
                'symbol': 'C:EURUSD',
                'buy_signals': ['SMA_50_Daily', 'MACD_Daily'],
                'sell_signals': []
            },
            {
                'symbol': 'C:GBPUSD',
                'buy_signals': [],
                'sell_signals': ['RSI_9_Daily', 'EMA_100_Hourly']
            },
        ]
        await bot.send_summary(watchlist_sample)
        print("✓ Summary sent successfully!")
        
    except Exception as e:
        print(f"✗ Error: {e}")


if __name__ == "__main__":
    # Test formatter
    test_formatter()
    
    # Test Telegram bot
    asyncio.run(test_telegram_bot())
    
    print("\n\n✅ All tests completed!")
