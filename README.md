# 📊 Trading Signal Monitor

A comprehensive real-time trading signal monitoring system with MongoDB persistence, user authentication, and React-based dashboard. Monitor EMA crossovers, RSI, and MACD indicators across multiple assets with Telegram notifications.

## 🌟 Features

### Core Features
- **Real-time Monitoring**: Continuous batch processing of watchlist symbols
- **Technical Indicators**: EMA200, RSI, MACD calculations
- **Signal Detection**: Automatic detection of bullish/bearish EMA crossovers
- **WebSocket Updates**: Live data streaming to frontend

### MongoDB Integration
- **User Management**: Complete authentication with JWT tokens
- **Login History**: Track all login attempts with IP and timestamps
- **API Call Logging**: Record every API call for analytics
- **Signal History**: Store all trading signals for backtesting
- **Watchlist Tracking**: Monitor all watchlist changes with user attribution

### Authentication & Security
- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: Bcrypt password encryption
- **User Sessions**: Track user activity and login history
- **Protected Routes**: Role-based access control

### Modern React Frontend
- **Login/Register**: Complete authentication UI
- **User Dashboard**: Clean, professional interface
- **Real-time Updates**: WebSocket integration
- **Symbol Search**: Quick search and add to watchlist
- **Responsive Design**: Mobile-friendly interface

### Data Provider
- **MASSIVE API (Polygon.io)**: Professional market data
- **5-minute Candles**: Accurate EMA200 calculations
- **Multiple Asset Classes**: Stocks, Forex, Crypto support

### Notifications
- **Telegram Integration**: Instant signal notifications
- **Batch Processing**: Efficient monitoring of large watchlists
- **Customizable Alerts**: Configure your notification preferences

---

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- Node.js 16+
- MongoDB 4.4+
- MASSIVE API key (from [Polygon.io](https://polygon.io))

### Installation

**Windows:**
```bash
setup.bat
```

**Linux/Mac:**
```bash
chmod +x setup.sh
./setup.sh
```

### Manual Setup

1. **Install MongoDB**
   ```bash
   # Windows (using Chocolatey)
   choco install mongodb
   
   # Mac
   brew install mongodb-community
   
   # Start MongoDB
   mongod --dbpath C:\data\db  # Windows
   mongod --dbpath /data/db    # Linux/Mac
   ```

2. **Backend Setup**
   ```bash
   cd backend
   pip install -r requirements.txt
   cp .env.example .env
   # Edit .env with your API keys
   python app.py
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Access the Application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

---

## 🔧 Configuration

### Backend Environment (`.env`)

```env
# MASSIVE API (Required)
MASSIVE_API_KEY=your_polygon_api_key

# MongoDB (Required)
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=trading_monitor

# JWT Secret (Required - Generate a random string!)
JWT_SECRET_KEY=your-super-secret-jwt-key-change-this

# Telegram (Optional)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Watchlist File
WATCHLIST_FILE=watchlist.json
```

### Frontend Environment (`.env`)

```env
VITE_API_URL=http://localhost:8000
```

---

## 📖 Usage

### 1. Register/Login
- Navigate to http://localhost:3000
- Create a new account or login
- Your login history will be tracked automatically

### 2. Add Symbols to Watchlist
- Use the search bar to find symbols
- Click on a symbol to add it to your watchlist
- Supports stocks, forex pairs, and more

### 3. Monitor Signals
- View real-time price updates
- See EMA200 calculations and differences
- Get instant alerts on crossovers

### 4. Configure Telegram (Optional)
- Create a Telegram bot via @BotFather
- Get your chat ID
- Add credentials in Settings panel

---

## 🗄️ MongoDB Collections

### Users
Stores user account information:
- username, email, hashed_password
- full_name, is_active
- created_at, last_login

### Login History
Tracks all login attempts:
- user_id, email, login_time
- ip_address, user_agent, success

### API Calls
Logs all API requests:
- user_id, endpoint, method, status_code
- timestamp, duration_ms, ip_address

### Signals
Stores trading signals for backtesting:
- symbol, signal_type, timestamp
- price, ema_200, rsi, macd
- details (additional metadata)

### Watchlist Changes
Tracks watchlist modifications:
- symbol, action (ADD/REMOVE)
- timestamp, user_id

---

## 🔐 API Endpoints

### Authentication
```bash
POST /api/auth/register     # Register new user
POST /api/auth/login        # Login and get JWT token
GET  /api/auth/me           # Get current user info
GET  /api/auth/login-history # Get login history
```

### Trading
```bash
GET    /api/symbols/search         # Search symbols
GET    /api/watchlist              # Get watchlist
POST   /api/watchlist/add          # Add to watchlist
DELETE /api/watchlist/remove/{symbol} # Remove from watchlist
GET    /api/algorithm/config       # Get algorithm settings
POST   /api/algorithm/configure    # Update algorithm settings
```

### WebSocket
```bash
WS /ws  # Real-time updates
```

---

## 📊 Backtesting

All signals are automatically stored in MongoDB for backtesting:

```javascript
// Get all signals for a symbol
db.signals.find({ symbol: "AAPL" }).sort({ timestamp: -1 })

// Get signals in a date range
db.signals.find({
  timestamp: {
    $gte: ISODate("2024-01-01"),
    $lte: ISODate("2024-12-31")
  }
})

// Get all bullish crosses
db.signals.find({ signal_type: "EMA_CROSS_ABOVE" })
```

---

## 🛠️ Tech Stack

**Backend:**
- Python 3.8+
- FastAPI (Web framework)
- Motor (Async MongoDB driver)
- PyMongo (MongoDB ORM)
- Python-JOSE (JWT handling)
- Passlib (Password hashing)
- Polygon API Client (Market data)

**Frontend:**
- React 18
- Vite (Build tool)
- React Router (Routing)
- Axios (HTTP client)
- Recharts (Charts - optional)

**Database:**
- MongoDB 4.4+

**External APIs:**
- MASSIVE API / Polygon.io (Market data)
- Telegram Bot API (Notifications)

---

## 📁 Project Structure

```
Interactive Brokers/
├── backend/
│   ├── app.py                 # FastAPI application
│   ├── massive_monitor.py     # Market data monitoring
│   ├── database.py            # MongoDB connection
│   ├── models.py              # Pydantic models
│   ├── auth.py                # Authentication utilities
│   ├── telegram_bot.py        # Telegram integration
│   ├── requirements.txt       # Python dependencies
│   └── .env.example          # Environment template
├── frontend/
│   ├── src/
│   │   ├── api/              # API client
│   │   ├── context/          # React context (Auth)
│   │   ├── pages/            # Login, Register, Dashboard
│   │   ├── App.jsx           # Main app component
│   │   └── main.jsx          # Entry point
│   ├── package.json          # Node dependencies
│   ├── vite.config.js        # Vite configuration
│   └── .env.example          # Environment template
├── MONGODB_REACT_SETUP.md    # Detailed setup guide
├── setup.bat                 # Windows setup script
├── setup.sh                  # Linux/Mac setup script
└── README.md                 # This file
```

---

## 🔒 Security Best Practices

- All passwords are hashed with bcrypt
- JWT tokens expire after 7 days
- Failed login attempts are logged
- API calls include IP tracking
- CORS configured for local development

**For Production:**
1. Change `JWT_SECRET_KEY` to a strong random string
2. Configure CORS for your production domain
3. Use HTTPS for all connections
4. Enable MongoDB authentication
5. Set up rate limiting
6. Use environment-specific configurations

---

## 📝 Development

### Backend Development
```bash
cd backend
python app.py  # Starts on port 8000
```

### Frontend Development
```bash
cd frontend
npm run dev    # Starts on port 3000
```

### Build for Production
```bash
cd frontend
npm run build  # Creates dist/ folder
```

---

## 🐛 Troubleshooting

**MongoDB Connection Failed:**
- Ensure MongoDB is running: `mongod`
- Check MONGODB_URL in .env

**API Key Errors:**
- Verify MASSIVE_API_KEY in backend/.env
- Check quota at polygon.io dashboard

**Frontend Not Loading:**
- Ensure backend is running on port 8000
- Check VITE_API_URL in frontend/.env

**Authentication Issues:**
- Clear browser localStorage
- Check JWT_SECRET_KEY in backend/.env
- Verify token hasn't expired

---

## 📄 License

This project is for educational and personal use.

---

## 🙏 Acknowledgments

- MASSIVE API / Polygon.io for market data
- FastAPI for the excellent web framework
- React team for the UI library
- MongoDB for the database

---

## 📞 Support

For issues and questions:
1. Check MONGODB_REACT_SETUP.md for detailed setup
2. Review MongoDB collections and indexes
3. Check backend logs for errors
4. Verify all environment variables are set

---

**Happy Trading! 📈**

# Display results
fetcher.display_latest_data(df, rows=10)

# Disconnect
fetcher.disconnect()
```

## Technical Indicators

### MACD (Moving Average Convergence Divergence)

- **MACD Line**: 12-period EMA - 26-period EMA
- **Signal Line**: 9-period EMA of MACD
- **Histogram**: MACD - Signal

**Interpretation:**

- MACD > Signal: Bullish
- MACD < Signal: Bearish

### RSI (Relative Strength Index)

- Period: 14
- Range: 0-100

**Interpretation:**

- RSI > 70: Overbought
- RSI < 30: Oversold
- 30-70: Neutral

## Output

The script will:

1. Connect to IB Gateway
2. Fetch historical data
3. Calculate MACD and RSI
4. Display latest 10 data points
5. Save data to CSV file (e.g., `AAPL_data.csv`)

## Troubleshooting

**Connection Failed:**

- Ensure IB Gateway is running
- Check API is enabled in settings
- Verify port is 7497 (paper) or 7496 (live)

**No Data Received:**

- Check symbol is valid
- Ensure market data subscription is active
- Try using delayed data if real-time is not available
