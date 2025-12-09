# Trading Signal Monitor - MASSIVE API Version

A real-time stock monitoring and trading signal system using **MASSIVE API** (formerly Polygon.io) for market data.

## Features

- ✅ Real-time stock price monitoring via **MASSIVE API**
- ✅ Technical analysis (EMA200, RSI, MACD)
- ✅ WebSocket-based live updates
- ✅ Telegram notifications for trading signals
- ✅ Customizable watchlist
- ✅ Symbol search functionality
- ✅ Automatic signal generation (BULLISH/BEARISH/NEUTRAL)

## Migration from Interactive Brokers

This version replaces the Interactive Brokers (IB Gateway) integration with **MASSIVE API**, eliminating the need for:
- Manual IB Gateway login
- Complex IB infrastructure setup
- VNC or headless display configuration
- Java/IBC automation

## Prerequisites

- Python 3.8+
- **MASSIVE API account** (get free or paid plan at https://massive.com)
- **MASSIVE API key** (from https://massive.com/dashboard/api-keys)
- (Optional) Telegram bot for notifications

## Installation

1. **Clone or navigate to the backend directory**
   ```bash
   cd backend
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Get your MASSIVE API key**
   - Sign up at https://massive.com
   - Navigate to Dashboard → API Keys
   - Create a new API key
   - Copy the key (starts with your account ID)

4. **Configure API keys**
   
   Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your API keys:
   ```env
   MASSIVE_API_KEY=YOUR_ACTUAL_API_KEY_HERE
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token  # Optional
   TELEGRAM_CHAT_ID=your_telegram_chat_id      # Optional
   ```

## MASSIVE API Endpoints Used

This application uses the following **actual MASSIVE API endpoints**:

### 1. **Ticker Snapshot** (Real-time quotes)
```
GET /v2/snapshot/locale/us/markets/stocks/tickers/{ticker}
```
**Docs:** https://massive.com/docs/stocks/get_v2_snapshot_locale_us_markets_stocks_tickers__stocksticker

Returns current price, bid, ask, volume, and last trade information.

### 2. **Historical Aggregates** (OHLCV bars)
```
GET /v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from}/{to}
```
**Docs:** https://massive.com/docs/stocks/get_v2_aggs_ticker__stocksticker__range__multiplier___timespan___from___to

Example: `/v2/aggs/ticker/AAPL/range/1/day/2023-01-01/2024-01-01`

Returns historical OHLCV data for technical indicator calculations.

### 3. **Ticker Search**
```
GET /v3/reference/tickers?search={query}&market=stocks
```
**Docs:** https://massive.com/docs/stocks/get_v3_reference_tickers

Searches for stock tickers by symbol or company name.

### 4. **Authentication**
All requests include API key as query parameter:
```
?apiKey=YOUR_API_KEY
```
Or alternatively as Authorization header:
```
Authorization: Bearer YOUR_API_KEY
```

## Running the Application

### Development Mode

```bash
python app.py
```

The API will be available at `http://localhost:8000`

### Production Mode with Uvicorn

```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --workers 4
```

### Using Docker (Optional)

```bash
docker build -t trading-monitor .
docker run -p 8000:8000 --env-file .env trading-monitor
```

## API Endpoints

### Core Endpoints

- `GET /` - Health check and status
- `GET /api/watchlist` - Get current watchlist with signals
- `POST /api/watchlist/add` - Add symbol to watchlist
- `DELETE /api/watchlist/remove/{symbol}` - Remove symbol from watchlist
- `GET /api/symbols/search?query={query}` - Search for symbols
- `WS /ws` - WebSocket for real-time updates

### Algorithm Configuration

- `GET /api/algorithm/config` - Get current algorithm settings
- `POST /api/algorithm/configure` - Update algorithm parameters

### Telegram Configuration

- `GET /api/telegram/status` - Check Telegram configuration status
- `POST /api/telegram/configure` - Configure Telegram notifications

## API Request Examples

### Add Symbol to Watchlist

```bash
curl -X POST http://localhost:8000/api/watchlist/add \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "exchange": "US",
    "currency": "USD",
    "sec_type": "STK"
  }'
```

### Search for Symbols

```bash
curl "http://localhost:8000/api/symbols/search?query=TESLA"
```

### Configure Algorithm

```bash
curl -X POST http://localhost:8000/api/algorithm/configure \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "rsi_overbought": 70,
    "rsi_oversold": 30,
    "macd_enabled": true,
    "rsi_enabled": true
  }'
```

## Frontend Integration

The frontend (index.html) will automatically connect to the backend via WebSocket and display real-time updates. No changes are needed to the frontend - it will work seamlessly with the new MASSIVE API backend.

## Technical Indicators

### EMA200 (200-day Exponential Moving Average)
- Shows long-term trend
- Price > EMA200 = Bullish trend
- Price < EMA200 = Bearish trend

### RSI (Relative Strength Index)
- Measures momentum
- RSI > 70 = Overbought (potential sell signal)
- RSI < 30 = Oversold (potential buy signal)

### MACD (Moving Average Convergence Divergence)
- Trend-following momentum indicator
- MACD crossing above signal line = Bullish
- MACD crossing below signal line = Bearish

## Signal Generation Logic

Signals are generated every 5 minutes based on:

1. **BULLISH Signal**: More bullish than bearish indicators
   - Price > EMA200
   - RSI < 30 (oversold)
   - MACD histogram > 0

2. **BEARISH Signal**: More bearish than bullish indicators
   - Price < EMA200
   - RSI > 70 (overbought)
   - MACD histogram < 0

3. **NEUTRAL Signal**: Mixed or unclear signals

## Monitoring Loop

The backend automatically:
- Updates all watchlist symbols every 5 minutes
- Calculates technical indicators
- Generates trading signals
- Broadcasts updates via WebSocket
- Sends Telegram notifications for signal changes

## Troubleshooting

### Connection Issues

If you see "MASSIVE API not connected":
1. Check your `.env` file has the correct API key
2. Verify your MASSIVE API account is active
3. Check network connectivity
4. Review API rate limits

### No Data for Symbols

- Ensure the symbol is valid and available on MASSIVE API
- Check that you have the correct exchange/market specified
- Some symbols may require specific subscription levels

### WebSocket Disconnections

- The frontend automatically reconnects on disconnection
- Check for firewall/proxy issues
- Verify the backend is running and accessible

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MASSIVE_API_KEY` | Yes | Your MASSIVE API key |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token for notifications |
| `TELEGRAM_CHAT_ID` | No | Your Telegram chat ID |

## Development

### Project Structure

```
backend/
├── app.py                 # FastAPI application and API routes
├── massive_monitor.py     # MASSIVE API integration and data handling
├── telegram_bot.py        # Telegram notification service
├── requirements.txt       # Python dependencies
├── watchlist.json        # Persisted watchlist (auto-created)
├── .env                  # Configuration (create from .env.example)
└── .env.example          # Template for environment variables
```

### Adding New Indicators

To add custom indicators, modify `massive_monitor.py`:

1. Add calculation function (e.g., `calculate_my_indicator()`)
2. Update `calculate_signals()` to include your indicator
3. Modify signal logic to incorporate the new indicator

## Deployment

### DigitalOcean/Cloud Deployment

1. **Set up server**
   ```bash
   ssh root@your-server-ip
   apt update && apt upgrade -y
   apt install -y python3 python3-pip
   ```

2. **Clone and setup**
   ```bash
   git clone your-repo
   cd backend
   pip3 install -r requirements.txt
   ```

3. **Configure environment**
   ```bash
   nano .env  # Add your API keys
   ```

4. **Run as a service**
   Create `/etc/systemd/system/trading-monitor.service`:
   ```ini
   [Unit]
   Description=Trading Signal Monitor
   After=network.target

   [Service]
   Type=simple
   User=root
   WorkingDirectory=/root/backend
   Environment="PATH=/usr/local/bin:/usr/bin:/bin"
   ExecStart=/usr/bin/python3 app.py
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

   Enable and start:
   ```bash
   systemctl daemon-reload
   systemctl enable trading-monitor
   systemctl start trading-monitor
   systemctl status trading-monitor
   ```

## License

MIT License - Feel free to use and modify as needed.

## Support

For issues related to:
- **MASSIVE API**: Contact MASSIVE support or check their documentation
- **This application**: Open an issue on the project repository
