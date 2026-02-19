# Daily Signal Capture - Automated Scheduling via App.py

The daily signal capture is now automatically scheduled when you start the FastAPI application. No need for separate cron jobs or Windows Task Scheduler!

## What Changed

The application now includes an integrated scheduler (APScheduler) that automatically runs the daily signal capture at **5:00 PM EST** every day while the server is running.

## Installation

1. **Install the new dependency**:
   ```bash
   cd "e:\Interactive Brokers\backend"
   pip install apscheduler
   ```

   Or install all requirements:
   ```bash
   pip install -r requirements.txt
   ```

## How It Works

When you start the FastAPI server ([app.py](e:\Interactive Brokers\backend\app.py)), it will:

1. ✅ Connect to MongoDB
2. ✅ Start the monitoring loop
3. ✅ **Schedule daily signal capture at 5:00 PM EST**
4. ✅ Send Telegram notifications when capture completes

### Startup Output

You'll see this in the console when the server starts:

```
✓ Daily signal capture scheduled
  Schedule: Every day at 5:00 PM EST
  Next run: 2026-02-20 05:00:00 PM EST
```

## Features

### Automatic Capture
- Runs at **5:00 PM EST** every day automatically
- No manual intervention needed
- Works as long as the server is running

### Telegram Notifications
When the capture completes, you'll receive a Telegram message with:
- 📅 Date of capture
- 🟢 Bullish signal count and percentage
- 🔴 Bearish signal count and percentage
- ⚪ Neutral signal count and percentage
- 📊 Total symbols monitored

Example:
```
📊 Daily Signal Snapshot Captured

📅 Date: 2026-02-20
⏰ Time: 5:00 PM EST

📈 Summary:
  🟢 Bullish: 45 (30.0%)
  🔴 Bearish: 30 (20.0%)
  ⚪ Neutral: 75 (50.0%)
  📊 Total: 150 symbols
```

### Error Handling
If the capture fails, you'll receive a notification:
```
⚠️ Daily Signal Capture Failed

Time: 2026-02-20 05:00:15 PM EST
Please check the logs for details.
```

## Starting the Server

Simply start the server as usual:

```bash
cd "e:\Interactive Brokers\backend"
python app.py
```

Or with uvicorn:

```bash
uvicorn app:app --host 0.0.0.0 --port 8000
```

## Manual Trigger

You can also manually trigger a capture at any time by running:

```bash
python capture_daily_signals.py
```

## Testing

To test the scheduled capture without waiting until 5pm:

### Option 1: Temporary Schedule Change
Modify the schedule in [app.py](e:\Interactive Brokers\backend\app.py#L196-L200) temporarily:

```python
# Change from:
trigger=CronTrigger(hour=17, minute=0, timezone=est_tz),

# To (for testing in 2 minutes):
trigger=CronTrigger(hour=datetime.now(est_tz).hour, minute=datetime.now(est_tz).minute + 2, timezone=est_tz),
```

### Option 2: Manual Run
Just run the capture script directly:
```bash
python capture_daily_signals.py
```

## Viewing Schedule Info

The scheduler stores information about the next run time. You can check it in the startup logs or add this endpoint to [app.py](e:\Interactive Brokers\backend\app.py):

```python
@app.get("/api/scheduler/status")
async def get_scheduler_status():
    """Get scheduler status and next run time"""
    job = scheduler.get_job('daily_signal_capture')
    if job:
        return {
            "scheduled": True,
            "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
            "job_name": job.name,
            "timezone": "US/Eastern"
        }
    return {"scheduled": False}
```

## Logs

The application logs show when captures run:

```
============================================================
🕰️  Running scheduled daily signal capture...
Time: 2026-02-20 05:00:00 PM EST
============================================================

🟢 EUR/USD   - BULLISH  (Strength: +2) | Buy: 3, Sell: 1
🔴 GBP/USD   - BEARISH  (Strength: -1) | Buy: 1, Sell: 2
...

============================================================
Summary:
  Total Symbols: 150
  🟢 Bullish: 45 (30.0%)
  🔴 Bearish: 30 (20.0%)
  ⚪ Neutral: 75 (50.0%)
============================================================

✓ Daily signal capture completed successfully!
✓ Telegram notification sent
============================================================
```

## Important Notes

### Server Must Be Running
⚠️ **The server must be running continuously for the scheduled capture to work.**

If the server is stopped:
- The capture won't run at 5pm
- No Telegram notification will be sent

### Alternative: Keep Using System Scheduler
If you can't keep the server running 24/7, use the system scheduler instead:
- **Windows**: [setup_daily_signal_task.bat](e:\Interactive Brokers\backend\setup_daily_signal_task.bat)
- **Linux**: [setup_daily_signal_cron.sh](e:\Interactive Brokers\backend\setup_daily_signal_cron.sh)

### Both Methods Work
You can use:
- **Integrated scheduler** (requires server running)
- **System scheduler** (independent of server)
- **Both** (redundant but safe - system will prevent duplicate snapshots for the same day)

## Troubleshooting

### Import Errors
If you see `Import "apscheduler" could not be resolved`:
```bash
pip install apscheduler
```

### Scheduler Not Starting
Check the startup logs for errors:
```bash
python app.py
```

Look for:
```
✓ Daily signal capture scheduled
```

### Wrong Timezone
The scheduler uses `US/Eastern` timezone. If you need a different timezone:

1. Find your timezone from [pytz list](https://gist.github.com/heyalexej/8bf688fd67d7199be4a1682b3eec7568)
2. Change in [app.py](e:\Interactive Brokers\backend\app.py#L193):
   ```python
   est_tz = pytz.timezone('US/Eastern')  # Change this
   ```

### Verifying Schedule
The next run time is shown on startup. Compare it with your system time:
```python
import pytz
from datetime import datetime

est = pytz.timezone('US/Eastern')
print(f"Current EST time: {datetime.now(est).strftime('%Y-%m-%d %I:%M:%S %p %Z')}")
```

## Benefits Over System Scheduler

✅ **No manual setup** - Just start the server  
✅ **Cross-platform** - Works on Windows, Linux, macOS  
✅ **Integrated logging** - All logs in one place  
✅ **Telegram notifications** - Automatic success/failure alerts  
✅ **Easy to modify** - Change schedule in code  
✅ **Debugging** - See exactly what happens in server logs  

## Migration from System Scheduler

If you already set up the system scheduler:

### Windows
Remove the scheduled task:
```batch
schtasks /delete /tn "TradingSignalsDailyCapture" /f
```

### Linux
Remove the cron job:
```bash
crontab -e
# Delete the line with capture_daily_signals.py
```

Then just rely on the integrated scheduler when running the server.
