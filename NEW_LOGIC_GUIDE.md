# New Trading Logic Implementation Guide

## Overview

This implementation introduces a comprehensive technical indicator system for forex trading pairs with the following features:

- **20 Major Forex Pairs** from watchlist.json
- **Daily Timeframe Indicators:**
  - Bollinger Bands (20, 2, 0) with EMA
  - RSI (9 period)
  - SMA (9, 20, 50, 200 periods)
  - MA Crossover (9-day EMA vs 21-day EMA)
  - MACD (12, 26, 9 EMA)
- **Hourly Timeframe Indicators:**
  - EMA (100 period)

## Trading Signals

### Daily Indicators

| Indicator | Parameters | Buy Signal | Sell Signal |
|-----------|-----------|------------|-------------|
| Bollinger Band | (20,2,0) - EMA | Current Bar < Lower Band | Current Bar > Upper Band |
| RSI | 9 period | RSI < 20 | RSI > 80 |
| SMA | 50 period | Current Bar > 50 MA | Current Bar < 50 MA |
| MA Crossover | 9 EMA, 21 EMA | Fast crosses above Slow | Fast crosses below Slow |
| MACD | 12,26,9 EMA | MACD > Signal (12 > 26) | MACD < Signal (12 < 26) |

### Hourly Indicators

| Indicator | Parameters | Buy Signal | Sell Signal |
|-----------|-----------|------------|-------------|
| EMA | 100 period | Hourly Bar > EMA | Hourly Bar < EMA |

## File Structure

```
backend/
├── clear_database.py          # Script to clear MongoDB
├── indicator_calculator.py    # New indicator calculation engine
├── massive_monitor_v2.py      # New monitor with updated logic
├── test_new_logic.py          # Test script
├── models.py                  # Updated with new data models
├── database.py                # Database connection
└── watchlist.json             # 20 forex pairs
```

## Setup Instructions

### Step 1: Clear Existing Database

```bash
cd backend
python clear_database.py
```

This will remove all existing data from MongoDB.

### Step 2: Verify Watchlist

The [watchlist.json](watchlist.json) now contains 20 major forex pairs:
- EUR/USD, GBP/USD, USD/JPY, AUD/USD
- USD/CAD, USD/CHF, NZD/USD
- EUR/GBP, EUR/JPY, GBP/JPY, AUD/JPY
- EUR/AUD, EUR/CHF, GBP/AUD, GBP/CAD
- GBP/CHF, AUD/CAD, AUD/CHF, CAD/CHF, NZD/JPY

### Step 3: Set API Key

```bash
# Windows
set MASSIVE_API_KEY=your_api_key_here

# Linux/Mac
export MASSIVE_API_KEY=your_api_key_here
```

### Step 4: Test the New Logic

```bash
python test_new_logic.py
```

This will:
1. Connect to MongoDB
2. Connect to MASSIVE API
3. Load all 20 forex pairs
4. Calculate all indicators
5. Display results with BUY/SELL signals

## Database Schema

### Watchlist Collection

```json
{
  "symbol": "C:EURUSD",
  "exchange": "FX",
  "currency": "USD",
  "sec_type": "FX",
  "market_type": "forex",
  "last_price": 1.08950,
  "last_updated": "2025-12-17T10:30:00",
  "daily_indicators": {
    "bollinger_band": {
      "upper_band": 1.09200,
      "middle_band": 1.08900,
      "lower_band": 1.08600,
      "current_price": 1.08950,
      "signal": null
    },
    "rsi_9": {
      "rsi_value": 45.23,
      "period": 9,
      "signal": null
    },
    "sma_9": 1.08910,
    "sma_20": 1.08880,
    "sma_50": {
      "sma_value": 1.08850,
      "period": 50,
      "current_price": 1.08950,
      "signal": "BUY"
    },
    "sma_200": 1.08700,
    "ma_crossover": {
      "fast_ema": 1.08920,
      "slow_ema": 1.08890,
      "signal": null
    },
    "macd": {
      "macd_line": 0.00015,
      "signal_line": 0.00012,
      "histogram": 0.00003,
      "signal": "BUY"
    }
  },
  "hourly_indicators": {
    "ema_100": {
      "ema_value": 1.08930,
      "period": 100,
      "current_price": 1.08950,
      "signal": "BUY"
    }
  },
  "buy_signals": ["SMA_50_Daily", "MACD_Daily", "EMA_100_Hourly"],
  "sell_signals": []
}
```

### Signals Collection

Logs all generated signals for backtesting and analysis:

```json
{
  "symbol": "C:EURUSD",
  "signal_type": "BUY",
  "timestamp": "2025-12-17T10:30:00",
  "price": 1.08950,
  "daily_indicators": { ... },
  "hourly_indicators": { ... },
  "buy_signals": ["SMA_50_Daily", "MACD_Daily"],
  "sell_signals": []
}
```

## API Integration

Update [app.py](app.py) to use the new monitor:

```python
from massive_monitor_v2 import MassiveMonitorV2

# Initialize
monitor = MassiveMonitorV2()
await monitor.connect()

# Load watchlist
await monitor.load_watchlist_from_json("watchlist.json")

# Update all symbols
await monitor.update_all()

# Get data
watchlist_data = monitor.get_watchlist_data()
```

## Key Changes

1. **New Indicator Calculator** ([indicator_calculator.py](indicator_calculator.py)):
   - Bollinger Bands with EMA
   - RSI with configurable thresholds
   - Multiple SMA periods
   - MA Crossover detection
   - MACD with signal generation
   - Hourly EMA

2. **Updated Models** ([models.py](models.py)):
   - `BollingerBandIndicator`
   - `RSIIndicator`
   - `SMAIndicator`
   - `MACrossoverIndicator`
   - `MACDIndicator`
   - `EMAIndicator`
   - `DailyIndicators`
   - `HourlyIndicators`

3. **New Monitor** ([massive_monitor_v2.py](massive_monitor_v2.py)):
   - Fetches daily and hourly data
   - Calculates all indicators
   - Generates buy/sell signals
   - Stores comprehensive data in MongoDB

## Testing

Run the test script to verify:

```bash
python test_new_logic.py
```

Expected output:
- List of 20 forex pairs
- Current prices
- All indicator values
- Buy/sell signals
- Detailed indicator breakdown

## Next Steps

1. ✅ Clear database
2. ✅ Update models
3. ✅ Create indicator calculator
4. ✅ Create new monitor
5. ⏳ Integrate with existing API endpoints
6. ⏳ Update frontend to display new indicators
7. ⏳ Add real-time updates
8. ⏳ Implement alert system

## Notes

- All prices are stored with 6 decimal precision
- Indicators are calculated on each update
- Signals are logged to MongoDB for historical analysis
- The system requires at least 200 days of historical data for SMA200
- Hourly data needs at least 100 hours for EMA100
