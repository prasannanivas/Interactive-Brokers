# Trading Monitor - Architecture Overview

## Service Architecture

### 1. Data Service (Port 8001) - Lightweight
**Purpose**: Handle authentication, authorization, history queries, and backtesting data  
**Location**: `/auth-service/` (to be renamed to `/data-service/`)  
**Authentication Endpoints**:
- `POST /auth/register` - User registration
- `POST /auth/login` - User login (returns JWT token)
- `GET /auth/me` - Get current user info
- `GET /auth/login-history` - Get user login history
- `GET /users/me/stats` - Get user statistics

**History Endpoints**:
- `GET /api/history/signals/{symbol}` - Get signal history for a symbol
- `GET /api/history/signals/recent` - Get recent signals
- `GET /api/history/watchlist-changes` - Get watchlist modification history

**Backtesting Endpoints**:
- `GET /api/backtesting/signal-batches` - Get paginated batch list
- `GET /api/backtesting/signal-batches/{batch_id}` - Get batch details
- `GET /api/backtesting/statistics` - Get aggregate statistics

**Performance Optimized**:
- No batch processing load (read-only queries)
- Optimized database queries with indexes
- Fast response times (<100ms for auth, <200ms for data queries)
- Lightweight memory footprint

**Dependencies**:
- Shares MongoDB connection with signal processing backend
- Uses shared `database.py`, `models.py`, `auth.py` modules from backend

### 2. Signal Processing Service (Port 8000) - Heavy Workload
**Purpose**: Monitor markets, generate signals, manage watchlist, provide data  
**Location**: `/backend/`  
**Responsibilities**:
- Monitor 1,214+ symbols in batches
- Calculate EMA-200 and generate signals
- Send Telegram notifications
- Store signals and batches in MongoDB
- Manage watchlist (add/remove symbols)
- WebSocket real-time updates
- **History queries** (moved from auth service)
- **Backtesting data** (moved from auth service)

**Endpoints**:
- `GET /` - Health check & status
- `GET /api/watchlist` - Get current watchlist
- `POST /api/watchlist/add` - Add symbol
- `DELETE /api/watchlist/remove/{symbol}` - Remove symbol
- `POST /api/watchlist/scan-forex` - Scan forex pairs
- `GET /api/symbols/search` - Search symbols
- `GET /api/algorithm/config` - Get algorithm settings
- `POST /api/algorithm/configure` - Update algorithm
- `GET /api/telegram/status` - Telegram status
- `POST /api/telegram/configure` - Configure Telegram
- `WS /ws` - WebSocket for real-time updates

### 3. Frontend (Port 3000)
**Purpose**: React UI for users  
**Location**: `/frontend/`  
**Configuration**:
- Data Service API Base URL: `http://localhost:8001` (auth, history, backtesting)
- Signal Processing API Base URL: `http://localhost:8000` (watchlist, real-time signals)

## Data Flow

### Authentication Flow:
1. User registers/logs in → Data Service (8001)
2. Data Service validates → Returns JWT token
3. Frontend stores token in localStorage
4. Future requests include token in Authorization header

### Trading Flow:
1. Frontend requests watchlist → Signal Processing Service (8000)
2. Signal Processing Service runs batch monitoring in background
3. Signals generated → Stored in MongoDB
4. WebSocket broadcasts updates → Frontend receives real-time data

### History Queries:
1. User clicks symbol → Frontend requests history
2. Request goes to **Data Service (8001)**
3. Data Service queries MongoDB → Returns signal history
4. Frontend displays in modal

### Backtesting Queries:
1. User requests backtesting data → Frontend calls Data Service (8001)
2. Data Service queries `signal_batches` collection
3. Returns batch data with crossover statistics
4. Frontend displays charts and analytics

## Benefits of This Architecture

1. **Performance**: Data service stays lightweight, only handles read queries
2. **Scalability**: Services can scale independently based on workload
3. **Separation of Concerns**: Data queries vs. signal processing
4. **Maintainability**: Easier to debug and update each service
5. **Reliability**: Data service failure doesn't stop signal monitoring
6. **Speed**: Read-only queries isolated from CPU-intensive batch processing

## Starting the Services

### Data Service (Auth & Queries):
```bash
cd auth-service
python app.py  # Runs on port 8001
```

### Signal Processing Service:
```bash
cd backend
python app.py  # Runs on port 8000
```

### Frontend:
```bash
cd frontend
npm run dev  # Runs on port 3000
```

## Environment Variables

Both services share the same MongoDB connection:
- `MONGODB_URL` - MongoDB connection string
- `MONGODB_DB_NAME` - Database name (default: trading_monitor)
- `JWT_SECRET_KEY` - Secret for JWT tokens
- `MASSIVE_API_KEY` - Polygon.io API key (signal service only)
- `TELEGRAM_BOT_TOKEN` - Telegram bot token (signal service only)
- `TELEGRAM_CHAT_ID` - Telegram chat ID (signal service only)
