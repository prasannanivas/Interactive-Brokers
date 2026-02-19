"""
Daily Signal Capture Script
Captures trading signals at 5pm EST daily and stores them in MongoDB

This script should be run as a cron job at 5pm EST every day.
It takes a snapshot of all current signals from the watchlist and stores them
with classification as bullish, bearish, or neutral.
"""

import asyncio
import os
from datetime import datetime, timezone
from typing import List, Dict, Any
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from models import DailySignalSnapshot, DailySymbolSignal
import pytz

# Load environment variables
load_dotenv()


class DailySignalCapture:
    """Captures and stores daily signal snapshots"""
    
    def __init__(self):
        """Initialize database connection"""
        self.mongodb_url = os.getenv('MONGODB_URL', 'mongodb://localhost:27017')
        self.db_name = os.getenv('MONGODB_DB_NAME', 'trading_monitor')
        self.client = None
        self.db = None
        self.est_tz = pytz.timezone('US/Eastern')
    
    async def connect(self):
        """Connect to MongoDB"""
        try:
            self.client = AsyncIOMotorClient(self.mongodb_url)
            await self.client.admin.command('ping')
            self.db = self.client[self.db_name]
            print(f"✓ Connected to MongoDB at {self.mongodb_url}")
            return True
        except Exception as e:
            print(f"✗ MongoDB connection failed: {e}")
            return False
    
    async def disconnect(self):
        """Close MongoDB connection"""
        if self.client:
            self.client.close()
            print("✓ MongoDB connection closed")
    
    def classify_signal(self, buy_signals: List[str], sell_signals: List[str]) -> tuple:
        """
        Classify signal as BULLISH, BEARISH, or NEUTRAL
        
        Returns:
            tuple: (signal_type, signal_strength)
        """
        signal_strength = len(buy_signals) - len(sell_signals)
        
        if signal_strength > 0:
            return "BULLISH", signal_strength
        elif signal_strength < 0:
            return "BEARISH", signal_strength
        else:
            return "NEUTRAL", 0
    
    async def capture_signals(self) -> DailySignalSnapshot:
        """
        Capture current signals from all watchlist symbols
        
        Returns:
            DailySignalSnapshot object with all signal data
        """
        print(f"\n{'='*60}")
        print(f"Starting Daily Signal Capture")
        print(f"Time: {datetime.now(self.est_tz).strftime('%Y-%m-%d %I:%M:%S %p %Z')}")
        print(f"{'='*60}\n")
        
        # Get current date (date portion only for snapshot_date)
        capture_timestamp = datetime.now(timezone.utc)
        snapshot_date = datetime.now(self.est_tz).replace(hour=17, minute=0, second=0, microsecond=0)
        snapshot_date = snapshot_date.astimezone(timezone.utc)
        
        # Fetch all watchlist symbols
        watchlist_collection = self.db.watchlist
        symbols_data = []
        
        bullish_count = 0
        bearish_count = 0
        neutral_count = 0
        
        async for symbol_doc in watchlist_collection.find({}):
            buy_signals = symbol_doc.get('buy_signals', [])
            sell_signals = symbol_doc.get('sell_signals', [])
            
            signal_type, signal_strength = self.classify_signal(buy_signals, sell_signals)
            
            # Update counts
            if signal_type == "BULLISH":
                bullish_count += 1
            elif signal_type == "BEARISH":
                bearish_count += 1
            else:
                neutral_count += 1
            
            # Extract indicator data (converting to dict if needed)
            daily_indicators = symbol_doc.get('daily_indicators')
            hourly_indicators = symbol_doc.get('hourly_indicators')
            weekly_indicators = symbol_doc.get('weekly_indicators')
            
            # Convert to dict if they're not None
            if daily_indicators and hasattr(daily_indicators, 'dict'):
                daily_indicators = daily_indicators.dict()
            if hourly_indicators and hasattr(hourly_indicators, 'dict'):
                hourly_indicators = hourly_indicators.dict()
            if weekly_indicators and hasattr(weekly_indicators, 'dict'):
                weekly_indicators = weekly_indicators.dict()
            
            symbol_signal = {
                'symbol': symbol_doc.get('symbol'),
                'last_price': symbol_doc.get('last_price'),
                'signal_type': signal_type,
                'signal_strength': signal_strength,
                'buy_signals': buy_signals,
                'sell_signals': sell_signals,
                'daily_indicators': daily_indicators,
                'hourly_indicators': hourly_indicators,
                'weekly_indicators': weekly_indicators
            }
            
            symbols_data.append(symbol_signal)
            
            # Print signal info
            emoji = "🟢" if signal_type == "BULLISH" else "🔴" if signal_type == "BEARISH" else "⚪"
            print(f"{emoji} {symbol_doc.get('symbol'):8} - {signal_type:8} (Strength: {signal_strength:+2d}) "
                  f"| Buy: {len(buy_signals)}, Sell: {len(sell_signals)}")
        
        total_symbols = len(symbols_data)
        
        print(f"\n{'='*60}")
        print(f"Summary:")
        print(f"  Total Symbols: {total_symbols}")
        print(f"  🟢 Bullish: {bullish_count} ({bullish_count/total_symbols*100:.1f}%)")
        print(f"  🔴 Bearish: {bearish_count} ({bearish_count/total_symbols*100:.1f}%)")
        print(f"  ⚪ Neutral: {neutral_count} ({neutral_count/total_symbols*100:.1f}%)")
        print(f"{'='*60}\n")
        
        # Create snapshot
        snapshot = DailySignalSnapshot(
            snapshot_date=snapshot_date,
            capture_timestamp=capture_timestamp,
            total_symbols=total_symbols,
            bullish_count=bullish_count,
            bearish_count=bearish_count,
            neutral_count=neutral_count,
            signals=symbols_data
        )
        
        return snapshot
    
    async def save_snapshot(self, snapshot: DailySignalSnapshot):
        """
        Save snapshot to MongoDB
        
        Args:
            snapshot: DailySignalSnapshot object to save
        """
        collection = self.db.daily_signal_snapshots
        
        try:
            # Convert to dict
            snapshot_dict = snapshot.model_dump()
            
            # Use update with upsert to avoid duplicates for the same day
            result = await collection.update_one(
                {'snapshot_date': snapshot.snapshot_date},
                {'$set': snapshot_dict},
                upsert=True
            )
            
            if result.upserted_id:
                print(f"✓ New daily snapshot created with ID: {result.upserted_id}")
            else:
                print(f"✓ Daily snapshot updated for {snapshot.snapshot_date.strftime('%Y-%m-%d')}")
            
            return True
        except Exception as e:
            print(f"✗ Failed to save snapshot: {e}")
            return False
    
    async def run(self):
        """Main execution method"""
        try:
            # Connect to database
            if not await self.connect():
                return False
            
            # Capture signals
            snapshot = await self.capture_signals()
            
            # Save snapshot
            success = await self.save_snapshot(snapshot)
            
            # Disconnect
            await self.disconnect()
            
            return success
        except Exception as e:
            print(f"✗ Error during signal capture: {e}")
            import traceback
            traceback.print_exc()
            return False


async def main():
    """Main entry point"""
    capturer = DailySignalCapture()
    success = await capturer.run()
    
    if success:
        print("\n✓ Daily signal capture completed successfully!")
        return 0
    else:
        print("\n✗ Daily signal capture failed!")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)
