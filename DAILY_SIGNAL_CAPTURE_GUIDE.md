# Daily Signal Capture - Setup and Usage Guide

## Overview

The Daily Signal Capture system automatically takes a snapshot of all trading signals at 5:00 PM EST every day and stores them in MongoDB. This allows you to track historical signal patterns, analyze trends, and review past signals.

## Features

- **Automatic Daily Capture**: Captures all signals at 5 PM EST daily
- **Signal Classification**: Categorizes each symbol as BULLISH, BEARISH, or NEUTRAL
- **Historical Storage**: Stores complete indicator data for each symbol
- **API Access**: RESTful endpoints to retrieve and analyze historical snapshots
- **Statistics**: Calculate trends and averages over time periods

## What Gets Captured

Each daily snapshot includes:

- **Summary Statistics**:
  - Total number of symbols monitored
  - Count of bullish signals
  - Count of bearish signals
  - Count of neutral signals
  - Timestamp of capture

- **Per-Symbol Data**:
  - Symbol name
  - Current price
  - Signal type (BULLISH/BEARISH/NEUTRAL)
  - Signal strength (net buy signals - sell signals)
  - List of buy signal indicators
  - List of sell signal indicators
  - Complete daily indicator values
  - Complete hourly indicator values
  - Complete weekly indicator values

## Installation & Setup

### For Windows Users

#### Option 1: Using Batch File (Recommended)

1. Open Command Prompt **as Administrator**
2. Navigate to the backend directory:
   ```batch
   cd "e:\Interactive Brokers\backend"
   ```

3. Run the setup script:
   ```batch
   setup_daily_signal_task.bat
   ```

4. Follow the prompts to:
   - Verify Python installation
   - Create the scheduled task
   - Optionally test it immediately

#### Option 2: Using PowerShell

1. Open PowerShell **as Administrator**
2. Navigate to the backend directory:
   ```powershell
   cd "e:\Interactive Brokers\backend"
   ```

3. Run the setup script:
   ```powershell
   .\setup_daily_signal_task.ps1
   ```

4. Follow the prompts

#### Manual Windows Setup

1. Open Task Scheduler (`taskschd.msc`)
2. Click "Create Task"
3. General tab:
   - Name: `TradingSignalsDailyCapture`
   - Description: `Captures daily trading signals at 5pm EST`
   - Run with highest privileges: ✓
4. Triggers tab:
   - New trigger
   - Daily
   - Start: 5:00:00 PM
   - Enabled: ✓
5. Actions tab:
   - New action
   - Program/script: `cmd.exe`
   - Arguments: `/c "cd /d "e:\Interactive Brokers\backend" && python capture_daily_signals.py >> logs\daily_signal_capture.log 2>&1"`
6. Click OK to save

### For Linux/macOS Users

#### Using the Setup Script

1. Make the script executable:
   ```bash
   chmod +x backend/setup_daily_signal_cron.sh
   ```

2. Run the setup script:
   ```bash
   ./backend/setup_daily_signal_cron.sh
   ```

3. Follow the prompts

#### Manual Cron Setup

1. Open crontab:
   ```bash
   crontab -e
   ```

2. Add the following line (adjust paths as needed):
   ```bash
   0 17 * * * cd /path/to/Interactive\ Brokers/backend && python3 capture_daily_signals.py >> logs/daily_signal_capture.log 2>&1
   ```

3. Save and exit

**Note**: The cron time assumes your server is in EST timezone. Adjust if needed.

## Manual Testing

To test the script manually before setting up automation:

```bash
cd "e:\Interactive Brokers\backend"
python capture_daily_signals.py
```

The script will:
1. Connect to MongoDB
2. Fetch all watchlist symbols and their signals
3. Classify each as bullish/bearish/neutral
4. Print a summary to console
5. Save the snapshot to the database

## API Endpoints

Once set up, you can access historical snapshots via the API:

### 1. Get Recent Snapshots

```http
GET /api/signals/daily-snapshots?days=30&skip=0&limit=100
```

**Query Parameters**:
- `days` (default: 30): Number of days to retrieve
- `skip` (default: 0): Number of records to skip for pagination
- `limit` (default: 100, max: 365): Maximum records to return

**Response**:
```json
{
  "snapshots": [
    {
      "_id": "...",
      "snapshot_date": "2026-02-20T22:00:00Z",
      "capture_timestamp": "2026-02-20T22:00:15Z",
      "total_symbols": 150,
      "bullish_count": 45,
      "bearish_count": 30,
      "neutral_count": 75,
      "signals": [...]
    }
  ],
  "count": 30,
  "skip": 0,
  "limit": 100
}
```

### 2. Get Snapshot by Date

```http
GET /api/signals/daily-snapshots/2026-02-20
```

**Response**: Single snapshot object for that date

### 3. Get Latest Snapshot

```http
GET /api/signals/daily-snapshots/latest
```

**Response**: Most recent snapshot

### 4. Get Statistics

```http
GET /api/signals/daily-snapshots/stats?days=30
```

**Query Parameters**:
- `days` (default: 30): Period to analyze

**Response**:
```json
{
  "days": 30,
  "snapshots_count": 30,
  "avg_bullish": 45.5,
  "avg_bearish": 32.1,
  "avg_neutral": 72.4,
  "trend": "INCREASINGLY_BULLISH",
  "latest_snapshot_date": "2026-02-20T22:00:00Z"
}
```

**Trend Values**:
- `INCREASINGLY_BULLISH`: Bullish signals increasing
- `INCREASINGLY_BEARISH`: Bearish signals increasing
- `STABLE`: No significant trend
- `NO_DATA`: Not enough data

## Database Schema

### Collection: `daily_signal_snapshots`

**Indexes**:
- `snapshot_date` (unique, descending): For fast date lookups
- `capture_timestamp` (descending): For latest snapshot queries

**Document Structure**:
```javascript
{
  _id: ObjectId,
  snapshot_date: ISODate("2026-02-20T22:00:00Z"),  // 5pm EST
  capture_timestamp: ISODate("2026-02-20T22:00:15Z"),
  total_symbols: 150,
  bullish_count: 45,
  bearish_count: 30,
  neutral_count: 75,
  signals: [
    {
      symbol: "EUR/USD",
      last_price: 1.0850,
      signal_type: "BULLISH",
      signal_strength: 2,  // net: 3 buy - 1 sell = +2
      buy_signals: ["SMA_50_Daily", "MACD_Daily", "EMA_100_Hourly"],
      sell_signals: ["RSI_9_Daily"],
      daily_indicators: { /* full indicator data */ },
      hourly_indicators: { /* full indicator data */ },
      weekly_indicators: { /* full indicator data */ }
    },
    // ... more symbols
  ]
}
```

## Logs

Logs are saved to: `backend/logs/daily_signal_capture.log`

To view recent logs:

**Windows**:
```batch
type "e:\Interactive Brokers\backend\logs\daily_signal_capture.log"
```

**Linux/macOS**:
```bash
tail -f backend/logs/daily_signal_capture.log
```

## Troubleshooting

### Task Not Running

1. **Windows**:
   - Check Task Scheduler
   - Verify task is enabled
   - Check last run result
   - Review task history

2. **Linux/macOS**:
   - Check cron is running: `systemctl status cron`
   - View cron logs: `grep CRON /var/log/syslog`

### Connection Errors

- Ensure MongoDB is running
- Check environment variables in `.env`:
  ```
  MONGODB_URL=mongodb://localhost:27017
  MONGODB_DB_NAME=trading_monitor
  ```

### No Data Being Captured

- Verify the main monitoring service is running
- Check that watchlist has symbols
- Run manual test to see errors

### Permission Issues (Linux)

Make sure the script is executable:
```bash
chmod +x backend/capture_daily_signals.py
chmod +x backend/setup_daily_signal_cron.sh
```

## Example Usage

### View Today's Signals

```bash
# Run manual capture
python capture_daily_signals.py

# View via API
curl http://localhost:8000/api/signals/daily-snapshots/latest
```

### Analyze Last 30 Days

```bash
curl http://localhost:8000/api/signals/daily-snapshots/stats?days=30
```

### Export Historical Data

```python
import requests
import pandas as pd

# Fetch 90 days of snapshots
response = requests.get('http://localhost:8000/api/signals/daily-snapshots?days=90')
data = response.json()

# Convert to DataFrame for analysis
snapshots = data['snapshots']
df = pd.DataFrame([
    {
        'date': s['snapshot_date'],
        'bullish': s['bullish_count'],
        'bearish': s['bearish_count'],
        'neutral': s['neutral_count']
    }
    for s in snapshots
])

print(df.head())
```

## Frontend Integration

To display daily signals in your React frontend:

```javascript
// Fetch latest snapshot
const response = await fetch('http://localhost:8000/api/signals/daily-snapshots/latest');
const snapshot = await response.json();

console.log(`Today's signals:`);
console.log(`🟢 Bullish: ${snapshot.bullish_count}`);
console.log(`🔴 Bearish: ${snapshot.bearish_count}`);
console.log(`⚪ Neutral: ${snapshot.neutral_count}`);

// Get statistics for trends
const statsResponse = await fetch('http://localhost:8000/api/signals/daily-snapshots/stats?days=30');
const stats = await statsResponse.json();

console.log(`30-day trend: ${stats.trend}`);
console.log(`Average bullish: ${stats.avg_bullish}`);
```

## Timezone Notes

- The script is configured to capture at **5:00 PM Eastern Standard Time (EST)**
- Snapshots are stored with UTC timestamps
- The `snapshot_date` field is normalized to the 5pm EST time for consistency
- When querying by date, the API handles timezone conversion automatically

## Best Practices

1. **Run Daily**: Ensure the cron job/scheduled task runs every day without interruption
2. **Monitor Logs**: Regularly check logs for errors
3. **Database Backups**: Include `daily_signal_snapshots` collection in your MongoDB backups
4. **Storage Management**: Consider archiving very old snapshots (1+ year) if storage is a concern
5. **API Rate Limits**: When querying the API, use reasonable `limit` values to avoid overloading

## Support

If you encounter issues:
1. Check the logs first
2. Verify MongoDB is running and accessible
3. Test the script manually to see detailed error messages
4. Ensure all dependencies are installed: `pip install -r requirements.txt`

## Future Enhancements

Potential improvements to consider:
- Email notifications when capture completes
- Automatic anomaly detection (unusual signal patterns)
- Comparison charts showing signal changes over time
- Export to CSV/Excel functionality
- Machine learning predictions based on historical patterns
