"""
Data Service (formerly Auth Service)
Handles: Authentication, authorization, history queries, backtesting data
Runs on: Port 8001

Responsibilities:
- User authentication and authorization
- Signal history queries
- Watchlist change history
- Backtesting data and statistics

Note: This service handles read-only data queries, while the Signal Processing
      Service (port 8000) handles real-time monitoring and batch processing.
"""

from fastapi import FastAPI, HTTPException, Depends, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timedelta
from typing import Optional
import uvicorn
import os
from dotenv import load_dotenv

# Import from shared modules
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

from database import (
    Database,
    get_users_collection, get_login_history_collection, get_api_calls_collection,
    get_signals_collection, get_watchlist_changes_collection, get_signal_batches_collection,
    get_watchlist_collection
)
from models import (
    UserCreate, UserLogin, UserResponse, Token,
    LoginHistory, APICallLog, SignalLog, WatchlistChange, WatchlistItem
)
from auth import (
    verify_password, get_password_hash, create_access_token,
    get_current_user, get_optional_user, record_login_history
)

load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'backend', '.env'))

# Import monitor for watchlist operations
from massive_monitor_v2 import MassiveMonitorV2
from massive_monitor import MassiveMonitor

# Global monitor instance for watchlist management
data_monitor = None
# Global monitor instance for historical data requests
history_monitor = None

app = FastAPI(
    title="Trading Monitor - Auth Service",
    description="Authentication and history service for trading monitor",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()


# ============================================
# STARTUP & SHUTDOWN
# ============================================

@app.on_event("startup")
async def startup_event():
    """Initialize database connection"""
    global data_monitor, history_monitor
    try:
        await Database.connect_db()
        print("✓ Data Service: Connected to MongoDB")
        
        await Database.create_indexes()
        print("✓ Data Service: MongoDB indexes verified")
        
        # Initialize monitor for watchlist operations
        data_monitor = MassiveMonitorV2(api_key=os.getenv('MASSIVE_API_KEY'), use_db=True)
        await data_monitor.connect()
        print("✓ Data Service: Monitor initialized for watchlist management")
        
        # Initialize monitor for historical data requests (reusable)
        history_monitor = MassiveMonitor(api_key=os.getenv('MASSIVE_API_KEY'), use_db=False)
        await history_monitor.connect()
        print("✓ Data Service: History monitor initialized for price data")
        
        print("\n" + "=" * 60)
        print("📊 Data Service started on http://localhost:8001")
        print("🔐 Endpoints: /auth/* (authentication)")
        print("📋 Endpoints: /api/watchlist/* (watchlist management)")
        print("🔍 Endpoints: /api/symbols/* (symbol search)")
        print("📈 Endpoints: /api/history/* (signal history)")
        print("📉 Endpoints: /api/backtesting/* (backtesting data)")
        print("👤 Endpoints: /users/* (user management)")
        print("=" * 60 + "\n")
    except Exception as e:
        print(f"❌ Data Service startup failed: {e}")
        raise


@app.on_event("shutdown")
async def shutdown_event():
    """Close database connection"""
    await Database.close_db()
    print("✓ Data Service: MongoDB connection closed")


# ============================================
# MIDDLEWARE - API LOGGING
# ============================================

@app.middleware("http")
async def log_api_calls(request: Request, call_next):
    """Log all API calls to MongoDB"""
    start_time = datetime.utcnow()
    
    # Get user if authenticated
    user_id = None
    try:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            from auth import decode_token
            payload = decode_token(token)
            if payload:
                user_id = payload.get("sub")
    except:
        pass
    
    # Process request
    response = await call_next(request)
    
    # Calculate duration
    duration_ms = (datetime.utcnow() - start_time).total_seconds() * 1000
    
    # Log to MongoDB (fire and forget)
    try:
        api_calls_collection = get_api_calls_collection()
        log_entry = APICallLog(
            user_id=user_id,
            endpoint=str(request.url.path),
            method=request.method,
            status_code=response.status_code,
            duration_ms=duration_ms,
            ip_address=request.client.host if request.client else None
        )
        import asyncio
        asyncio.ensure_future(api_calls_collection.insert_one(log_entry.model_dump()))
    except Exception as e:
        print(f"Failed to log API call: {e}")
    
    return response


# ============================================
# HEALTH CHECK
# ============================================

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "auth",
        "status": "running",
        "version": "1.0.0",
        "endpoints": {
            "auth": "/auth/*",
            "history": "/history/*",
            "users": "/users/*"
        }
    }


@app.get("/health")
async def health_check():
    """Detailed health check"""
    try:
        db = Database.get_db()
        # Test database connection
        await db.command('ping')
        return {
            "status": "healthy",
            "database": "connected",
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }


# ============================================
# AUTHENTICATION ENDPOINTS
# ============================================

@app.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(user: UserCreate, request: Request):
    """Register a new user"""
    users_collection = get_users_collection()
    
    # Check if user exists
    existing_user = await users_collection.find_one({
        "$or": [
            {"email": user.email},
            {"username": user.username}
        ]
    })
    
    if existing_user:
        if existing_user.get("email") == user.email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )
    
    # Create user
    user_dict = user.model_dump()
    user_dict["hashed_password"] = get_password_hash(user_dict.pop("password"))
    user_dict["created_at"] = datetime.utcnow()
    user_dict["is_active"] = True
    
    result = await users_collection.insert_one(user_dict)
    user_dict["_id"] = str(result.inserted_id)
    
    # Record registration login
    await record_login_history(
        user_id=str(result.inserted_id),
        email=user.email,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        success=True
    )
    
    return UserResponse(
        id=str(result.inserted_id),
        username=user.username,
        email=user.email,
        full_name=user.full_name
    )


@app.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin, request: Request):
    """Authenticate user and return access token"""
    users_collection = get_users_collection()
    
    # Find user
    user = await users_collection.find_one({"email": credentials.email})
    
    if not user:
        await record_login_history(
            user_id=None,
            email=credentials.email,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            success=False
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Verify password
    if not verify_password(credentials.password, user.get("hashed_password")):
        await record_login_history(
            user_id=str(user["_id"]),
            email=credentials.email,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            success=False
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Check if user is active
    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled"
        )
    
    # Record successful login
    await record_login_history(
        user_id=str(user["_id"]),
        email=credentials.email,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        success=True
    )
    
    # Create access token
    access_token = create_access_token(data={"sub": str(user["_id"])})
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=str(user["_id"]),
            username=user["username"],
            email=user["email"],
            full_name=user.get("full_name"),
            is_active=user.get("is_active", True),
            created_at=user.get("created_at", datetime.utcnow()),
            last_login=user.get("last_login")
        )
    )


@app.get("/auth/me", response_model=UserResponse)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """Get current authenticated user"""
    return current_user


@app.get("/auth/login-history")
async def get_login_history(
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get login history for current user"""
    login_history_collection = get_login_history_collection()
    
    history = await login_history_collection.find(
        {"user_id": current_user.id}
    ).sort("login_time", -1).limit(limit).to_list(length=limit)
    
    # Convert ObjectId to string
    for record in history:
        record["_id"] = str(record["_id"])
    
    return {
        "count": len(history),
        "history": history
    }


# ============================================
# USER MANAGEMENT ENDPOINTS
# ============================================

@app.get("/users/me/stats")
async def get_user_stats(current_user: dict = Depends(get_current_user)):
    """Get statistics for current user"""
    login_history_collection = get_login_history_collection()
    api_calls_collection = get_api_calls_collection()
    
    # Count logins
    login_count = await login_history_collection.count_documents({
        "user_id": current_user.id,
        "success": True
    })
    
    # Count API calls
    api_call_count = await api_calls_collection.count_documents({
        "user_id": current_user.id
    })
    
    # Get last login
    last_login = await login_history_collection.find_one(
        {"user_id": current_user.id, "success": True},
        sort=[("login_time", -1)]
    )
    
    return {
        "user_id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "total_logins": login_count,
        "total_api_calls": api_call_count,
        "last_login": last_login.get("login_time") if last_login else None,
        "account_created": current_user.get("created_at")
    }


# ============================================
# HISTORY ENDPOINTS
# ============================================

@app.get("/api/history/signals/{symbol}")
async def get_signal_history(
    symbol: str,
    limit: int = 100
):
    """Get signal history for a specific symbol - No auth required for now"""
    signals_collection = get_signals_collection()
    
    signals = await signals_collection.find(
        {"symbol": symbol}
    ).sort("timestamp", -1).limit(limit).to_list(length=limit)
    
    # Convert ObjectId and datetime to JSON-serializable format
    for signal in signals:
        signal["_id"] = str(signal["_id"])
        if "timestamp" in signal and isinstance(signal["timestamp"], datetime):
            signal["timestamp"] = signal["timestamp"].isoformat()
    
    return {
        "symbol": symbol,
        "count": len(signals),
        "signals": signals
    }


@app.get("/api/history/signals/recent")
async def get_recent_signals(
    limit: int = 50
):
    """Get recent signals across all symbols - No auth required for now"""
    signals_collection = get_signals_collection()
    
    signals = await signals_collection.find({}).sort("timestamp", -1).limit(limit).to_list(length=limit)
    
    # Convert ObjectId and datetime
    for signal in signals:
        signal["_id"] = str(signal["_id"])
        if "timestamp" in signal and isinstance(signal["timestamp"], datetime):
            signal["timestamp"] = signal["timestamp"].isoformat()
    
    return {
        "count": len(signals),
        "signals": signals
    }


@app.get("/api/history/watchlist-changes")
async def get_watchlist_changes(
    limit: int = 100
):
    """Get watchlist change history - No auth required for now"""
    watchlist_changes_collection = get_watchlist_changes_collection()
    
    changes = await watchlist_changes_collection.find({}).sort("timestamp", -1).limit(limit).to_list(length=limit)
    
    # Convert ObjectId and datetime
    for change in changes:
        change["_id"] = str(change["_id"])
        if "timestamp" in change and isinstance(change["timestamp"], datetime):
            change["timestamp"] = change["timestamp"].isoformat()
    
    return {
        "count": len(changes),
        "changes": changes
    }


@app.get("/api/history/price-data/{symbol}")
async def get_price_history(
    symbol: str,
    days: int = 30,
    timespan: str = 'hour'
):
    """
    Get historical price data for a symbol with specified timespan
    Returns OHLCV candlestick data - No auth required for now
    
    Args:
        symbol: Stock symbol or Forex pair
        days: Number of days to fetch
        timespan: Candle timespan - 'minute', 'hour', 'day', 'week', 'month'
    """
    import time
    request_start = time.time()
    
    try:
        print(f"\n{'='*60}")
        print(f"📊 [REQUEST START] {symbol} - {timespan} - {days} days")
        print(f"{'='*60}")
        
        # Import MassiveMonitor
        from massive_monitor import MassiveMonitor
        import asyncio
        
        init_start = time.time()
        # Use global history monitor (already connected)
        global history_monitor
        if not history_monitor or not history_monitor.is_connected():
            # Fallback: reinitialize if needed
            history_monitor = MassiveMonitor(api_key=os.getenv('MASSIVE_API_KEY'), use_db=False)
            await history_monitor.connect()
        init_time = time.time() - init_start
        print(f"⏱️  [INIT] Monitor check: {init_time:.4f}s")
        
        # Fetch historical data with timeout and timespan
        fetch_start = time.time()
        try:
            df = await asyncio.wait_for(
                history_monitor._fetch_historical_data(symbol, days=days, timespan=timespan),
                timeout=30.0  # 30 second timeout
            )
            fetch_time = time.time() - fetch_start
            print(f"⏱️  [FETCH] API data fetch: {fetch_time:.2f}s")
        except asyncio.TimeoutError:
            total_time = time.time() - request_start
            print(f"✗ [TIMEOUT] Request timed out after {total_time:.2f}s")
            raise HTTPException(status_code=504, detail="Request timeout - try fewer days")
        
        if df is None or df.empty:
            total_time = time.time() - request_start
            print(f"✗ [NO DATA] No data returned in {total_time:.2f}s")
            raise HTTPException(status_code=404, detail=f"No price data found for {symbol}")
        
        print(f"✓ [DATA] Got {len(df)} {timespan} candles for {symbol}")
        
        # Convert DataFrame to candlestick format
        process_start = time.time()
        candles = []
        for timestamp, row in df.iterrows():
            candles.append({
                "time": int(timestamp.timestamp()),
                "open": float(row['open']),
                "high": float(row['high']),
                "low": float(row['low']),
                "close": float(row['close']),
                "volume": float(row['volume'])
            })
        process_time = time.time() - process_start
        print(f"⏱️  [PROCESS] Data processing: {process_time:.2f}s")
        
        total_time = time.time() - request_start
        print(f"{'='*60}")
        print(f"✅ [SUCCESS] Total request time: {total_time:.2f}s")
        print(f"   - Init: {init_time:.2f}s ({init_time/total_time*100:.1f}%)")
        print(f"   - Fetch: {fetch_time:.2f}s ({fetch_time/total_time*100:.1f}%)")
        print(f"   - Process: {process_time:.2f}s ({process_time/total_time*100:.1f}%)")
        print(f"{'='*60}\n")
        
        return {
            "symbol": symbol,
            "days": days,
            "count": len(candles),
            "candles": candles
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"✗ Error fetching price history for {symbol}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# WATCHLIST ENDPOINTS (Read-only)
# ============================================

@app.get("/api/watchlist")
async def get_watchlist():
    """Get current watchlist from MongoDB - No auth required for now"""
    try:
        watchlist_collection = get_watchlist_collection()
        
        symbols = await watchlist_collection.find({}).to_list(length=None)
        
        # Convert to frontend format with indicators
        watchlist_data = []
        for symbol in symbols:
            # Handle last_updated - it could be datetime or string
            last_updated = symbol.get("last_updated")
            if isinstance(last_updated, datetime):
                last_updated = last_updated.isoformat()
            elif not isinstance(last_updated, str):
                last_updated = None
            
            watchlist_data.append({
                "symbol": symbol.get("symbol"),
                "exchange": symbol.get("exchange", "FX"),
                "currency": symbol.get("currency", "USD"),
                "market_type": symbol.get("market_type", "forex"),
                "price": symbol.get("last_price"),
                "last_update": last_updated,
                "buy_signals": symbol.get("buy_signals", []),
                "sell_signals": symbol.get("sell_signals", []),
                "daily_indicators": symbol.get("daily_indicators"),
                "hourly_indicators": symbol.get("hourly_indicators")
            })
        
        return watchlist_data
        
    except Exception as e:
        print(f"✗ Error fetching watchlist: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/watchlist/add")
async def add_to_watchlist(item: WatchlistItem):
    """Add symbol to watchlist - No auth required for now"""
    try:
        if not data_monitor or not data_monitor.is_connected():
            raise HTTPException(status_code=503, detail="Monitor service not available")
        
        await data_monitor.add_to_watchlist(item.symbol, item.exchange, item.currency)
        
        # Log to MongoDB
        try:
            watchlist_changes_collection = get_watchlist_changes_collection()
            change_log = WatchlistChange(
                symbol=item.symbol,
                action="ADD",
                user_id=None
            )
            await watchlist_changes_collection.insert_one(change_log.model_dump())
        except Exception as e:
            print(f"Failed to log watchlist change: {e}")
        
        return {"status": "success", "symbol": item.symbol}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/watchlist/remove/{symbol}")
async def remove_from_watchlist(symbol: str):
    """Remove symbol from watchlist - No auth required for now"""
    try:
        if not data_monitor or not data_monitor.is_connected():
            raise HTTPException(status_code=503, detail="Monitor service not available")
        
        # Get current data before removal
        previous_data = data_monitor.watchlist.get(symbol)
        
        await data_monitor.remove_from_watchlist(symbol)
        
        # Log to MongoDB
        try:
            watchlist_changes_collection = get_watchlist_changes_collection()
            change_log = WatchlistChange(
                symbol=symbol,
                action="REMOVE",
                user_id=None,
                previous_data=previous_data
            )
            await watchlist_changes_collection.insert_one(change_log.model_dump())
        except Exception as e:
            print(f"Failed to log watchlist change: {e}")
        
        return {"status": "success", "symbol": symbol}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/symbols/search")
async def search_symbols(query: str):
    """Search for symbols using MASSIVE API - No auth required for now"""
    if not query or len(query) < 1:
        return []

    if not data_monitor or not data_monitor.is_connected():
        raise HTTPException(status_code=503, detail="MASSIVE API not connected")

    try:
        results = await data_monitor.search_symbols(query)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search error: {str(e)}")


# ============================================
# BACKTESTING ENDPOINTS
# ============================================

@app.get("/api/backtesting/signal-batches")
async def get_signal_batches(
    limit: int = 100,
    skip: int = 0
):
    """Get signal batches for backtesting analysis - No auth required for now"""
    signal_batches_collection = get_signal_batches_collection()
    
    # Get total count
    total = await signal_batches_collection.count_documents({})
    
    # Get batches with pagination
    batches = await signal_batches_collection.find({}).sort("timestamp", -1).skip(skip).limit(limit).to_list(length=limit)
    
    # Convert ObjectId and datetime
    for batch in batches:
        batch["_id"] = str(batch["_id"])
        if "timestamp" in batch and isinstance(batch["timestamp"], datetime):
            batch["timestamp"] = batch["timestamp"].isoformat()
    
    return {
        "total": total,
        "count": len(batches),
        "skip": skip,
        "limit": limit,
        "batches": batches
    }


@app.get("/api/backtesting/signal-batches/{batch_id}")
async def get_signal_batch_details(
    batch_id: str
):
    """Get detailed information for a specific signal batch - No auth required for now"""
    signal_batches_collection = get_signal_batches_collection()
    
    batch = await signal_batches_collection.find_one({"batch_id": batch_id})
    
    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Batch not found"
        )
    
    # Convert ObjectId and datetime
    batch["_id"] = str(batch["_id"])
    if "timestamp" in batch and isinstance(batch["timestamp"], datetime):
        batch["timestamp"] = batch["timestamp"].isoformat()
    
    return batch


@app.get("/api/backtesting/statistics")
async def get_backtesting_statistics(
    days: int = 30
):
    """Get aggregate statistics for backtesting - No auth required for now"""
    signal_batches_collection = get_signal_batches_collection()
    
    # Calculate date range
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # Get batches in date range
    batches = await signal_batches_collection.find(
        {"timestamp": {"$gte": start_date}}
    ).to_list(length=None)
    
    # Calculate statistics
    total_batches = len(batches)
    total_symbols_processed = sum(b.get('total_symbols', 0) for b in batches)
    total_crossovers = sum(b.get('crossovers_detected', 0) for b in batches)
    
    # Calculate average crossover rate
    avg_crossover_rate = 0
    if total_batches > 0:
        crossover_rates = [b.get('summary', {}).get('crossover_rate', 0) for b in batches]
        avg_crossover_rate = sum(crossover_rates) / len(crossover_rates)
    
    # Get most active symbols
    symbol_counts = {}
    for batch in batches:
        for signal in batch.get('signals', []):
            symbol = signal.get('symbol')
            if symbol:
                symbol_counts[symbol] = symbol_counts.get(symbol, 0) + 1
    
    most_active_symbols = sorted(symbol_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    
    return {
        "period_days": days,
        "start_date": start_date.isoformat(),
        "end_date": datetime.utcnow().isoformat(),
        "total_batches": total_batches,
        "total_symbols_processed": total_symbols_processed,
        "total_crossovers": total_crossovers,
        "avg_crossover_rate": round(avg_crossover_rate, 2),
        "most_active_symbols": [{"symbol": s, "count": c} for s, c in most_active_symbols]
    }


if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8001,
        reload=True
    )
