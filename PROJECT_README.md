# 🚀 IB Signal Monitor - Full Stack Application

Real-time trading signal monitoring system with Interactive Brokers integration, MACD/RSI analysis, and Telegram notifications.

## 📋 Features

✅ **Real-time Symbol Monitoring** - Add stocks to watchlist and monitor continuously  
✅ **Technical Analysis** - Automatic MACD and RSI calculation  
✅ **Trading Signals** - Bullish/Bearish/Neutral signals based on indicators  
✅ **Live Updates** - WebSocket-powered real-time UI updates  
✅ **Telegram Notifications** - Get instant alerts when signals change  
✅ **Modern UI** - Beautiful, responsive web interface

## 🏗️ Architecture

```
Frontend (Port 3000) ←→ Backend (Port 8000) ←→ IB Gateway (Port 4002)
         ↓                      ↓
    WebSocket Updates    Telegram Bot API
```

## 📦 Installation

### 1. Backend Setup

```bash
cd "e:\Interactive Brokers\backend"

# Install Python dependencies
pip install -r requirements.txt
```

### 2. Frontend Setup

The frontend is a single HTML file - no installation needed!

## 🚀 Running the Application

### Step 1: Start IB Gateway/TWS

1. Open **IB Gateway** or **TWS**
2. Login with your paper trading account
3. Make sure API is enabled (Settings → API → Enable ActiveX and Socket Clients)
4. Verify port is **4002**

### Step 2: Start Backend Server

```bash
cd "e:\Interactive Brokers\backend"
python app.py
```

The backend will start on **http://localhost:8000**

You should see:

```
✓ IB Monitor connected successfully
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### Step 3: Open Frontend

Simply open the HTML file in your browser:

**Option A: Double-click**

- Navigate to `e:\Interactive Brokers\frontend\index.html`
- Double-click to open in your default browser

**Option B: Using a local server (recommended)**

```bash
cd "e:\Interactive Brokers\frontend"

# Python 3
python -m http.server 3000

# Then open: http://localhost:3000
```

## 🎯 Usage Guide

### Adding Symbols to Watchlist

1. Type symbol name in the search box (e.g., "AAPL", "TSLA")
2. Click on a result to add it to your watchlist
3. The system will automatically fetch data and calculate indicators

### Understanding Signals

- **🟢 BULLISH** - MACD above signal line, RSI not overbought
- **🔴 BEARISH** - MACD below signal line, RSI not oversold
- **⚪ NEUTRAL** - Mixed signals or disabled algorithm

### Configuring the Algorithm

1. Go to **Settings** panel
2. Adjust RSI thresholds:
   - **Overbought**: Default 70 (signals potential sell)
   - **Oversold**: Default 30 (signals potential buy)
3. Click **Save Algorithm**

### Setting Up Telegram Notifications

#### Step 1: Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` command
3. Follow instructions to create your bot
4. Copy the **Bot Token** (e.g., `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)

#### Step 2: Get Your Chat ID

1. Search for **@userinfobot** in Telegram
2. Start a chat with it
3. It will send you your **Chat ID** (e.g., `123456789`)

#### Step 3: Configure in UI

1. In the frontend, go to **Settings → Telegram Notifications**
2. Enter your **Bot Token**
3. Enter your **Chat ID**
4. Click **Save Telegram**
5. You should receive a test message!

### How It Works

1. **Background Monitoring**: Backend checks all watchlist symbols every 30 seconds
2. **Signal Detection**: When MACD or RSI crosses thresholds, signal changes
3. **Real-time Updates**: UI updates instantly via WebSocket
4. **Telegram Alerts**: You receive notifications when signals change

## 📊 API Endpoints

### Watchlist Management

- `POST /api/watchlist/add` - Add symbol
- `DELETE /api/watchlist/remove/{symbol}` - Remove symbol
- `GET /api/watchlist` - Get all symbols with current data

### Symbol Search

- `GET /api/symbols/search?query=AAPL` - Search symbols

### Algorithm Configuration

- `POST /api/algorithm/configure` - Update settings
- `GET /api/algorithm/config` - Get current settings

### Telegram Configuration

- `POST /api/telegram/configure` - Set bot token and chat ID
- `GET /api/telegram/status` - Check configuration status

### WebSocket

- `WS /ws` - Real-time updates stream

## 🔧 Troubleshooting

### Backend won't connect to IB

**Error**: `Connection refused`

**Solution**:

1. Make sure IB Gateway/TWS is running and logged in
2. Check API is enabled in settings
3. Verify port is 4002 in both IB settings and `ib_monitor.py`

### Frontend can't connect to backend

**Error**: `Failed to fetch` or CORS errors

**Solution**:

1. Make sure backend is running on port 8000
2. Check console for error messages
3. Try running frontend via HTTP server instead of file://

### No Telegram notifications

**Solution**:

1. Verify bot token is correct
2. Make sure you started a chat with the bot first (send `/start`)
3. Verify chat ID is correct (use @userinfobot)
4. Check backend logs for Telegram errors

### Signals not updating

**Solution**:

1. Check if IB Gateway is still connected
2. Verify watchlist symbols are valid
3. Look at browser console for WebSocket errors
4. Restart backend server

## 📁 Project Structure

```
e:\Interactive Brokers\
├── backend\
│   ├── app.py              # FastAPI server
│   ├── ib_monitor.py       # IB data fetcher & monitoring
│   ├── telegram_bot.py     # Telegram integration
│   └── requirements.txt    # Python dependencies
├── frontend\
│   └── index.html          # Web UI (standalone)
├── ib_data_fetcher.py      # Original standalone script
└── README.md               # This file
```

## 🎨 Customization

### Changing Update Frequency

Edit `backend/app.py`, line ~185:

```python
# Update every 30 seconds (default)
await asyncio.sleep(30)

# Change to 60 seconds
await asyncio.sleep(60)
```

### Adding More Indicators

Edit `backend/ib_monitor.py` to add your own indicators in the `calculate_*` methods.

### Styling the UI

Edit `frontend/index.html` CSS section to customize colors, fonts, and layout.

## 🔒 Security Notes

- Never share your Telegram bot token
- Keep your IB credentials secure
- Backend runs on localhost only (not exposed to internet)
- Consider using environment variables for sensitive config in production

## 📝 License

This is a personal trading tool. Use at your own risk. Not financial advice!

## 🤝 Support

For issues:

1. Check IB Gateway connection
2. Review backend logs
3. Check browser console for frontend errors

---

**Happy Trading! 📈**
