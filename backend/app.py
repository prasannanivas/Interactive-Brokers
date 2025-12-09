"""
FastAPI Backend for Trading Signal Monitor
Real-time monitoring with WebSocket updates and Telegram notifications
Now using MASSIVE API instead of Interactive Brokers
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
import asyncio
import json
import os
from datetime import datetime
from dotenv import load_dotenv
from massive_monitor import MassiveMonitor
from telegram_bot import TelegramBot

# Load environment variables from .env file
load_dotenv()

# Global instances
# Use WATCHLIST_FILE env variable to switch between watchlist.json and watchlist2.json
watchlist_file = os.getenv('WATCHLIST_FILE', 'watchlist.json')
monitor = MassiveMonitor(api_key=os.getenv('MASSIVE_API_KEY'), watchlist_file=watchlist_file)
telegram_bot = TelegramBot()
active_websockets: List[WebSocket] = []


app = FastAPI(title="Trading Signal Monitor API")


@app.on_event("startup")
async def startup_event():
    """Initialize on startup"""
    # Configure Telegram bot from environment variables
    bot_token = os.getenv('TELEGRAM_BOT_TOKEN')
    chat_id = os.getenv('TELEGRAM_CHAT_ID')
    if bot_token and chat_id:
        telegram_bot.configure(bot_token, chat_id)
        print("✓ Telegram bot configured")
    
    success = await monitor.connect()
    if success:
        print("✓ MASSIVE API Monitor connected successfully")
        print("✓ Using 5-minute candles for EMA200 calculations")
        print(f"✓ Loaded {len(monitor.watchlist)} symbols from watchlist")
        print("✓ Server ready - continuous batch monitoring will start shortly")
        
        # Send startup message to Telegram
        if telegram_bot.is_configured():
            try:
                await telegram_bot.send_message(f"🤖 <b>BOT STARTED</b>\n\n✅ Monitoring {len(monitor.watchlist)} symbols\n📊 Continuous batch processing (15 symbols/batch)\n🔔 Instant crossover notifications")
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


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    await monitor.disconnect()
    print("✓ MASSIVE API Monitor disconnected")

# CORS middleware for React frontend
app.add_middleware(
    CORSMiddleware,
    # React dev server + file://
    allow_origins=["http://localhost:3000", "http://localhost:3000/", "null"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global instances (already defined above)
# monitor = IBMonitor()
# telegram_bot = TelegramBot()
# active_websockets: List[WebSocket] = []

# Pydantic models


class Symbol(BaseModel):
    symbol: str
    exchange: str = "SMART"
    currency: str = "USD"


class WatchlistItem(BaseModel):
    symbol: str
    exchange: str = "SMART"
    currency: str = "USD"
    sec_type: str = "STK"


class TelegramConfig(BaseModel):
    chat_id: str
    bot_token: str


class AlgorithmConfig(BaseModel):
    enabled: bool
    rsi_overbought: int = 70
    rsi_oversold: int = 30
    macd_enabled: bool = True
    rsi_enabled: bool = True


# API Endpoints

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


@app.get("/api/symbols/search")
async def search_symbols(query: str):
    """Search for symbols using MASSIVE API"""
    if not query or len(query) < 1:
        return []

    if not monitor.is_connected():
        raise HTTPException(status_code=503, detail="MASSIVE API not connected")

    try:
        # Use MASSIVE API symbol search
        results = await monitor.search_symbols(query)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search error: {str(e)}")


@app.post("/api/watchlist/add")
async def add_to_watchlist(item: WatchlistItem):
    """Add symbol to watchlist"""
    try:
        await monitor.add_to_watchlist(item.symbol, item.exchange, item.currency, item.sec_type)
        return {"status": "success", "symbol": item.symbol}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/watchlist/remove/{symbol}")
async def remove_from_watchlist(symbol: str):
    """Remove symbol from watchlist"""
    try:
        await monitor.remove_from_watchlist(symbol)
        return {"status": "success", "symbol": symbol}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/watchlist")
async def get_watchlist():
    """Get current watchlist with latest signals"""
    return monitor.get_watchlist_data()


@app.post("/api/watchlist/scan-forex")
async def scan_all_forex():
    """Scan and add all forex currency pairs to watchlist"""
    try:
        # Run the scan in background (this might take a while)
        await monitor.add_all_forex_pairs(limit=1000)
        return {
            "status": "success",
            "message": "Forex scan completed",
            "watchlist_count": len(monitor.watchlist)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scan error: {str(e)}")


@app.post("/api/algorithm/configure")
async def configure_algorithm(config: AlgorithmConfig):
    """Configure algorithm parameters"""
    monitor.configure_algorithm(config.dict())
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
    """Background task to continuously monitor symbols in batches"""
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

                    # Send Telegram notification immediately if there are crossovers
                    if updates.get("changes") and telegram_bot.is_configured():
                        bullish_symbols = []
                        bearish_symbols = []
                        
                        for change in updates.get("changes", []):
                            symbol = change.get('symbol')
                            signal = change.get('signal')
                            price = change.get('price')
                            ema200 = change.get('ema200')
                            diff = change.get('diff', 0)
                            
                            if signal == 'BULLISH':
                                bullish_symbols.append(f"{symbol} ({price:.4f} | EMA: {ema200:.4f} | +{diff:.4f})")
                            elif signal == 'BEARISH':
                                bearish_symbols.append(f"{symbol} ({price:.4f} | EMA: {ema200:.4f} | {diff:.4f})")
                        
                        # Send Telegram message only if crossovers detected
                        if bullish_symbols or bearish_symbols:
                            msg_parts = ["📊 <b>Crossed EMA-200</b>\n"]
                            msg_parts.append(f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
                            msg_parts.append(f"📈 Batch {updates.get('batch_start', 0)+1}-{updates.get('batch_end', 0)}/{total_symbols}\n")
                            
                            # Bullish crosses
                            if bullish_symbols:
                                msg_parts.append(f"\n🟢 <b>Bullish Cross: {len(bullish_symbols)}</b>")
                                for sym in bullish_symbols:
                                    msg_parts.append(f"  • {sym}")
                            
                            # Bearish crosses
                            if bearish_symbols:
                                msg_parts.append(f"\n🔴 <b>Bearish Cross: {len(bearish_symbols)}</b>")
                                for sym in bearish_symbols:
                                    msg_parts.append(f"  • {sym}")
                            
                            msg_parts.append(f"\n<i>Using 5-min candles</i>")
                            
                            telegram_message = "\n".join(msg_parts)
                            await telegram_bot.send_message(telegram_message)
                            print(f"📱 Sent Telegram notification: {len(bullish_symbols)} bullish, {len(bearish_symbols)} bearish")

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
