# Trading Monitor - Microservices Setup Guide

## 🏗️ Architecture Overview

This application uses a **microservices architecture** with three separate services:

### 1. **Auth Service** (Port 8001)
- User authentication & authorization
- JWT token management
- Login/registration
- User statistics
- History queries (signals, API calls, watchlist changes)

### 2. **Signal Processing Service** (Port 8000)
- Real-time market monitoring (1,214 symbols)
- EMA-200 signal generation
- Telegram notifications
- Watchlist management
- WebSocket real-time updates
- **No authentication overhead** - focused purely on signal processing

### 3. **Frontend** (Port 3000)
- React SPA with authentication
- Real-time dashboard
- Signal history viewer
- Watchlist management UI

## 🚀 Quick Start

### Option 1: Start All Services at Once (Windows)
```cmd
start-all.bat
```

### Option 2: Start Services Individually

#### 1. Start Auth Service
```bash
cd auth-service
python app.py
```
Service will run on: **http://localhost:8001**

#### 2. Start Signal Processing Service
```bash
cd backend
python app.py
```
Service will run on: **http://localhost:8000**

#### 3. Start Frontend
```bash
cd frontend
npm run dev
```
Frontend will run on: **http://localhost:3000**

## 📋 Prerequisites

### Python Dependencies
```bash
# For auth-service
cd auth-service
pip install -r requirements.txt

# For backend
cd ../backend
pip install -r requirements.txt
```

### Node.js Dependencies
```bash
cd frontend
npm install
```

### Environment Configuration

Copy `.env` settings to auth-service:
```bash
cd auth-service
copy ../backend/.env .env
```

Required environment variables:
- `MONGODB_URL` - MongoDB connection string
- `MONGODB_DB_NAME` - Database name (default: trading_monitor)
- `JWT_SECRET_KEY` - Secret key for JWT tokens
- `MASSIVE_API_KEY` - Polygon.io API key (backend only)
- `TELEGRAM_BOT_TOKEN` - Telegram bot token (backend only)
- `TELEGRAM_CHAT_ID` - Telegram chat ID (backend only)

## 🔧 Service Endpoints

### Auth Service (http://localhost:8001)

**Authentication:**
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login (returns JWT)
- `GET /auth/me` - Get current user
- `GET /auth/login-history` - Login history

**User Management:**
- `GET /users/me/stats` - User statistics

**History:**
- `GET /history/signals/{symbol}` - Signal history for symbol
- `GET /history/signals/recent` - Recent signals
- `GET /history/watchlist-changes` - Watchlist changes
- `GET /history/api-calls` - API call logs

### Signal Service (http://localhost:8000)

**Status:**
- `GET /` - Health check & status
- `WS /ws` - WebSocket for real-time updates

**Watchlist:**
- `GET /api/watchlist` - Get watchlist
- `POST /api/watchlist/add` - Add symbol
- `DELETE /api/watchlist/remove/{symbol}` - Remove symbol
- `POST /api/watchlist/scan-forex` - Scan forex pairs

**Configuration:**
- `GET /api/algorithm/config` - Algorithm settings
- `POST /api/algorithm/configure` - Update algorithm
- `GET /api/telegram/status` - Telegram status
- `POST /api/telegram/configure` - Configure Telegram

**Search:**
- `GET /api/symbols/search?query={query}` - Search symbols

## 📊 Data Flow

### Authentication Flow
1. User registers/logs in → **Auth Service (8001)**
2. Receives JWT token
3. Token stored in frontend localStorage
4. All subsequent requests include JWT in Authorization header

### Trading Flow
1. User adds symbol → **Signal Service (8000)**
2. Signal service monitors symbol
3. Generates signals → Stores in MongoDB
4. Broadcasts via WebSocket → Frontend updates real-time

### History Queries
1. User clicks symbol → **Frontend**
2. Requests history → **Auth Service (8001)**
3. Auth service queries MongoDB
4. Returns signal history → Frontend displays modal

## 💡 Benefits

### 1. **Performance**
- Signal processing runs without authentication overhead
- No JWT validation on every signal calculation
- Faster response times for market monitoring

### 2. **Scalability**
- Services can scale independently
- Auth service can handle 10x users without affecting signal processing
- Signal service can monitor 10x symbols without affecting auth

### 3. **Reliability**
- Auth service failure doesn't stop signal monitoring
- Signal service issues don't block user login
- Independent deployment and updates

### 4. **Security**
- Centralized authentication logic
- Clear separation of concerns
- Easier to audit and secure

### 5. **Maintainability**
- Smaller, focused codebases
- Easier to debug and test
- Clear API boundaries

## 🔍 Monitoring

### Check Service Health

```bash
# Auth Service
curl http://localhost:8001/health

# Signal Service
curl http://localhost:8000/
```

### View Logs

Each service runs in its own terminal/window with dedicated logging:
- **Auth Service**: User authentication events, API calls
- **Signal Service**: Signal generation, batch processing, Telegram notifications
- **Frontend**: React dev server, build warnings

## 🐛 Troubleshooting

### Auth Service Won't Start
1. Check MongoDB connection in `.env`
2. Verify port 8001 is not in use: `netstat -ano | findstr :8001`
3. Check Python dependencies: `pip list`

### Signal Service Won't Connect to Auth
- Services communicate via MongoDB (shared database)
- No direct HTTP communication needed between services

### Frontend Can't Connect
1. Verify both auth and signal services are running
2. Check browser console for CORS errors
3. Confirm API URLs in `frontend/src/api/api.js`:
   - `AUTH_API_URL`: http://localhost:8001
   - `TRADING_API_URL`: http://localhost:8000

### MongoDB Connection Issues
1. Verify `MONGODB_URL` in `.env`
2. Check network connectivity to MongoDB
3. Ensure database user has proper permissions

## 📈 Performance Tips

### For High-Volume Trading
1. Increase MongoDB connection pool size
2. Add Redis cache for frequently accessed data
3. Use message queue (RabbitMQ/Redis) for signal distribution

### For Many Users
1. Deploy multiple auth service instances behind load balancer
2. Use session storage (Redis) instead of JWT
3. Implement rate limiting

### For Many Symbols
1. Increase batch size in signal processing
2. Add worker processes for parallel processing
3. Use time-series database for historical data

## 🔐 Security Considerations

1. **JWT Tokens**: Set appropriate expiration times
2. **CORS**: Configure allowed origins in production
3. **Rate Limiting**: Add to auth service endpoints
4. **API Keys**: Store securely, rotate regularly
5. **MongoDB**: Use connection string with authentication
6. **HTTPS**: Use in production (not HTTP)

## 📦 Deployment

### Docker Compose (Recommended)
```yaml
version: '3.8'
services:
  auth-service:
    build: ./auth-service
    ports:
      - "8001:8001"
    environment:
      - MONGODB_URL=${MONGODB_URL}
  
  signal-service:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - MONGODB_URL=${MONGODB_URL}
      - MASSIVE_API_KEY=${MASSIVE_API_KEY}
  
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - auth-service
      - signal-service
```

### Cloud Deployment
- **Auth Service**: Heroku, AWS Lambda, Google Cloud Run
- **Signal Service**: AWS EC2, Digital Ocean Droplet (needs persistent connection)
- **Frontend**: Vercel, Netlify, CloudFlare Pages
- **MongoDB**: MongoDB Atlas, AWS DocumentDB

## 🎯 Next Steps

1. ✅ Services are now separated
2. 📝 Test all endpoints
3. 🔒 Add rate limiting to auth service
4. 📊 Add monitoring/metrics (Prometheus, Grafana)
5. 🐳 Create Docker containers
6. 🚀 Deploy to cloud
7. 📱 Add mobile app (same auth service)
