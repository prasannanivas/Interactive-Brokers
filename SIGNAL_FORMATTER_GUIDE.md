# Signal Formatter - Polymorphic Notification System

## Overview

The `signal_formatter.py` module provides a **polymorphic, reusable formatter** for all trading signals across different notification channels (Telegram, Email, SMS, Console, etc.).

## Features

✅ **Polymorphic Design**: Single formatter for multiple output formats
✅ **Comprehensive Indicators**: Displays all 15+ indicators
✅ **Signal Changes**: Tracks and highlights new/removed signals
✅ **Multiple Formats**: Telegram (HTML), Email, Plain Text, SMS
✅ **Summary Reports**: Aggregate statistics across all pairs

## Architecture

```
signal_formatter.py          ← Polymorphic formatter (core)
    ↓
telegram_bot.py             ← Telegram notifications
email_notifier.py           ← Email notifications (can be added)
sms_notifier.py            ← SMS notifications (can be added)
```

## Usage Examples

### 1. Telegram Notifications

```python
from telegram_bot import TelegramBot

bot = TelegramBot()
bot.configure(token, chat_id)

# Send signal with all indicators
await bot.send_signal(symbol_data)

# Send signal change notification
await bot.send_signal_change(new_data, old_data)

# Send summary of all pairs
await bot.send_summary(watchlist_data)
```

### 2. Email Notifications

```python
from signal_formatter import SignalFormatter

# Format for email
email_data = SignalFormatter.format_email_message(symbol_data)
# Returns: {'subject': '🟢 BUY Signal Alert: C:EURUSD', 'body': '...'}

# Send email (implement email client)
send_email(to, email_data['subject'], email_data['body'])
```

### 3. Plain Text (Console, SMS, Logs)

```python
from signal_formatter import SignalFormatter

# Format as plain text
plain_text = SignalFormatter.format_plain_text(symbol_data)
# Returns: "C:EURUSD @ $1.089500 | BUY: SMA_50_Daily, MACD_Daily"

print(plain_text)
```

## Data Structure

### Input Format

```python
symbol_data = {
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
```

## Output Examples

### Telegram Format (HTML)

```
🟢 C:EURUSD - BULLISH
💰 Price: $1.089500

🟢 BUY Signals (3):
  • SMA 50 Daily
  • MACD Daily
  • EMA 100 Hourly

📊 Key Indicators:
  BB(20): U:1.092000 M:1.089000 L:1.086000
  RSI(9): 45.23
  SMA(50): 1.088500
  MACD: 0.000150 / 0.000120
  EMA(100)H: 1.089300

📈 Check dashboard for full analysis!
```

### Signal Change Alert

```
🔔 NEW SIGNALS: C:EURUSD
💰 Price: $1.089500

🟢 NEW BUY Signals:
  ✅ EMA 100 Hourly
  ✅ MACD Daily

❌ Cleared SELL Signals:
  • RSI 9 Daily

📊 Active BUY: 3 signal(s)
```

### Summary Report

```
📊 Trading Signals Summary

Total Pairs: 20
🟢 With BUY signals: 12
🔴 With SELL signals: 15
⚪ Neutral: 0

Top Active Pairs:
  • C:EURUSD: 🟢3 🔴0
  • C:GBPUSD: 🟢3 🔴0
  • C:EURGBP: 🟢3 🔴1
  • C:USDJPY: 🟢1 🔴2
  • C:AUDUSD: 🟢1 🔴2
```

## Integration with Monitoring System

### In massive_monitor_v2.py

```python
from telegram_bot import TelegramBot

class MassiveMonitorV2:
    def __init__(self):
        self.telegram_bot = TelegramBot()
    
    async def _update_single_symbol(self, symbol: str):
        # ... fetch data and calculate indicators ...
        
        # Get previous data
        old_data = self.watchlist.get(symbol, {})
        
        # Update watchlist
        self.watchlist[symbol] = new_data
        
        # Check for signal changes
        old_buy = set(old_data.get('buy_signals', []))
        new_buy = set(new_data.get('buy_signals', []))
        
        if old_buy != new_buy:
            # Send signal change notification
            if self.telegram_bot.is_configured():
                await self.telegram_bot.send_signal_change(
                    new_data, 
                    old_data
                )
```

## Method Reference

### SignalFormatter

| Method | Description | Returns |
|--------|-------------|---------|
| `format_telegram_message(data)` | Format for Telegram with HTML | str |
| `format_signal_change_message(new, old)` | Highlight signal changes | str |
| `format_summary_message(watchlist)` | Summary of all pairs | str |
| `format_email_message(data)` | Format for email | dict |
| `format_plain_text(data)` | Plain text format | str |

### TelegramBot

| Method | Description |
|--------|-------------|
| `send_signal(data)` | Send comprehensive signal |
| `send_signal_change(new, old)` | Send change alert |
| `send_summary(watchlist)` | Send summary report |
| `send_message(text)` | Send raw message |

## Testing

Run the test script:

```bash
cd backend
python test_signal_formatter.py
```

This will:
1. Test all formatter methods
2. Display sample outputs
3. Send test messages to Telegram (if configured)

## Extending to Other Channels

### Add Email Support

```python
class EmailNotifier:
    def __init__(self):
        self.formatter = SignalFormatter()
    
    async def send_signal(self, symbol_data: dict):
        email_data = self.formatter.format_email_message(symbol_data)
        # Implement email sending
        await send_email(
            subject=email_data['subject'],
            body=email_data['body']
        )
```

### Add SMS Support

```python
class SMSNotifier:
    def __init__(self):
        self.formatter = SignalFormatter()
    
    async def send_signal(self, symbol_data: dict):
        sms_text = self.formatter.format_plain_text(symbol_data)
        # Implement SMS sending (Twilio, AWS SNS, etc.)
        await send_sms(phone_number, sms_text)
```

### Add Discord Support

```python
class DiscordNotifier:
    def __init__(self):
        self.formatter = SignalFormatter()
    
    async def send_signal(self, symbol_data: dict):
        # Telegram format works for Discord too
        message = self.formatter.format_telegram_message(symbol_data)
        # Convert HTML to Discord markdown
        discord_msg = self._convert_to_discord(message)
        await send_discord_message(discord_msg)
```

## Benefits

✅ **DRY Principle**: Single source of truth for formatting
✅ **Maintainability**: Update once, affects all channels
✅ **Consistency**: Same information across all channels
✅ **Extensibility**: Easy to add new notification channels
✅ **Testability**: Simple to unit test
✅ **Flexibility**: Support any number of indicators

## Signal Name Formatting

The formatter automatically makes signal names readable:

| Internal Name | Formatted Name |
|---------------|----------------|
| `SMA_50_Daily` | SMA 50 Daily |
| `MACD_Daily` | MACD Daily |
| `EMA_100_Hourly` | EMA 100 Hourly |
| `Bollinger_Band_Daily` | Bollinger Band Daily |
| `MA_Crossover_Daily` | MA Crossover Daily |

## Configuration

Set up Telegram in `.env`:

```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

## Future Enhancements

- [ ] Add email notifier class
- [ ] Add SMS notifier class
- [ ] Add Discord notifier class
- [ ] Add Slack notifier class
- [ ] Add webhook notifier class
- [ ] Add voice call notifier (for critical signals)
- [ ] Add push notification support
- [ ] Add filtering options (only send certain signals)
- [ ] Add rate limiting (avoid spam)
- [ ] Add notification templates customization

## Conclusion

The polymorphic signal formatter provides a clean, maintainable way to send comprehensive trading signals across multiple channels while keeping the codebase DRY and extensible.
