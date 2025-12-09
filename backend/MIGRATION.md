# Migration Guide: Interactive Brokers → MASSIVE API

## Overview

This guide will help you migrate from the Interactive Brokers (IB Gateway) implementation to the new **MASSIVE API** (formerly Polygon.io) implementation.

## What Changed

### ✅ Removed (IB-specific)
- `ib_insync` library
- `IBMonitor` class
- IB Gateway connection management
- Complex threading for IB event loop
- `nest-asyncio` dependency
- Java/IBC automation requirements
- VNC/headless display configuration

### ✅ Added (MASSIVE API)
- `MassiveMonitor` class in `massive_monitor.py`
- `aiohttp` for async HTTP requests to MASSIVE REST API
- Environment-based configuration (.env file)
- Simplified connection model with API key authentication
- Direct REST API integration using **actual MASSIVE API endpoints**:
  - `/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}` - Real-time quotes
  - `/v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from}/{to}` - Historical OHLCV
  - `/v3/reference/tickers` - Symbol search

### ✅ Unchanged
- FastAPI application structure
- WebSocket real-time updates
- Telegram notifications
- Technical analysis calculations (EMA, RSI, MACD)
- Frontend HTML interface
- Watchlist persistence
- API endpoints (same routes)

## Migration Steps

### Step 1: Update Dependencies

```bash
# Uninstall old IB-related packages
pip uninstall ib_insync nest-asyncio -y

# Install new requirements
pip install -r requirements.txt
```

**New dependencies:**
- `aiohttp>=3.9.0` - Async HTTP client for MASSIVE API
- `python-dotenv>=1.0.0` - Environment variable management

### Step 2: Get MASSIVE API Key

1. **Sign up** at https://massive.com
2. **Navigate** to Dashboard → API Keys
3. **Create** a new API key
4. **Copy** the API key (format: `YOUR_KEY_HERE`)

**Note:** MASSIVE offers both free and paid tiers. Free tier includes:
- Real-time and historical stock data
- Limited requests per minute
- Suitable for personal projects

### Step 3: Configure Environment

```bash
# Create .env file
cp .env.example .env

# Edit .env and add your keys
nano .env
```

Add your MASSIVE API key:
```env
MASSIVE_API_KEY=YOUR_ACTUAL_API_KEY_HERE
TELEGRAM_BOT_TOKEN=your_telegram_bot_token  # Optional
TELEGRAM_CHAT_ID=your_telegram_chat_id      # Optional
```

### Step 4: Verify Configuration

```bash
# Test connection
python -c "
import os
from dotenv import load_dotenv
load_dotenv()
print('API Key:', os.getenv('MASSIVE_API_KEY')[:10] + '...' if os.getenv('MASSIVE_API_KEY') else 'NOT SET')
"
```

Expected output:
```
API Key: YOUR_API_K...
```

### Step 5: Start the Application

```bash
# Run the new backend
python app.py
```

You should see:
```
✓ Connected to MASSIVE API
✓ Loaded X symbols from watchlist.json
```

### Step 6: Verify Functionality

1. **Open frontend**: Open `index.html` in your browser
2. **Check connection**: Look for "Connected to MASSIVE API" status
3. **Search symbols**: Try searching for "AAPL" or "TSLA"
4. **Add to watchlist**: Add a symbol and verify it appears
5. **Check updates**: Wait for the 5-minute update cycle

## MASSIVE API Details

### Endpoint Examples

**1. Get real-time snapshot for AAPL:**
```
GET https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers/AAPL?apiKey=YOUR_KEY
```

**2. Get historical data for TSLA (last 365 days):**
```
GET https://api.massive.com/v2/aggs/ticker/TSLA/range/1/day/2023-01-01/2024-01-01?apiKey=YOUR_KEY
```

**3. Search for tickers matching "Apple":**
```
GET https://api.massive.com/v3/reference/tickers?search=Apple&market=stocks&apiKey=YOUR_KEY
```

### Response Format

All MASSIVE API responses follow this structure:
```json
{
  "status": "OK",
  "count": 1,
  "results": [...],
  "request_id": "abc123..."
}
```

### Rate Limits

- **Free tier**: ~5 requests per minute
- **Paid tier**: Higher limits depending on plan

**Tip:** The monitoring loop runs every 5 minutes by default, which respects free tier limits.

## Troubleshooting

### "MASSIVE API not connected" or "Authentication failed"

**Cause**: Missing, invalid, or incorrectly formatted API key

**Solution**:
```bash
# Check if .env exists
ls -la .env

# Verify API key is set (first 10 characters only)
python -c "import os; from dotenv import load_dotenv; load_dotenv(); print(os.getenv('MASSIVE_API_KEY')[:10] if os.getenv('MASSIVE_API_KEY') else 'NOT SET')"

# Test API key directly
curl "https://api.massive.com/v3/reference/tickers/AAPL?apiKey=YOUR_KEY"
```

If using systemd service, update the service file:
```ini
[Service]
EnvironmentFile=/path/to/backend/.env
```

### "ModuleNotFoundError: No module named 'ib_insync'"

**Cause**: Old code still importing IB modules

**Solution**:
```bash
# Make sure you're using the new code
git pull  # or update files manually

# Verify app.py imports massive_monitor
grep "massive_monitor" app.py

# Should see: from massive_monitor import MassiveMonitor
```

### "Connection timeout" or "HTTP 429 Too Many Requests"

**Cause**: MASSIVE API rate limiting

**Solution**:
- Check your MASSIVE API plan limits at https://massive.com/dashboard
- Reduce monitoring frequency (increase from 5 minutes to 15 minutes in `app.py`)
- Consider upgrading to paid tier if needed
- Verify network connectivity to api.massive.com

### Old watchlist.json symbols not working

**Cause**: Watchlist persisted from IB may have different symbol formats

**Solution**:
```bash
# Backup old watchlist
cp watchlist.json watchlist.json.backup

# Start fresh or manually verify symbols
rm watchlist.json

# Re-add symbols through the UI
```

## Code Changes Summary

### massive_monitor.py (NEW)
```python
class MassiveMonitor:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv('MASSIVE_API_KEY')
        self.base_url = "https://api.massive.io/v1"
        # ... rest of implementation
```

### app.py (UPDATED)
```python
# OLD (IB)
from ib_monitor import IBMonitor
monitor = IBMonitor()

# NEW (MASSIVE)
from massive_monitor import MassiveMonitor
monitor = MassiveMonitor(api_key=os.getenv('MASSIVE_API_KEY'))
```

## API Endpoint Compatibility

All API endpoints remain the same:

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /` | ✅ Same | Response includes `api_provider: "MASSIVE"` |
| `GET /api/watchlist` | ✅ Same | Identical response format |
| `POST /api/watchlist/add` | ✅ Same | Same request/response |
| `DELETE /api/watchlist/remove/{symbol}` | ✅ Same | No changes |
| `GET /api/symbols/search` | ✅ Same | May return different results based on MASSIVE database |
| `WS /ws` | ✅ Same | Identical WebSocket protocol |

## Configuration Comparison

### OLD (IB Gateway)
```python
monitor = IBMonitor(
    host='127.0.0.1',
    port=4002,
    client_id=2
)
```

### NEW (MASSIVE API)
```python
monitor = MassiveMonitor(
    api_key=os.getenv('MASSIVE_API_KEY')
)
```

## Deployment Changes

### OLD: DigitalOcean with IB Gateway
```bash
# Complex setup required:
1. Install Java
2. Install IB Gateway
3. Configure IBC
4. Set up VNC
5. Manual login daily
6. Configure systemd for multiple services
```

### NEW: DigitalOcean with MASSIVE API
```bash
# Simple setup:
1. Install Python dependencies
2. Set MASSIVE_API_KEY in .env
3. Run app.py
4. Configure systemd for one service
```

Much simpler! No Java, no GUI, no manual intervention.

## Performance Comparison

| Aspect | IB Gateway | MASSIVE API |
|--------|-----------|-------------|
| Setup time | 2-3 hours | 5 minutes |
| Login required | Daily (manual) | Never (API key) |
| Dependencies | Java, IBC, Xvfb, Python | Python only |
| Startup time | 60-120 seconds | 2-5 seconds |
| Memory usage | ~500MB (Gateway + Python) | ~100MB (Python only) |
| Maintenance | High (updates, restarts) | Low (just Python app) |

## Data Source Differences

### IB Gateway
- Real-time and delayed market data
- Requires active IB account
- Limited to IB's supported markets
- Complex data type handling (STK, CRYPTO, FOREX, etc.)

### MASSIVE API
- Depends on your MASSIVE subscription
- Broader market coverage (check MASSIVE docs)
- Simpler data format
- REST API (easier debugging)

## Rolling Back

If you need to roll back to IB Gateway:

```bash
# 1. Restore old code (if using git)
git checkout main  # or your IB branch

# 2. Reinstall IB dependencies
pip install ib_insync nest-asyncio

# 3. Restore IB configuration
# (restart IB Gateway, configure IBC, etc.)
```

## Next Steps

After successful migration:

1. ✅ Remove old IB Gateway installation (if on server)
2. ✅ Clean up Java/IBC configuration files
3. ✅ Update documentation/README
4. ✅ Test all watchlist functionality
5. ✅ Verify Telegram notifications work
6. ✅ Monitor for 24 hours to ensure stability
7. ✅ Update systemd service (if applicable)

## Support

If you encounter issues:

1. Check the logs: `tail -f /var/log/trading-monitor.log`
2. Verify API key: `echo $MASSIVE_API_KEY`
3. Test connection: `python -c "from massive_monitor import MassiveMonitor; import asyncio; m = MassiveMonitor(); asyncio.run(m.connect())"`
4. Check MASSIVE API status: Visit their status page

## Conclusion

The migration from IB Gateway to MASSIVE API significantly simplifies your infrastructure:

- **No more Java/IBC complexity**
- **No more manual daily logins**
- **No more VNC/headless display issues**
- **Faster startup and lower resource usage**
- **Easier deployment and maintenance**

Your trading signals and technical analysis remain exactly the same - just a cleaner, simpler backend!
