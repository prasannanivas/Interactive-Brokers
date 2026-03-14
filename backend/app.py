"""
Signal Processing Service (Port 8000)
Lightweight service focused on:
- Real-time monitoring and signal generation
- Telegram notifications
- WebSocket updates to frontend

Heavy operations (search, watchlist management) moved to Data Service (port 8001)
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
import asyncio
import json
import os
import logging
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from massive_monitor_v2 import MassiveMonitorV2
from telegram_bot import TelegramBot
from database import Database, get_users_collection, get_login_history_collection, get_api_calls_collection, get_signals_collection, get_watchlist_changes_collection, get_signal_batches_collection, get_indicator_states_collection, get_position_changes_collection, get_daily_signal_snapshots_collection
from models import UserCreate, UserLogin, UserResponse, Token, Symbol, WatchlistItem, AlgorithmConfig, TelegramConfig, APICallLog, SignalLog, WatchlistChange, DailySignalSnapshot, PasswordResetRequest, PasswordReset, PasswordChange, LoginHistoryResponse
from auth import get_password_hash, verify_password, create_access_token, get_current_user, get_optional_user, record_login_history
from state_tracker import track_and_detect_changes, INDICATOR_MAPPING
from bis_data_fetcher import get_bis_fetcher
import time
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import pytz

# Load environment variables from .env file
load_dotenv()

# Global instances
# Monitor now uses MongoDB for watchlist storage (use_db=True by default)
monitor = MassiveMonitorV2(api_key=os.getenv('MASSIVE_API_KEY'), use_db=True)
telegram_bot = TelegramBot()
active_websockets: List[WebSocket] = []

# Track previous indicator and position states (loaded from DB on startup)
indicator_states: Dict[str, Dict[str, str]] = {}  # {symbol: {indicator_name: 'BUY'/'SELL'/'NEUTRAL'}}
position_states: Dict[str, str] = {}  # {symbol: 'BUY'/'SELL'/'NEUTRAL'}

# Scheduler for daily signal capture
scheduler = AsyncIOScheduler()

app = FastAPI(title="Trading Signal Monitor API")


# Middleware to log API calls
@app.middleware("http")
async def log_api_calls(request: Request, call_next):
    """Log all API calls to MongoDB"""
    start_time = time.time()
    
    # Get user if authenticated
    user_id = None
    try:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            from auth import get_current_user
            from fastapi.security import HTTPAuthorizationCredentials
            credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=auth_header.split(" ")[1])
            user = await get_current_user(credentials)
            user_id = user.id
    except:
        pass
    
    # Process request
    response = await call_next(request)
    
    # Calculate duration
    duration_ms = (time.time() - start_time) * 1000
    
    # Log to MongoDB (non-blocking)
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
        # Fire and forget - don't await to avoid blocking
        asyncio.ensure_future(api_calls_collection.insert_one(log_entry.model_dump()))
    except Exception as e:
        print(f"Failed to log API call: {e}")
    
    return response


async def load_previous_states():
    """Load previous indicator and position states from MongoDB"""
    global indicator_states, position_states
    
    try:
        # Load indicator states
        indicator_states_collection = get_indicator_states_collection()
        async for doc in indicator_states_collection.find({}):
            symbol = doc.get('symbol')
            indicator = doc.get('indicator')
            state = doc.get('state')
            if symbol not in indicator_states:
                indicator_states[symbol] = {}
            indicator_states[symbol][indicator] = state
        
        # Load position states
        position_changes_collection = get_position_changes_collection()
        for symbol in monitor.watchlist.keys():
            # Get the latest position for each symbol
            latest = await position_changes_collection.find_one(
                {'symbol': symbol},
                sort=[('timestamp', -1)]
            )
            if latest:
                position_states[symbol] = latest.get('position', 'NEUTRAL')
            else:
                position_states[symbol] = 'NEUTRAL'
        
        print(f"✓ Loaded states for {len(indicator_states)} symbols")
    except Exception as e:
        print(f"✗ Failed to load previous states: {e}")


async def run_daily_signal_capture():
    """
    Run daily signal capture and store snapshot in MongoDB
    This function is scheduled to run at 5pm EST daily
    """
    try:
        print("\n" + "="*60)
        print(f"🕰️  Running scheduled daily signal capture...")
        print(f"Time: {datetime.now(pytz.timezone('US/Eastern')).strftime('%Y-%m-%d %I:%M:%S %p %Z')}")
        print("="*60)
        
        # Import here to avoid circular imports
        from capture_daily_signals import DailySignalCapture
        
        # Create capturer instance and run
        capturer = DailySignalCapture()
        success = await capturer.run()
        
        if success:
            print("✓ Daily signal capture completed successfully!")
            
            # Send Telegram notification if configured
            if telegram_bot.is_configured():
                try:
                    # Get the latest snapshot for summary
                    collection = get_daily_signal_snapshots_collection()
                    latest = await collection.find_one({}, sort=[('snapshot_date', -1)])
                    
                    if latest:
                        msg = (
                            f"📊 <b>Daily Signal Snapshot Captured</b>\n\n"
                            f"📅 Date: {latest['snapshot_date'].strftime('%Y-%m-%d')}\n"
                            f"⏰ Time: 5:00 PM EST\n\n"
                            f"📈 Summary:\n"
                            f"  🟢 Bullish: {latest['bullish_count']} ({latest['bullish_count']/latest['total_symbols']*100:.1f}%)\n"
                            f"  🔴 Bearish: {latest['bearish_count']} ({latest['bearish_count']/latest['total_symbols']*100:.1f}%)\n"
                            f"  ⚪ Neutral: {latest['neutral_count']} ({latest['neutral_count']/latest['total_symbols']*100:.1f}%)\n"
                            f"  📊 Total: {latest['total_symbols']} symbols"
                        )
                        await telegram_bot.send_message(msg)
                        print("✓ Telegram notification sent")
                except Exception as e:
                    print(f"✗ Failed to send Telegram notification: {e}")
        else:
            print("✗ Daily signal capture failed!")
            
            # Send failure notification
            if telegram_bot.is_configured():
                try:
                    await telegram_bot.send_message(
                        f"⚠️ <b>Daily Signal Capture Failed</b>\n\n"
                        f"Time: {datetime.now(pytz.timezone('US/Eastern')).strftime('%Y-%m-%d %I:%M:%S %p %Z')}\n"
                        f"Please check the logs for details."
                    )
                except:
                    pass
        
        print("="*60 + "\n")
        
    except Exception as e:
        print(f"✗ Error running daily signal capture: {e}")
        import traceback
        traceback.print_exc()


@app.on_event("startup")
async def startup_event():
    """Initialize on startup"""
    # Connect to MongoDB
    await Database.connect_db()
    
    # Configure Telegram bot from environment variables
    bot_token = os.getenv('TELEGRAM_BOT_TOKEN')
    chat_id = os.getenv('TELEGRAM_CHAT_ID')
    if bot_token and chat_id:
        telegram_bot.configure(bot_token, chat_id)
        print("✓ Telegram bot configured")
    
    success = await monitor.connect()
    if success:
        print("✓ MASSIVE API Monitor connected successfully")
        print("✓ Using daily/hourly data for technical indicators")
        print(f"✓ Loaded {len(monitor.watchlist)} symbols from watchlist")
        
        # Load previous states for change detection
        await load_previous_states()
        
        print("✓ Server ready - continuous batch monitoring will start shortly")
        
        # Send startup message to Telegram
        if telegram_bot.is_configured():
            try:
                await telegram_bot.send_message(f"🤖 <b>BOT STARTED</b>\n\n✅ Monitoring {len(monitor.watchlist)} symbols\n📊 Continuous batch processing (15 symbols/batch)\n🔔 Smart change detection enabled")
                print("✓ Telegram startup message sent")
            except Exception as e:
                print(f"✗ Failed to send Telegram message: {e}")
        
        # Delay monitoring loop start by 10 seconds to allow server to fully start
        async def delayed_start():
            await asyncio.sleep(10)
            print("✓ Starting monitoring loop...")
            await monitoring_loop()
        asyncio.create_task(delayed_start())
    else:
        print("✗ Failed to connect to MASSIVE API")
        print("⚠ Make sure MASSIVE_API_KEY environment variable is set")
    
    # Setup daily signal capture scheduler
    try:
        est_tz = pytz.timezone('US/Eastern')
        
        # Schedule daily capture at 5:00 PM EST
        scheduler.add_job(
            run_daily_signal_capture,
            trigger=CronTrigger(hour=17, minute=0, timezone=est_tz),
            id='daily_signal_capture',
            name='Daily Signal Capture at 5pm EST',
            replace_existing=True
        )
        
        # Start the scheduler
        scheduler.start()
        
        next_run = scheduler.get_job('daily_signal_capture').next_run_time
        print(f"\n✓ Daily signal capture scheduled")
        print(f"  Schedule: Every day at 5:00 PM EST")
        print(f"  Next run: {next_run.astimezone(est_tz).strftime('%Y-%m-%d %I:%M:%S %p %Z')}")
        print()
        
    except Exception as e:
        print(f"✗ Failed to setup daily signal capture scheduler: {e}")
        import traceback
        traceback.print_exc()


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    # Shutdown scheduler
    if scheduler.running:
        scheduler.shutdown(wait=False)
        print("✓ Scheduler shutdown")
    
    await monitor.disconnect()
    await Database.close_db()
    print("✓ MASSIVE API Monitor disconnected")
    print("✓ MongoDB connection closed")

# CORS middleware for React frontend
app.add_middleware(
    CORSMiddleware,
    # React dev server + production + server IP
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://167.172.215.78:3000",
        "http://167.172.215.78",
        "*"  # Allow all origins for development
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global instances (already defined above)
# monitor = IBMonitor()
# telegram_bot = TelegramBot()
# active_websockets: List[WebSocket] = []

# Pydantic models (now imported from models.py)


# ============================================
# AUTHENTICATION ENDPOINTS
# ============================================

@app.post("/api/auth/register", response_model=UserResponse)
async def register(user_data: UserCreate):
    """Register a new user"""
    users_collection = get_users_collection()
    
    # Check if user already exists
    existing_user = await users_collection.find_one({"$or": [
        {"email": user_data.email},
        {"username": user_data.username}
    ]})
    
    if existing_user:
        if existing_user.get("email") == user_data.email:
            raise HTTPException(status_code=400, detail="Email already registered")
        else:
            raise HTTPException(status_code=400, detail="Username already taken")
    
    # Create new user
    hashed_password = get_password_hash(user_data.password)
    new_user = {
        "username": user_data.username,
        "email": user_data.email,
        "hashed_password": hashed_password,
        "full_name": user_data.full_name,
        "is_active": True,
        "created_at": datetime.utcnow(),
        "last_login": None
    }
    
    result = await users_collection.insert_one(new_user)
    new_user["_id"] = result.inserted_id
    
    return UserResponse(
        id=str(result.inserted_id),
        username=new_user["username"],
        email=new_user["email"],
        full_name=new_user.get("full_name"),
        is_active=new_user["is_active"],
        created_at=new_user["created_at"],
        last_login=new_user.get("last_login")
    )


@app.post("/api/auth/login", response_model=Token)
async def login(user_credentials: UserLogin, request: Request):
    """Login and get access token"""
    users_collection = get_users_collection()
    
    # Find user by email
    user = await users_collection.find_one({"email": user_credentials.email})
    
    if not user or not verify_password(user_credentials.password, user["hashed_password"]):
        # Record failed login attempt
        await record_login_history(
            user_id=str(user["_id"]) if user else "unknown",
            email=user_credentials.email,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            success=False
        )
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password"
        )
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is inactive")
    
    # Update last login
    await users_collection.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": datetime.utcnow()}}
    )
    
    # Record successful login
    await record_login_history(
        user_id=str(user["_id"]),
        email=user["email"],
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        success=True
    )
    
    # Create access token
    access_token = create_access_token(data={"sub": user["email"]})
    
    user_response = UserResponse(
        id=str(user["_id"]),
        username=user["username"],
        email=user["email"],
        full_name=user.get("full_name"),
        is_active=user.get("is_active", True),
        created_at=user.get("created_at", datetime.utcnow()),
        last_login=datetime.utcnow()
    )
    
    return Token(access_token=access_token, user=user_response)


@app.get("/api/auth/me", response_model=UserResponse)
async def get_me(current_user: UserResponse = Depends(get_current_user)):
    """Get current user info"""
    return current_user


@app.post("/api/auth/request-password-reset")
async def request_password_reset(reset_request: PasswordResetRequest):
    """Request a password reset token"""
    from auth import create_password_reset_token
    
    users_collection = get_users_collection()
    
    # Check if user exists
    user = await users_collection.find_one({"email": reset_request.email})
    
    # Always return success to prevent email enumeration
    # But only create token if user exists
    if user:
        token = await create_password_reset_token(reset_request.email)
        
        # TODO: Send email with reset link
        # In production, you would send an email here with the reset token
        # For now, we'll return the token in development (remove this in production)
        print(f"Password reset token for {reset_request.email}: {token}")
        print(f"Reset URL would be: http://localhost:5173/reset-password?token={token}")
    
    return {
        "message": "If this email is registered, you will receive a password reset link",
        "email": reset_request.email
    }


@app.post("/api/auth/reset-password")
async def reset_password(reset_data: PasswordReset):
    """Reset password using a valid token"""
    from auth import verify_reset_token, mark_reset_token_used
    
    # Verify token
    email = await verify_reset_token(reset_data.token)
    
    if not email:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired reset token"
        )
    
    # Update password
    users_collection = get_users_collection()
    hashed_password = get_password_hash(reset_data.new_password)
    
    result = await users_collection.update_one(
        {"email": email},
        {"$set": {"hashed_password": hashed_password}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Mark token as used
    await mark_reset_token_used(reset_data.token)
    
    return {"message": "Password successfully reset"}


@app.post("/api/auth/change-password")
async def change_password(
    password_data: PasswordChange,
    current_user: UserResponse = Depends(get_current_user)
):
    """Change password for authenticated user"""
    users_collection = get_users_collection()
    
    # Get current user from database
    user = await users_collection.find_one({"email": current_user.email})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify old password
    if not verify_password(password_data.old_password, user["hashed_password"]):
        raise HTTPException(
            status_code=400,
            detail="Current password is incorrect"
        )
    
    # Update to new password
    hashed_password = get_password_hash(password_data.new_password)
    
    await users_collection.update_one(
        {"email": current_user.email},
        {"$set": {"hashed_password": hashed_password}}
    )
    
    return {"message": "Password successfully changed"}


# Simple hardcoded authentication endpoint (DEPRECATED - Use /api/auth/login instead)
@app.post("/api/auth/simple-login")
async def simple_login(user_credentials: UserLogin):
    """Simple login with hardcoded credentials"""
    # Hardcoded users
    HARDCODED_USERS = {
        "Anatoli@gmail.com": {
            "id": "user-anatoli",
            "username": "Anatoli",
            "full_name": "Anatoli",
            "password": "secret"
        },
        "Nivas@gmail.com": {
            "id": "user-nivas",
            "username": "Nivas",
            "full_name": "Nivas",
            "password": "secret"
        },
        "leor@gmail.com": {
            "id": "user-leor",
            "username": "Leor",
            "full_name": "Leor",
            "password": "secret"
        },
        "tolik1@gmail.com": {
            "id": "user-tolik",
            "username": "Tolik",
            "full_name": "Tolik",
            "password": "secret"
        },
        "leor.jivotovsky@gmail.com": {
            "id": "user-leor",
            "username": "Leor",
            "full_name": "Leor",
            "password": "secret"
        }
    }
    
    # Check if user exists and password matches
    user = HARDCODED_USERS.get(user_credentials.email)
    if not user or user["password"] != user_credentials.password:
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password"
        )
    
    # Create access token
    access_token = create_access_token(data={"sub": user_credentials.email})
    
    # Return minimal user info
    user_response = {
        "id": user["id"],
        "username": user["username"],
        "email": user_credentials.email,
        "full_name": user["full_name"],
        "is_active": True,
        "created_at": datetime.utcnow().isoformat(),
        "last_login": datetime.utcnow().isoformat()
    }
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_response
    }


@app.get("/api/auth/login-history")
async def get_login_history(
    current_user: UserResponse = Depends(get_current_user),
    limit: int = 50
):
    """Get login history for current user"""
    login_history_collection = get_login_history_collection()
    
    history = await login_history_collection.find(
        {"user_id": current_user.id}
    ).sort("login_time", -1).limit(limit).to_list(length=limit)
    
    # Convert ObjectId to string
    for record in history:
        record["_id"] = str(record["_id"])
    
    return history


@app.get("/api/signals/history/{symbol}")
async def get_signal_history(
    symbol: str,
    limit: int = 100,
    current_user: Optional[dict] = Depends(get_optional_user)
):
    """Get signal history for a specific symbol"""
    signals_collection = get_signals_collection()
    
    # Fetch signal history for the symbol
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


@app.get("/api/signals/changes/{symbol}")
async def get_signal_changes(
    symbol: str,
    limit: int = 100
):
    """Get signal change history for a specific symbol (only actual changes)"""
    from database import get_indicator_states_collection
    
    indicator_states_collection = get_indicator_states_collection()
    
    # Fetch signal changes for the symbol
    changes = await indicator_states_collection.find(
        {"symbol": symbol}
    ).sort("timestamp", -1).limit(limit).to_list(length=limit)
    
    # Convert ObjectId and datetime to JSON-serializable format
    for change in changes:
        change["_id"] = str(change["_id"])
        if "timestamp" in change and isinstance(change["timestamp"], datetime):
            change["timestamp"] = change["timestamp"].isoformat()
    
    return {
        "symbol": symbol,
        "count": len(changes),
        "changes": changes
    }


@app.get("/api/signals/recent")
async def get_recent_signals(
    limit: int = 50,
    current_user: Optional[dict] = Depends(get_optional_user)
):
    """Get recent signals across all symbols"""
    signals_collection = get_signals_collection()
    
    # Fetch recent signals
    signals = await signals_collection.find({}).sort("timestamp", -1).limit(limit).to_list(length=limit)
    
    # Convert ObjectId and datetime to JSON-serializable format
    for signal in signals:
        signal["_id"] = str(signal["_id"])
        if "timestamp" in signal and isinstance(signal["timestamp"], datetime):
            signal["timestamp"] = signal["timestamp"].isoformat()
    
    return {
        "count": len(signals),
        "signals": signals
    }


# ============================================
# TRADING API ENDPOINTS
# ============================================

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "api_connected": monitor.is_connected(),
        "api_provider": "MASSIVE",
        "watchlist_count": len(monitor.watchlist),
        "telegram_configured": telegram_bot.is_configured()
    }


# ============================================
# WATCHLIST ENDPOINTS - MOVED TO DATA SERVICE (Port 8001)
# ============================================
# The following endpoints have been moved to reduce load on Signal Service:
# - GET /api/symbols/search - Symbol search
# - POST /api/watchlist/add - Add to watchlist
# - DELETE /api/watchlist/remove/{symbol} - Remove from watchlist
# - GET /api/watchlist - Get watchlist (read-only)
# - POST /api/watchlist/scan-forex - Scan forex pairs
#
# Signal Service now only monitors existing watchlist and sends notifications
# ============================================


@app.post("/api/algorithm/configure")
async def configure_algorithm(config: AlgorithmConfig):
    """Configure algorithm parameters"""
    monitor.configure_algorithm(config.model_dump())
    return {"status": "success", "config": config}


@app.get("/api/algorithm/config")
async def get_algorithm_config():
    """Get current algorithm configuration"""
    return monitor.get_algorithm_config()


@app.post("/api/telegram/configure")
async def configure_telegram(config: TelegramConfig):
    """Configure Telegram bot"""
    try:
        telegram_bot.configure(config.bot_token, config.chat_id)
        await telegram_bot.send_message("✅ Telegram notifications enabled!")
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/telegram/status")
async def get_telegram_status():
    """Get Telegram configuration status"""
    return {
        "configured": telegram_bot.is_configured(),
        "chat_id": telegram_bot.chat_id if telegram_bot.is_configured() else None
    }


@app.get("/api/bond/interest-rates")
async def get_interest_rates(use_cache: bool = True):
    """
    Get latest central bank policy rates from BIS SDMX API
    
    Query params:
        use_cache: Whether to use cached data (default: True, 12-hour cache)
    
    Returns:
        List of interest rate data matching the format:
        [{
            "Country": str,
            "Category": "Interest Rate",
            "DateTime": str,
            "Value": float,
            "Frequency": "Daily",
            "HistoricalDataSymbol": str,
            "LastUpdate": str
        }]
    """
    try:
        bis_fetcher = get_bis_fetcher()
        data = bis_fetcher.get_latest_rates(use_cache=use_cache)
        return data
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to fetch BIS interest rates: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch interest rate data from BIS: {str(e)}"
        )


@app.get("/api/bond/interest-rates/{ref_area}")
async def get_historical_interest_rates(ref_area: str, days: int = 365):
    """
    Get historical central bank policy rates for a specific country
    
    Path params:
        ref_area: BIS reference area code (US, XM, JP, GB, CA, AU)
    
    Query params:
        days: Number of days of history (default: 365)
    
    Returns:
        List of historical interest rate data
    """
    try:
        # Validate ref_area
        valid_areas = ['US', 'XM', 'JP', 'GB', 'CA', 'AU']
        if ref_area.upper() not in valid_areas:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid ref_area. Must be one of: {', '.join(valid_areas)}"
            )
        
        bis_fetcher = get_bis_fetcher()
        data = bis_fetcher.get_historical_rates(ref_area.upper(), days=days)
        return data
    except HTTPException:
        raise
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to fetch BIS historical rates: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch historical data: {str(e)}"
        )


# ============================================
# DAILY SIGNAL SNAPSHOTS ENDPOINTS
# ============================================

@app.get("/api/signals/daily-snapshots")
async def get_daily_snapshots(
    days: int = 30,
    skip: int = 0,
    limit: int = 100
):
    """
    Get daily signal snapshots
    
    Query params:
        days: Number of days to retrieve (default: 30)
        skip: Number of records to skip for pagination (default: 0)
        limit: Maximum number of records to return (default: 100, max: 365)
    
    Returns:
        List of daily signal snapshots in reverse chronological order
    """
    try:
        # Validate and limit parameters
        limit = min(limit, 365)
        
        # Calculate date range
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=days)
        
        # Fetch snapshots
        collection = get_daily_signal_snapshots_collection()
        cursor = collection.find({
            'snapshot_date': {
                '$gte': start_date,
                '$lte': end_date
            }
        }).sort('snapshot_date', -1).skip(skip).limit(limit)
        
        snapshots = []
        async for doc in cursor:
            # Convert ObjectId to string
            if '_id' in doc:
                doc['_id'] = str(doc['_id'])
            snapshots.append(doc)
        
        return {
            'snapshots': snapshots,
            'count': len(snapshots),
            'skip': skip,
            'limit': limit
        }
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to fetch daily snapshots: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch daily snapshots: {str(e)}"
        )


@app.get("/api/signals/daily-snapshots/latest")
async def get_latest_snapshot():
    """
    Get the most recent daily signal snapshot
    
    Returns:
        Latest daily signal snapshot
    """
    try:
        collection = get_daily_signal_snapshots_collection()
        doc = await collection.find_one({}, sort=[('snapshot_date', -1)])
        
        if not doc:
            raise HTTPException(
                status_code=404,
                detail="No snapshots found"
            )
        
        # Convert ObjectId to string
        if '_id' in doc:
            doc['_id'] = str(doc['_id'])
        
        return doc
    except HTTPException:
        raise
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to fetch latest snapshot: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch latest snapshot: {str(e)}"
        )


@app.get("/api/signals/daily-snapshots/stats")
async def get_snapshot_stats(
    days: int = 30
):
    """
    Get statistics from daily snapshots over a period
    
    Query params:
        days: Number of days to analyze (default: 30)
    
    Returns:
        Statistics including average bullish/bearish counts, trends, etc.
    """
    try:
        # Calculate date range
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=days)
        
        # Fetch snapshots
        collection = get_daily_signal_snapshots_collection()
        cursor = collection.find({
            'snapshot_date': {
                '$gte': start_date,
                '$lte': end_date
            }
        }).sort('snapshot_date', 1)
        
        snapshots = []
        async for doc in cursor:
            snapshots.append(doc)
        
        if not snapshots:
            return {
                'days': days,
                'snapshots_count': 0,
                'avg_bullish': 0,
                'avg_bearish': 0,
                'avg_neutral': 0,
                'trend': 'NO_DATA'
            }
        
        # Calculate statistics
        total_bullish = sum(s.get('bullish_count', 0) for s in snapshots)
        total_bearish = sum(s.get('bearish_count', 0) for s in snapshots)
        total_neutral = sum(s.get('neutral_count', 0) for s in snapshots)
        count = len(snapshots)
        
        avg_bullish = total_bullish / count
        avg_bearish = total_bearish / count
        avg_neutral = total_neutral / count
        
        # Calculate trend (comparing first and last quartile)
        quartile_size = max(1, count // 4)
        first_quartile = snapshots[:quartile_size]
        last_quartile = snapshots[-quartile_size:]
        
        avg_bullish_first = sum(s.get('bullish_count', 0) for s in first_quartile) / len(first_quartile)
        avg_bullish_last = sum(s.get('bullish_count', 0) for s in last_quartile) / len(last_quartile)
        
        if avg_bullish_last > avg_bullish_first * 1.1:
            trend = "INCREASINGLY_BULLISH"
        elif avg_bullish_last < avg_bullish_first * 0.9:
            trend = "INCREASINGLY_BEARISH"
        else:
            trend = "STABLE"
        
        return {
            'days': days,
            'snapshots_count': count,
            'avg_bullish': round(avg_bullish, 2),
            'avg_bearish': round(avg_bearish, 2),
            'avg_neutral': round(avg_neutral, 2),
            'trend': trend,
            'latest_snapshot_date': snapshots[-1].get('snapshot_date').isoformat() if snapshots else None
        }
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to calculate snapshot stats: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to calculate statistics: {str(e)}"
        )


@app.get("/api/signals/daily-snapshots/{date}")
async def get_snapshot_by_date(
    date: str
):
    """
    Get a specific daily snapshot by date
    
    Path params:
        date: Date in YYYY-MM-DD format
    
    Returns:
        Daily signal snapshot for the specified date
    """
    try:
        # Parse date
        try:
            snapshot_date = datetime.strptime(date, '%Y-%m-%d')
            # Convert to UTC and set to 5pm EST (which is 10pm UTC during EST, 9pm during EDT)
            # For simplicity, we'll search for any snapshot on that date
            start_of_day = snapshot_date.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_day = snapshot_date.replace(hour=23, minute=59, second=59, microsecond=999999)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid date format. Use YYYY-MM-DD"
            )
        
        # Fetch snapshot
        collection = get_daily_signal_snapshots_collection()
        doc = await collection.find_one({
            'snapshot_date': {
                '$gte': start_of_day,
                '$lte': end_of_day
            }
        })
        
        if not doc:
            raise HTTPException(
                status_code=404,
                detail=f"No snapshot found for date {date}"
            )
        
        # Convert ObjectId to string
        if '_id' in doc:
            doc['_id'] = str(doc['_id'])
        
        return doc
    except HTTPException:
        raise
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to fetch snapshot for date {date}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch snapshot: {str(e)}"
        )


@app.get("/api/signals/capture/trigger")
async def trigger_daily_capture(current_user: UserResponse = Depends(get_current_user)):
    """
    Manually trigger a daily signal capture (admin only)
    
    Requires authentication. Use this to test or manually capture signals
    at any time without waiting for the scheduled 5pm run.
    
    Returns:
        Success status and snapshot summary
    """
    try:
        print(f"\n📋 Manual capture triggered by user: {current_user.username}")
        
        # Run the capture
        await run_daily_signal_capture()
        
        # Get the latest snapshot
        collection = get_daily_signal_snapshots_collection()
        latest = await collection.find_one({}, sort=[('snapshot_date', -1)])
        
        if latest:
            return {
                'success': True,
                'message': 'Daily signal capture completed successfully',
                'snapshot': {
                    'date': latest['snapshot_date'].isoformat(),
                    'total_symbols': latest['total_symbols'],
                    'bullish_count': latest['bullish_count'],
                    'bearish_count': latest['bearish_count'],
                    'neutral_count': latest['neutral_count']
                }
            }
        else:
            return {
                'success': False,
                'message': 'Capture may have failed - no snapshot found'
            }
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Manual capture trigger failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to trigger capture: {str(e)}"
        )


@app.get("/api/signals/capture/schedule-info")
async def get_capture_schedule_info():
    """
    Get information about the daily capture schedule
    
    Returns:
        Schedule information including next run time
    """
    try:
        job = scheduler.get_job('daily_signal_capture')
        if job and job.next_run_time:
            est_tz = pytz.timezone('US/Eastern')
            next_run_est = job.next_run_time.astimezone(est_tz)
            
            return {
                'scheduled': True,
                'schedule': 'Daily at 5:00 PM EST',
                'timezone': 'US/Eastern',
                'next_run_utc': job.next_run_time.isoformat(),
                'next_run_est': next_run_est.strftime('%Y-%m-%d %I:%M:%S %p %Z'),
                'job_name': job.name,
                'job_id': job.id
            }
        else:
            return {
                'scheduled': False,
                'message': 'Daily capture is not scheduled'
            }
    except Exception as e:
        return {
            'scheduled': False,
            'error': str(e)
        }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates"""
    await websocket.accept()
    active_websockets.append(websocket)

    try:
        # Send initial data
        await websocket.send_json({
            "type": "init",
            "data": monitor.get_watchlist_data()
        })

        # Keep connection alive
        while True:
            # Wait for messages (ping/pong to keep alive)
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")

    except WebSocketDisconnect:
        active_websockets.remove(websocket)
        print("WebSocket client disconnected")


async def broadcast_update(data: dict):
    """Broadcast update to all connected WebSocket clients"""
    for websocket in active_websockets:
        try:
            await websocket.send_json(data)
        except:
            active_websockets.remove(websocket)


async def monitoring_loop():
    """Background task to continuously monitor symbols in batches with state tracking"""
    global indicator_states, position_states
    batch_size = 15
    current_batch_start = 0
    
    while True:
        try:
            if monitor.is_connected() and len(monitor.watchlist) > 0:
                total_symbols = len(monitor.watchlist)
                
                # Process one batch
                updates = await monitor.update_batch(current_batch_start, batch_size=batch_size)

                # Broadcast updates via WebSocket
                if updates and updates.get('symbols'):
                    await broadcast_update({
                        "type": "update",
                        "data": updates
                    })

                    # Track state changes and send Telegram notifications
                    if telegram_bot.is_configured():
                        
                        # Track changes for each symbol using state tracker
                        indicator_changes_list = []
                        position_changes_list = []
                        
                        for symbol_data in updates.get('symbols', []):
                            symbol = symbol_data.get('symbol')
                            price = symbol_data.get('last_price', 0)
                            
                            # Initialize states if not exist
                            if symbol not in indicator_states:
                                indicator_states[symbol] = {}
                            if symbol not in position_states:
                                position_states[symbol] = 'NEUTRAL'
                            
                            # Track and detect changes
                            indicator_changes, new_position, position_changed = await track_and_detect_changes(
                                symbol,
                                symbol_data,
                                indicator_states[symbol],
                                position_states[symbol]
                            )
                            
                            # Update states
                            for change in indicator_changes:
                                indicator = change['indicator']
                                indicator_states[symbol][indicator] = change['to_state']
                            
                            if position_changed:
                                position_changes_list.append({
                                    'symbol': symbol,
                                    'from': position_states[symbol],
                                    'to': new_position,
                                    'price': price,
                                    'timestamp': datetime.now().isoformat()
                                })
                                position_states[symbol] = new_position
                            
                            # Collect indicator changes for Telegram
                            if indicator_changes:
                                for change in indicator_changes:
                                    indicator_name = INDICATOR_MAPPING.get(change['indicator'], change['indicator'])
                                    indicator_changes_list.append({
                                        'symbol': symbol,
                                        'indicator': indicator_name,
                                        'from': change['from_state'],
                                        'to': change['to_state'],
                                        'price': price
                                    })
                        
                        # Send Telegram alerts for indicator and position changes
                        if indicator_changes_list or position_changes_list:
                            msg_parts = ["📊 <b>Trading Signals Update</b>\n"]
                            msg_parts.append(f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
                            msg_parts.append(f"📈 Batch {updates.get('batch_start', 0)+1}-{updates.get('batch_end', 0)}/{total_symbols}\n")
                            
                            # Position changes (most important)
                            if position_changes_list:
                                msg_parts.append(f"\n🎯 <b>POSITION CHANGES: {len(position_changes_list)}</b>")
                                for change in position_changes_list:
                                    # Find the symbol data to get current signal counts
                                    symbol_info = next((s for s in updates.get('symbols', []) if s.get('symbol') == change['symbol']), None)
                                    buy_count = len(symbol_info.get('buy_signals', [])) if symbol_info else 0
                                    sell_count = len(symbol_info.get('sell_signals', [])) if symbol_info else 0
                                    
                                    emoji = "🟢" if change['to'] == 'BUY' else "🔴" if change['to'] == 'SELL' else "⚪"
                                    msg_parts.append(f"  {emoji} <b>{change['symbol']}</b> (${change['price']:.4f})")
                                    msg_parts.append(f"      {change['from']} → {change['to']}")
                                    msg_parts.append(f"      📊 {buy_count} Bullish | {sell_count} Bearish")
                            
                            # Indicator changes (details)
                            if indicator_changes_list:
                                bullish_ind = [c for c in indicator_changes_list if c['to'] == 'BUY' or (c['from'] == 'SELL' and c['to'] == 'NEUTRAL')]
                                bearish_ind = [c for c in indicator_changes_list if c['to'] == 'SELL' or (c['from'] == 'BUY' and c['to'] == 'NEUTRAL')]
                                
                                if bullish_ind:
                                    msg_parts.append(f"\n🟢 <b>Bullish Indicators: {len(bullish_ind)}</b>")
                                    for c in bullish_ind[:5]:  # Limit to 5
                                        msg_parts.append(f"  • {c['symbol']} - {c['indicator']}: {c['from']}→{c['to']}")
                                    if len(bullish_ind) > 5:
                                        msg_parts.append(f"  ... and {len(bullish_ind)-5} more")
                                
                                if bearish_ind:
                                    msg_parts.append(f"\n🔴 <b>Bearish Indicators: {len(bearish_ind)}</b>")
                                    for c in bearish_ind[:5]:  # Limit to 5
                                        msg_parts.append(f"  • {c['symbol']} - {c['indicator']}: {c['from']}→{c['to']}")
                                    if len(bearish_ind) > 5:
                                        msg_parts.append(f"  ... and {len(bearish_ind)-5} more")
                            
                            telegram_message = "\n".join(msg_parts)
                            await telegram_bot.send_message(telegram_message)
                            print(f"📱 Sent: {len(position_changes_list)} position changes, {len(indicator_changes_list)} indicator changes")

                # Move to next batch (loop back to start when done)
                current_batch_start = updates.get('batch_end', current_batch_start + batch_size)
                if current_batch_start >= total_symbols:
                    print(f"\n✅ Completed full cycle of {total_symbols} symbols. Restarting from batch 1...\n")
                    current_batch_start = 0
                
                # Small delay between batches to prevent API throttling
                await asyncio.sleep(0.5)
            else:
                # Wait a bit if not connected
                await asyncio.sleep(5)

        except Exception as e:
            print(f"Error in monitoring loop: {e}")
            import traceback
            traceback.print_exc()
            await asyncio.sleep(10)


if __name__ == "__main__":
    import uvicorn
    
    print("🚀 Starting FastAPI server on http://localhost:8000")
    print("📊 WebSocket endpoint: ws://localhost:8000/ws")
    print("=" * 60)
    
    uvicorn.run(app, host="0.0.0.0", port=8000)
