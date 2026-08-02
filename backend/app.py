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
from fastapi.responses import FileResponse
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
from database import Database, get_users_collection, get_login_history_collection, get_api_calls_collection, get_signals_collection, get_watchlist_changes_collection, get_signal_batches_collection, get_indicator_states_collection, get_position_changes_collection, get_daily_signal_snapshots_collection, get_bond_yields_collection, get_interest_rates_collection, get_data_fetch_tracker_collection, get_economic_calendar_collection, get_fx_reports_collection
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


async def run_daily_economic_data_refresh():
    """
    Fetch bond yields and interest rates incrementally from MongoDB
    This function is scheduled to run at 5:00 AM EST daily
    Only fetches data from last available date to today (incremental update)
    """
    try:
        print("\n" + "="*60)
        print(f"📊 Running scheduled economic data refresh (incremental)...")
        print(f"Time: {datetime.now(pytz.timezone('US/Eastern')).strftime('%Y-%m-%d %I:%M:%S %p %Z')}")
        print("="*60)
        
        # Run in executor to avoid blocking async loop
        def fetch_incremental_data():
            import subprocess
            import sys
            
            base_path = os.path.dirname(os.path.abspath(__file__))
            
            # Run incremental update script - fetches only missing dates
            print("\n📈 Fetching incremental bond yields and interest rates...")
            print("   (Only fetching data from last available date to today)")
            
            result = subprocess.run(
                [sys.executable, os.path.join(base_path, 'fetch_incremental_bond_data.py')],
                capture_output=True,
                text=True
            )
            
            # Print output for logging
            if result.stdout:
                print(result.stdout)
            
            if result.returncode != 0:
                print(f"\n✗ Incremental data fetch failed!")
                if result.stderr:
                    print(f"Error: {result.stderr[:500]}")
                return False, 0, 0
            
            # Parse output to get record counts
            bonds_added = 0
            rates_added = 0
            
            try:
                output = result.stdout
                # Look for "Bond Yields: • New records added: X"
                if "Bond Yields:" in output and "New records added:" in output:
                    for line in output.split('\n'):
                        if "Bond Yields:" in line:
                            # Next line should have count
                            continue
                        elif "New records added:" in line and bonds_added == 0:
                            bonds_added = int(line.split(":")[-1].strip())
                            break
                
                # Look for "Interest Rates: • New records added: Y"
                if "Interest Rates:" in output and "New records added:" in output:
                    lines = output.split('\n')
                    for i, line in enumerate(lines):
                        if "Interest Rates:" in line and i + 1 < len(lines):
                            next_line = lines[i + 1]
                            if "New records added:" in next_line:
                                rates_added = int(next_line.split(":")[-1].strip())
                                break
            except:
                pass
            
            print(f"\n✓ Incremental update complete!")
            print(f"  • Bond yields records added: {bonds_added}")
            print(f"  • Interest rate records added: {rates_added}")
            
            return True, bonds_added, rates_added
        
        # Run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        success, bonds_count, rates_count = await loop.run_in_executor(None, fetch_incremental_data)
        
        if success:
            print("\n✓ Economic data refresh completed successfully!")
            
            # Send Telegram notification if configured
            if telegram_bot.is_configured():
                try:
                    msg = (
                        f"📊 <b>Economic Data Updated (Incremental)</b>\n\n"
                        f"✅ Bond yields: {bonds_count} new records\n"
                        f"✅ Interest rates: {rates_count} new records\n\n"
                        f"💾 Data stored in MongoDB\n"
                        f"⏰ {datetime.now(pytz.timezone('US/Eastern')).strftime('%Y-%m-%d %I:%M:%S %p %Z')}"
                    )
                    await telegram_bot.send_message(msg)
                    print("✓ Telegram notification sent")
                except Exception as e:
                    print(f"✗ Failed to send Telegram notification: {e}")
        else:
            print("\n✗ Economic data refresh failed!")
            
            if telegram_bot.is_configured():
                try:
                    await telegram_bot.send_message(
                        f"⚠️ <b>Economic Data Refresh Failed</b>\n\n"
                        f"Incremental update encountered an error.\n"
                        f"Please check the logs for details.\n\n"
                        f"Time: {datetime.now(pytz.timezone('US/Eastern')).strftime('%Y-%m-%d %I:%M:%S %p %Z')}"
                    )
                except:
                    pass
        
        print("="*60 + "\n")
        return success
        
    except Exception as e:
        print(f"✗ Error running economic data refresh: {e}")
        import traceback
        traceback.print_exc()
        return False


async def run_daily_economic_calendar_refresh():
    """
    Fetch new economic calendar events incrementally from Trading Economics API.
    Finds the last stored event date in MongoDB and fetches only new/upcoming events.
    Scheduled to run daily at 6:00 AM EST.
    """
    try:
        print("\n" + "="*60)
        print(f"📅 Running scheduled economic calendar refresh (incremental)...")
        print(f"Time: {datetime.now(pytz.timezone('US/Eastern')).strftime('%Y-%m-%d %I:%M:%S %p %Z')}")
        print("="*60)

        def fetch_calendar():
            import subprocess
            import sys

            base_path = os.path.dirname(os.path.abspath(__file__))
            result = subprocess.run(
                [sys.executable, os.path.join(base_path, 'fetch_incremental_economic_calendar.py')],
                capture_output=True,
                text=True
            )

            if result.stdout:
                print(result.stdout)

            if result.returncode != 0:
                print(f"\n✗ Economic calendar fetch failed!")
                if result.stderr:
                    print(f"Error: {result.stderr[:500]}")
                return False, 0

            # Parse affected count from output
            affected = 0
            try:
                for line in result.stdout.split('\n'):
                    if 'Records inserted/updated:' in line:
                        affected = int(line.split(':')[-1].strip())
                        break
            except Exception:
                pass

            return True, affected

        loop = asyncio.get_event_loop()
        success, affected = await loop.run_in_executor(None, fetch_calendar)

        if success:
            print("\n✓ Economic calendar refresh completed successfully!")
            if telegram_bot.is_configured():
                try:
                    await telegram_bot.send_message(
                        f"📅 <b>Economic Calendar Updated</b>\n\n"
                        f"✅ Records inserted/updated: {affected}\n"
                        f"💾 Stored in MongoDB\n"
                        f"⏰ {datetime.now(pytz.timezone('US/Eastern')).strftime('%Y-%m-%d %I:%M:%S %p %Z')}"
                    )
                except Exception as e:
                    print(f"✗ Failed to send Telegram notification: {e}")
        else:
            print("\n✗ Economic calendar refresh failed!")
            if telegram_bot.is_configured():
                try:
                    await telegram_bot.send_message(
                        f"⚠️ <b>Economic Calendar Refresh Failed</b>\n\n"
                        f"Please check the server logs.\n"
                        f"Time: {datetime.now(pytz.timezone('US/Eastern')).strftime('%Y-%m-%d %I:%M:%S %p %Z')}"
                    )
                except Exception:
                    pass

        print("="*60 + "\n")
        return success

    except Exception as e:
        print(f"✗ Error running economic calendar refresh: {e}")
        import traceback
        traceback.print_exc()
        return False


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


async def run_daily_fx_report_download():
    """
    Download the Scotiabank G10 FX Daily report and archive it in MongoDB.

    The source URL has no fixed publish time and no date in it, so this is
    scheduled to run every 15 minutes from 7am-6pm EST (see scheduler setup)
    rather than once at a guessed time. It short-circuits once today's report
    is already archived, and otherwise keeps retrying — a single missed
    fixed-time pull used to mean losing that day's report entirely.
    """
    try:
        est_tz = pytz.timezone('US/Eastern')
        report_date = datetime.now(est_tz).strftime('%Y-%m-%d')

        collection = get_fx_reports_collection()
        if await collection.find_one({'report_date': report_date}):
            return  # already archived for today, nothing to do

        print("\n" + "="*60)
        print(f"🕰️  Checking for today's FX report...")
        print(f"Time: {datetime.now(est_tz).strftime('%Y-%m-%d %I:%M:%S %p %Z')}")
        print("="*60)

        # Import here to avoid circular imports
        from fetch_daily_fx_report import DailyFxReportDownloader

        downloader = DailyFxReportDownloader()
        downloader.db = Database.get_db()
        result = await downloader.run()

        if result == 'downloaded':
            print("✓ Daily FX report download completed successfully!")
            if telegram_bot.is_configured():
                try:
                    await telegram_bot.send_message(
                        f"📄 <b>G10 FX Daily Report Downloaded</b>\n\n"
                        f"⏰ {datetime.now(est_tz).strftime('%Y-%m-%d %I:%M:%S %p %Z')}"
                    )
                except Exception as e:
                    print(f"✗ Failed to send Telegram notification: {e}")
        elif result == 'stale':
            print("⏳ Report not yet published — will check again in 15 minutes")
        else:
            print("✗ Daily FX report download failed — will retry in 15 minutes")
            # Only alert once per day (on the last poll of the window) so a
            # transient failure early in the day doesn't spam every 15 minutes.
            now_est = datetime.now(est_tz)
            if now_est.hour == 17 and now_est.minute == 45 and telegram_bot.is_configured():
                try:
                    await telegram_bot.send_message(
                        f"⚠️ <b>G10 FX Daily Report Not Available Today</b>\n\n"
                        f"Time: {now_est.strftime('%Y-%m-%d %I:%M:%S %p %Z')}\n"
                        f"Checked every 15 minutes since 7am EST with no success. Please check the server logs."
                    )
                except Exception:
                    pass

        print("="*60 + "\n")
        return result

    except Exception as e:
        print(f"✗ Error running daily FX report download: {e}")
        import traceback
        traceback.print_exc()
        return 'failed'


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
        
        # Schedule daily signal capture at 5:00 PM EST
        scheduler.add_job(
            run_daily_signal_capture,
            trigger=CronTrigger(hour=17, minute=0, timezone=est_tz),
            id='daily_signal_capture',
            name='Daily Signal Capture at 5pm EST',
            replace_existing=True
        )
        
        # Schedule daily economic data refresh at 5:00 AM EST
        scheduler.add_job(
            run_daily_economic_data_refresh,
            trigger=CronTrigger(hour=5, minute=0, timezone=est_tz),
            id='daily_economic_data_refresh',
            name='Daily Economic Data Refresh at 5am EST',
            replace_existing=True
        )

        # Schedule daily economic calendar refresh at 6:00 AM EST
        scheduler.add_job(
            run_daily_economic_calendar_refresh,
            trigger=CronTrigger(hour=6, minute=0, timezone=est_tz),
            id='daily_economic_calendar_refresh',
            name='Daily Economic Calendar Refresh at 6am EST',
            replace_existing=True
        )
        
        # Poll for the daily FX report every 15 minutes from 7am-6pm EST.
        # The source has no fixed/known publish time, so a single fixed-time
        # pull risked permanently missing a day if the report went up late.
        # run_daily_fx_report_download() no-ops once today's report is archived.
        scheduler.add_job(
            run_daily_fx_report_download,
            trigger=CronTrigger(hour='7-17', minute='*/15', timezone=est_tz),
            id='daily_fx_report_download',
            name='FX Report Poll every 15min, 7am-6pm EST',
            replace_existing=True
        )

        # Start the scheduler
        scheduler.start()

        # Show next run times
        next_run_signal = scheduler.get_job('daily_signal_capture').next_run_time
        next_run_data = scheduler.get_job('daily_economic_data_refresh').next_run_time
        next_run_calendar = scheduler.get_job('daily_economic_calendar_refresh').next_run_time
        next_run_fx_report = scheduler.get_job('daily_fx_report_download').next_run_time

        print(f"\n✓ Scheduled jobs configured")
        print(f"  • Signal Capture: Every day at 5:00 PM EST")
        print(f"    Next run: {next_run_signal.astimezone(est_tz).strftime('%Y-%m-%d %I:%M:%S %p %Z')}")
        print(f"  • Economic Data: Every day at 5:00 AM EST")
        print(f"    Next run: {next_run_data.astimezone(est_tz).strftime('%Y-%m-%d %I:%M:%S %p %Z')}")
        print(f"  • Economic Calendar: Every day at 6:00 AM EST")
        print(f"    Next run: {next_run_calendar.astimezone(est_tz).strftime('%Y-%m-%d %I:%M:%S %p %Z')}")
        print(f"  • FX Report Poll: Every 15 min, 7:00 AM-6:00 PM EST")
        print(f"    Next check: {next_run_fx_report.astimezone(est_tz).strftime('%Y-%m-%d %I:%M:%S %p %Z')}")
        print()
        
    except Exception as e:
        print(f"✗ Failed to setup schedulers: {e}")
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
    
    # Check if email already exists (username can be duplicate)
    existing_user = await users_collection.find_one({"email": user_data.email})
    
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
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


@app.get("/api/signals/delta")
async def get_signals_delta(
    days: int = 7,
    current_user: Optional[dict] = Depends(get_optional_user)
):
    """
    For each symbol, return the most recent signal record at or before N days ago.
    Used by the frontend to compute live Δ vs N-days-ago without needing daily snapshots.
    """
    target_time = datetime.now(timezone.utc) - timedelta(days=days)

    signals_collection = get_signals_collection()

    pipeline = [
        {"$match": {"timestamp": {"$lte": target_time}}},
        {"$sort": {"symbol": 1, "timestamp": -1}},
        {"$group": {
            "_id": "$symbol",
            "buy_count": {"$first": {"$size": {"$ifNull": ["$buy_signals", []]}}},
            "sell_count": {"$first": {"$size": {"$ifNull": ["$sell_signals", []]}}},
            "timestamp": {"$first": "$timestamp"},
        }},
    ]

    results = await signals_collection.aggregate(pipeline).to_list(length=None)

    data = {}
    for r in results:
        data[r["_id"]] = {
            "bullish": r["buy_count"],
            "bearish": r["sell_count"],
            "timestamp": r["timestamp"].isoformat() if r["timestamp"] else None,
        }

    return {"days": days, "target_time": target_time.isoformat(), "data": data}


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
# - GET /api/watchlist - Get watchlist (read-only)
# - POST /api/watchlist/scan-forex - Scan forex pairs
#
# NOTE: DELETE /api/watchlist/remove/{symbol} is intentionally kept HERE too
# (not only on port 8001). This service (port 8000) runs its own independent
# `monitor` instance with its own in-memory watchlist and its own periodic
# save loop (monitoring_loop). Removing a symbol only on port 8001 does not
# affect this process's in-memory copy, so monitoring_loop silently re-upserts
# the "removed" symbol back into MongoDB on its next cycle. Removal must hit
# both services to stick.
@app.delete("/api/watchlist/remove/{symbol}")
async def remove_from_watchlist_signal_service(symbol: str):
    """Remove symbol from this service's in-memory watchlist + MongoDB"""
    try:
        if not monitor.is_connected():
            raise HTTPException(status_code=503, detail="Monitor service not available")

        await monitor.remove_from_watchlist(symbol)
        return {"status": "success", "symbol": symbol}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

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
async def get_interest_rates(use_cache: bool = True, days: int = 0):
    """
    Get central bank policy rates from MongoDB
    
    Query params:
        use_cache: Not used (kept for backward compatibility)
        days: Number of days of history (0 = all data, default: 0)
    
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
        # Fetch from MongoDB instead of BIS API
        collection = get_interest_rates_collection()
        
        # Calculate cutoff date if days parameter is provided
        cutoff_date = None
        if days > 0:
            cutoff_date = datetime.now() - timedelta(days=days)
        
        results = []
        async for doc in collection.find({}):
            # Get the data array from document
            data_array = doc.get('data', [])
            
            # Return all historical data points (or filtered by date)
            for data_point in data_array:
                # Filter by date if cutoff_date is set
                if cutoff_date and data_point.get('date_obj') and data_point['date_obj'] < cutoff_date:
                    continue
                    
                results.append({
                    'Country': doc.get('country', ''),
                    'Category': doc.get('category', 'Interest Rate'),
                    'DateTime': data_point.get('date_time', ''),
                    'Value': data_point.get('value', 0),
                    'Frequency': doc.get('frequency', 'Daily'),
                    'HistoricalDataSymbol': doc.get('historical_data_symbol', ''),
                    'LastUpdate': data_point.get('last_update', '')
                })
        
        # Sort by DateTime (most recent first)
        results = sorted(results, key=lambda x: x['DateTime'], reverse=True)
        
        return results
        
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to fetch interest rates from MongoDB: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch interest rate data: {str(e)}"
        )


@app.get("/api/bond/interest-rates/{ref_area}")
async def get_historical_interest_rates(ref_area: str, days: int = 365):
    """
    Get historical central bank policy rates for a specific country from MongoDB
    
    Path params:
        ref_area: Country name or BIS code (US/United States, XM/Euro Area, etc.)
    
    Query params:
        days: Number of days of history (default: 365)
    
    Returns:
        List of historical interest rate data
    """
    try:
        # Map BIS codes to country names
        area_to_country = {
            'US': 'United States',
            'XM': 'Euro Area',
            'JP': 'Japan',
            'GB': 'United Kingdom',
            'CA': 'Canada',
            'AU': 'Australia'
        }
        
        # Use mapping if it's a BIS code, otherwise use as-is
        country = area_to_country.get(ref_area.upper(), ref_area)
        
        # Fetch from MongoDB using the updated endpoint
        return await get_interest_rates_from_db(country=country, days=days)
        
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to fetch historical rates: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch historical data: {str(e)}"
        )


# ============================================
# BOND YIELDS & INTEREST RATES FROM MONGODB
# ============================================

@app.get("/api/bond/yields")
async def get_bond_yields(
    country: Optional[str] = None,
    maturity: Optional[str] = None,
    days: int = 365,
    limit: int = 1000
):
    """
    Get bond yield data from MongoDB
    
    Query params:
        country: Filter by country (e.g., "United States", "Canada", "Japan")
        maturity: Filter by maturity ("10y" or "2y")
        days: Number of days of history (default: 365)
        limit: Maximum number of records (default: 1000)
    
    Returns:
        List of bond yield records with OHLC data in original JSON format
    """
    try:
        collection = get_bond_yields_collection()
        
        # Build query for documents
        query = {}
        if country:
            query['country'] = country
        if maturity:
            query['maturity'] = maturity
        
        # Fetch matching documents
        cursor = collection.find(query)
        
        # Calculate cutoff date
        cutoff_date = datetime.now() - timedelta(days=days)
        
        results = []
        async for doc in cursor:
            # Get the data array from document
            data_array = doc.get('data', [])
            
            # Filter by date and transform to original format
            for data_point in data_array:
                if data_point.get('date_obj') and data_point['date_obj'] >= cutoff_date:
                    results.append({
                        'Symbol': doc.get('symbol', ''),
                        'Date': data_point.get('date', ''),
                        'Open': data_point.get('open', 0),
                        'High': data_point.get('high', 0),
                        'Low': data_point.get('low', 0),
                        'Close': data_point.get('close', 0)
                    })
            
            if len(results) >= limit:
                break
        
        # Sort by most recent first and apply limit
        results = sorted(results, key=lambda x: x['Date'], reverse=True)[:limit]
        
        return results
        
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to fetch bond yields: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch bond yields from database: {str(e)}"
        )


@app.get("/api/bond/yields/{country}")
async def get_bond_yields_by_country(
    country: str,
    maturity: Optional[str] = None,
    days: int = 365
):
    """
    Get bond yield data for a specific country
    
    Path params:
        country: Country name (e.g., "United States", "Canada")
    
    Query params:
        maturity: Filter by maturity ("10y" or "2y")
        days: Number of days of history (default: 365)
    
    Returns:
        Bond yield data for the country in original JSON format
    """
    return await get_bond_yields(country=country, maturity=maturity, days=days)


@app.get("/api/interest-rates")
async def get_interest_rates_from_db(
    country: Optional[str] = None,
    days: int = 365,
    limit: int = 1000
):
    """
    Get interest rate data from MongoDB
    
    Query params:
        country: Filter by country (e.g., "United States", "Canada")
        days: Number of days of history (default: 365)
        limit: Maximum number of records (default: 1000)
    
    Returns:
        List of interest rate records in original JSON format
    """
    try:
        collection = get_interest_rates_collection()
        
        # Build query for documents
        query = {}
        if country:
            query['country'] = country
        
        # Fetch matching documents
        cursor = collection.find(query)
        
        # Calculate cutoff date
        cutoff_date = datetime.now() - timedelta(days=days)
        
        results = []
        async for doc in cursor:
            # Get the data array from document
            data_array = doc.get('data', [])
            
            # Filter by date and transform to original format
            for data_point in data_array:
                if data_point.get('date_obj') and data_point['date_obj'] >= cutoff_date:
                    results.append({
                        'Country': doc.get('country', ''),
                        'Category': doc.get('category', 'Interest Rate'),
                        'DateTime': data_point.get('date_time', ''),
                        'Value': data_point.get('value', 0),
                        'Frequency': doc.get('frequency', 'Daily'),
                        'HistoricalDataSymbol': doc.get('historical_data_symbol', ''),
                        'LastUpdate': data_point.get('last_update', '')
                    })
            
            if len(results) >= limit:
                break
        
        # Sort by most recent first and apply limit
        results = sorted(results, key=lambda x: x['DateTime'], reverse=True)[:limit]
        
        return results
        
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to fetch interest rates: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch interest rates from database: {str(e)}"
        )


@app.get("/api/interest-rates/{country}")
async def get_interest_rates_by_country(country: str, days: int = 365):
    """
    Get interest rate data for a specific country
    
    Path params:
        country: Country name (e.g., "United States", "Canada")
    
    Query params:
        days: Number of days of history (default: 365)
    
    Returns:
        Interest rate data for the country in original JSON format
    """
    return await get_interest_rates_from_db(country=country, days=days)


@app.get("/api/data-tracker")
async def get_data_tracker_status():
    """
    Get the status of data fetch tracker for all countries
    
    Returns:
        List of tracker records showing last fetch date and last available date
    """
    try:
        collection = get_data_fetch_tracker_collection()
        
        cursor = collection.find({}).sort([('country', 1), ('data_type', 1)])
        
        results = []
        async for doc in cursor:
            if '_id' in doc:
                doc['_id'] = str(doc['_id'])
            # Convert datetime objects to strings
            for field in ['last_fetch_date', 'last_available_date', 'last_updated']:
                if field in doc and doc[field]:
                    doc[field] = doc[field].isoformat()
            results.append(doc)
        
        return {
            'count': len(results),
            'trackers': results
        }
        
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to fetch data tracker: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch data tracker from database: {str(e)}"
        )


@app.get("/api/countries")
async def get_available_countries():
    """
    Get list of available countries for bond yields and interest rates
    
    Returns:
        List of country names
    """
    countries = [
        "United States",
        "Canada",
        "Japan",
        "Euro Area",
        "United Kingdom",
        "Australia"
    ]
    return {"countries": countries}


@app.get("/api/bond/data-freshness")
async def check_bond_data_freshness():
    """
    Check if bond yield and interest rate data is up to date
    
    Returns:
        Status of data freshness for all countries
        {
            "is_stale": bool,
            "bond_yields": {...},
            "interest_rates": {...},
            "oldest_data_date": "YYYY-MM-DD",
            "message": "..."
        }
    """
    try:
        bond_collection = get_bond_yields_collection()
        ir_collection = get_interest_rates_collection()
        
        today = datetime.now().date()
        results = {
            "is_stale": False,
            "bond_yields": {},
            "interest_rates": {},
            "checked_at": datetime.now().isoformat(),
            "message": "All data is up to date"
        }
        
        # Check bond yields
        cursor = bond_collection.find({})
        oldest_bond_date = None
        async for doc in cursor:
            country = doc.get('country')
            maturity = doc.get('maturity')
            last_date = doc.get('last_available_date')
            
            if last_date:
                last_date_obj = last_date.date() if hasattr(last_date, 'date') else last_date
                days_old = (today - last_date_obj).days
                
                key = f"{country}_{maturity}"
                results['bond_yields'][key] = {
                    "country": country,
                    "maturity": maturity,
                    "last_date": last_date_obj.isoformat(),
                    "days_old": days_old,
                    "is_stale": days_old > 3  # Consider stale if older than 3 days
                }
                
                if days_old > 3:
                    results['is_stale'] = True
                
                if not oldest_bond_date or last_date_obj < oldest_bond_date:
                    oldest_bond_date = last_date_obj
        
        # Check interest rates
        cursor = ir_collection.find({})
        oldest_ir_date = None
        async for doc in cursor:
            country = doc.get('country')
            last_date = doc.get('last_available_date')
            
            if last_date:
                last_date_obj = last_date.date() if hasattr(last_date, 'date') else last_date
                days_old = (today - last_date_obj).days
                
                results['interest_rates'][country] = {
                    "country": country,
                    "last_date": last_date_obj.isoformat(),
                    "days_old": days_old,
                    "is_stale": days_old > 7  # Interest rates update less frequently
                }
                
                if days_old > 7:
                    results['is_stale'] = True
                
                if not oldest_ir_date or last_date_obj < oldest_ir_date:
                    oldest_ir_date = last_date_obj
        
        # Set oldest date and message
        oldest_date = min(filter(None, [oldest_bond_date, oldest_ir_date]))
        results['oldest_data_date'] = oldest_date.isoformat() if oldest_date else None
        
        if results['is_stale']:
            days_since = (today - oldest_date).days if oldest_date else 0
            results['message'] = f"Data is {days_since} days old. Consider refreshing."
        
        return results
        
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to check data freshness: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check data freshness: {str(e)}"
        )


@app.post("/api/bond/refresh-data")
async def trigger_manual_data_refresh(current_user: dict = Depends(get_current_user)):
    """
    Manually trigger incremental bond yield and interest rate data refresh
    Requires authentication. Admin users only recommended.
    
    Returns:
        Status of the refresh operation
    """
    try:
        print("\n" + "="*60)
        print(f"🔄 Manual data refresh triggered by user: {current_user.get('email', 'unknown')}")
        print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("="*60)
        
        # Run the refresh function
        success = await run_daily_economic_data_refresh()
        
        if success:
            return {
                "success": True,
                "message": "Data refresh completed successfully",
                "timestamp": datetime.now().isoformat()
            }
        else:
            raise HTTPException(
                status_code=500,
                detail="Data refresh failed. Check server logs for details."
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to trigger manual refresh: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to trigger data refresh: {str(e)}"
        )


# ============================================
# ECONOMIC CALENDAR ENDPOINTS
# ============================================

@app.get("/api/economic-calendar")
async def get_economic_calendar(
    days_past: int = 30,
    days_future: int = 180,
    country: Optional[str] = None,
    importance: Optional[str] = None
):
    """
    Get economic calendar events from MongoDB.

    Query params:
        days_past: How many past days to include (default: 30)
        days_future: How many future days to include (default: 180)
        country: Filter by country name (optional)
        importance: Filter by importance level (optional)
    """
    try:
        now = datetime.utcnow()
        start_dt = now - timedelta(days=days_past)
        end_dt = now + timedelta(days=days_future)

        query = {
            'date': {
                '$gte': start_dt,
                '$lte': end_dt
            }
        }
        if country:
            query['country'] = country
        if importance:
            query['importance'] = importance

        collection = get_economic_calendar_collection()
        cursor = collection.find(query, {'_id': 0}).sort('date', 1)

        events = []
        async for doc in cursor:
            # Serialize datetime to ISO string for JSON
            doc['date'] = doc['date'].strftime('%Y-%m-%dT%H:%M:%S') if isinstance(doc.get('date'), datetime) else doc.get('date')
            doc['updated_at'] = doc['updated_at'].isoformat() if isinstance(doc.get('updated_at'), datetime) else doc.get('updated_at')
            events.append(doc)

        return {
            'total': len(events),
            'events': events
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch economic calendar: {str(e)}")


@app.post("/api/economic-calendar/refresh")
async def trigger_economic_calendar_refresh(current_user: dict = Depends(get_current_user)):
    """Manually trigger an incremental economic calendar refresh."""
    try:
        success = await run_daily_economic_calendar_refresh()
        if success:
            return {"success": True, "message": "Economic calendar refresh completed", "timestamp": datetime.now().isoformat()}
        raise HTTPException(status_code=500, detail="Calendar refresh failed. Check server logs.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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


@app.get("/api/fx-reports")
async def list_fx_reports(limit: int = 60):
    """
    Get the history of downloaded G10 FX Daily reports, most recent first.
    """
    collection = get_fx_reports_collection()
    reports = await collection.find({}).sort("report_date", -1).limit(limit).to_list(length=limit)

    for report in reports:
        report["_id"] = str(report["_id"])
        if "downloaded_at" in report and isinstance(report["downloaded_at"], datetime):
            report["downloaded_at"] = report["downloaded_at"].isoformat()

    return {"reports": reports, "count": len(reports)}


@app.get("/api/fx-reports/latest")
async def get_latest_fx_report():
    """
    Get metadata for the most recently downloaded G10 FX Daily report.
    """
    collection = get_fx_reports_collection()
    latest = await collection.find_one({}, sort=[("report_date", -1)])

    if not latest:
        raise HTTPException(status_code=404, detail="No FX reports available yet")

    latest["_id"] = str(latest["_id"])
    if "downloaded_at" in latest and isinstance(latest["downloaded_at"], datetime):
        latest["downloaded_at"] = latest["downloaded_at"].isoformat()

    return latest


@app.get("/api/fx-reports/{report_date}/download")
async def download_fx_report(report_date: str):
    """
    Download the PDF file for a specific report date (YYYY-MM-DD).
    """
    collection = get_fx_reports_collection()
    report = await collection.find_one({"report_date": report_date})

    if not report:
        raise HTTPException(status_code=404, detail=f"No FX report found for {report_date}")

    file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fx_reports", report["filename"])
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Report file is missing on disk")

    return FileResponse(file_path, media_type="application/pdf", filename=report["filename"])


@app.get("/api/fx-reports/trigger")
async def trigger_fx_report_download(current_user: UserResponse = Depends(get_current_user)):
    """
    Manually trigger a G10 FX Daily report download (authenticated).

    Use this to backfill today's report or retry without waiting for the
    next scheduled poll.
    """
    try:
        print(f"\n📋 Manual FX report download triggered by user: {current_user.username}")

        est_tz = pytz.timezone('US/Eastern')
        today = datetime.now(est_tz).strftime('%Y-%m-%d')

        await run_daily_fx_report_download()

        collection = get_fx_reports_collection()
        latest = await collection.find_one({}, sort=[("report_date", -1)])

        if latest and latest.get("report_date") == today:
            return {
                "success": True,
                "message": "FX report download completed successfully",
                "report": {
                    "report_date": latest["report_date"],
                    "filename": latest["filename"],
                    "file_size": latest["file_size"],
                }
            }
        else:
            return {
                "success": False,
                "message": "Today's report is not available yet - the source may not have published it"
            }
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Manual FX report trigger failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to trigger FX report download: {str(e)}"
        )


@app.get("/api/fx-reports/schedule-info")
async def get_fx_report_schedule_info():
    """
    Get information about the daily FX report download schedule.
    """
    try:
        job = scheduler.get_job('daily_fx_report_download')
        if job and job.next_run_time:
            est_tz = pytz.timezone('US/Eastern')
            next_run_est = job.next_run_time.astimezone(est_tz)

            return {
                'scheduled': True,
                'schedule': 'Every 15 minutes, 7:00 AM-6:00 PM EST',
                'timezone': 'US/Eastern',
                'next_run_utc': job.next_run_time.isoformat(),
                'next_run_est': next_run_est.strftime('%Y-%m-%d %I:%M:%S %p %Z'),
                'job_name': job.name,
                'job_id': job.id
            }
        else:
            return {
                'scheduled': False,
                'message': 'Daily FX report download is not scheduled'
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
