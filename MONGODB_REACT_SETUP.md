# Trading Monitor - MongoDB & React Setup

## 🎉 New Features

### ✅ MongoDB Integration
- **User Management**: Complete authentication system with JWT tokens
- **Login History**: Track all user login attempts with IP and user agent
- **API Call Logging**: Record every API call for analytics and debugging
- **Signal History**: Store all trading signals for backtesting
- **Watchlist Changes**: Track all watchlist modifications with user attribution

### ✅ React Frontend
- **Modern UI**: Built with React + Vite for fast development
- **Authentication**: Login and registration pages with JWT
- **Real-time Updates**: WebSocket integration for live data
- **User Dashboard**: Clean, professional interface for monitoring

---

## 🚀 Quick Start

### 1. Install MongoDB

**Windows:**
```bash
# Download from https://www.mongodb.com/try/download/community
# Or use Chocolatey:
choco install mongodb
```

**Start MongoDB:**
```bash
mongod --dbpath C:\data\db
```

### 2. Backend Setup

```bash
cd backend

# Install Python dependencies
pip install -r requirements.txt

# Copy environment file
copy .env.example .env

# Edit .env and add your API keys:
# - MASSIVE_API_KEY (from polygon.io)
# - JWT_SECRET_KEY (generate a random string)
# - MONGODB_URL (default: mongodb://localhost:27017)

# Start the backend server
python app.py
```

### 3. Frontend Setup

```bash
cd frontend

# Install Node.js dependencies
npm install

# Start development server
npm run dev
```

The frontend will be available at `http://localhost:3000`

---

## 📊 MongoDB Collections

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
- request_data, response_data, error

### Signals
Stores trading signals for backtesting:
- symbol, signal_type (EMA_CROSS_ABOVE/BELOW, RSI_OVERBOUGHT, etc.)
- timestamp, price, ema_200, rsi, macd
- details (additional metadata)

### Watchlist Changes
Tracks watchlist modifications:
- symbol, action (ADD/REMOVE)
- timestamp, user_id
- previous_data

---

## 🔐 Authentication

### Register a New User
```bash
POST /api/auth/register
{
  "username": "trader1",
  "email": "trader@example.com",
  "password": "securepass123",
  "full_name": "John Doe"
}
```

### Login
```bash
POST /api/auth/login
{
  "email": "trader@example.com",
  "password": "securepass123"
}

Response:
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJ...",
  "token_type": "bearer",
  "user": {
    "id": "...",
    "username": "trader1",
    "email": "trader@example.com"
  }
}
```

### Get Current User
```bash
GET /api/auth/me
Authorization: Bearer <token>
```

### Get Login History
```bash
GET /api/auth/login-history?limit=50
Authorization: Bearer <token>
```

---

## 🔧 Environment Variables

Create `backend/.env` from `.env.example`:

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

---

## 📈 Usage

1. **Start MongoDB**: `mongod`
2. **Start Backend**: `cd backend && python app.py`
3. **Start Frontend**: `cd frontend && npm run dev`
4. **Open Browser**: Navigate to `http://localhost:3000`
5. **Register/Login**: Create an account or sign in
6. **Start Trading**: Add symbols to your watchlist and monitor signals!

---

## 🎯 Features for Backtesting

All signals are automatically logged to MongoDB with:
- Symbol and signal type
- Price at signal time
- Technical indicators (EMA200, RSI, MACD)
- Timestamp for historical analysis

Query signals for backtesting:
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

## 🛠️ Development

**Backend**: Python + FastAPI + Motor (async MongoDB)
**Frontend**: React + Vite
**Database**: MongoDB
**Authentication**: JWT with bcrypt password hashing
**Real-time**: WebSocket for live updates

---

## 📝 Notes

- JWT tokens expire after 7 days
- All passwords are hashed with bcrypt
- MongoDB indexes are automatically created for performance
- API calls are logged asynchronously to avoid blocking requests
- Login attempts (both successful and failed) are tracked for security

---

## 🔒 Security

- Passwords are hashed using bcrypt
- JWT tokens are signed with HS256
- Failed login attempts are logged
- API call logging includes IP addresses
- CORS is configured for local development

For production:
1. Change `JWT_SECRET_KEY` to a strong random string
2. Configure CORS for your production domain
3. Use HTTPS for all connections
4. Consider MongoDB authentication
5. Set up rate limiting
