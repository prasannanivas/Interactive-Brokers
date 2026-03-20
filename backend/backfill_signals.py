"""
Historical Signal Backfill Script
Fills missing daily signal snapshots from January 1, 2025 to present

This script fetches historical OHLC data and calculates technical indicators
for each date to recreate what the signals would have been at that time.
"""

import asyncio
import os
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from polygon import RESTClient
import pandas as pd
import pytz
from models import DailySignalSnapshot
from indicator_calculator import IndicatorCalculator

# Load environment variables
load_dotenv()


class SignalBackfiller:
    """Backfills historical signal snapshots"""
    
    def __init__(self, start_date: str = "2025-01-01"):
        """
        Initialize backfiller
        
        Args:
            start_date: Start date for backfill in YYYY-MM-DD format
        """
        self.mongodb_url = os.getenv('MONGODB_URL', 'mongodb://localhost:27017')
        self.db_name = os.getenv('MONGODB_DB_NAME', 'trading_monitor')
        self.polygon_api_key = os.getenv('MASSIVE_API_KEY')
        self.client = None
        self.db = None
        self.polygon_client = None
        self.indicator_calculator = IndicatorCalculator()
        self.est_tz = pytz.timezone('US/Eastern')
        
        # Parse start date
        self.start_date = datetime.strptime(start_date, '%Y-%m-%d').replace(
            hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc
        )
        
    async def connect(self):
        """Connect to MongoDB and Polygon API"""
        try:
            # MongoDB
            self.client = AsyncIOMotorClient(self.mongodb_url)
            await self.client.admin.command('ping')
            self.db = self.client[self.db_name]
            print(f"✓ Connected to MongoDB at {self.mongodb_url}")
            
            # Polygon API
            if not self.polygon_api_key:
                raise ValueError("MASSIVE_API_KEY not found in environment")
            self.polygon_client = RESTClient(self.polygon_api_key)
            print(f"✓ Connected to Polygon.io API")
            
            return True
        except Exception as e:
            print(f"✗ Connection failed: {e}")
            return False
    
    async def disconnect(self):
        """Close connections"""
        if self.client:
            self.client.close()
            print("✓ Connections closed")
    
    def _fetch_historical_data_up_to_date(
        self, 
        symbol: str, 
        target_date: datetime,
        timespan: str = "day",
        days_back: int = 250
    ) -> Optional[pd.DataFrame]:
        """
        Fetch historical data UP TO a specific target date
        
        Args:
            symbol: Trading symbol
            target_date: The date to fetch data up to
            timespan: "day", "hour", or "week"
            days_back: How many days of history to fetch
            
        Returns:
            DataFrame with OHLC data
        """
        try:
            end_date = target_date
            start_date = end_date - timedelta(days=days_back)
            
            aggs = []
            for agg in self.polygon_client.list_aggs(
                ticker=symbol,
                multiplier=1,
                timespan=timespan,
                from_=start_date.strftime('%Y-%m-%d'),
                to=end_date.strftime('%Y-%m-%d'),
                adjusted=True,
                sort="asc",
                limit=50000
            ):
                aggs.append({
                    'timestamp': agg.timestamp,
                    'open': agg.open,
                    'high': agg.high,
                    'low': agg.low,
                    'close': agg.close,
                    'volume': agg.volume
                })
            
            if aggs:
                df = pd.DataFrame(aggs)
                df['date'] = pd.to_datetime(df['timestamp'], unit='ms')
                df = df.set_index('date')
                return df[['open', 'high', 'low', 'close', 'volume']]
            
            return None

        except Exception as e:
            print(f"✗ Error fetching {timespan} data for {symbol} up to {target_date.date()}: {e}")
            return None
    
    def _classify_signal(self, buy_signals: List[str], sell_signals: List[str]) -> tuple:
        """
        Classify signal as BULLISH, BEARISH, or NEUTRAL
        Same logic as capture_daily_signals.py
        
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
    
    async def _get_watchlist_symbols(self) -> List[str]:
        """Get all symbols from the watchlist"""
        watchlist_collection = self.db.watchlist
        symbols = []
        
        async for doc in watchlist_collection.find({}, {'symbol': 1}):
            symbols.append(doc['symbol'])
        
        return symbols
    
    async def _snapshot_exists(self, snapshot_date: datetime) -> bool:
        """Check if snapshot already exists for given date"""
        collection = self.db.daily_signal_snapshots
        count = await collection.count_documents({'snapshot_date': snapshot_date})
        return count > 0
    
    async def _process_symbol_for_date(
        self, 
        symbol: str, 
        target_date: datetime
    ) -> Optional[Dict]:
        """
        Process a single symbol for a specific date
        
        Args:
            symbol: Trading symbol
            target_date: The date to analyze
            
        Returns:
            Dict with symbol signal data or None if failed
        """
        try:
            # Fetch historical data UP TO target date
            daily_data = self._fetch_historical_data_up_to_date(
                symbol, target_date, timespan="day", days_back=250
            )
            hourly_data = self._fetch_historical_data_up_to_date(
                symbol, target_date, timespan="hour", days_back=30
            )
            weekly_data = self._fetch_historical_data_up_to_date(
                symbol, target_date, timespan="week", days_back=210  # ~30 weeks
            )
            
            # Check if we have sufficient data
            if daily_data is None or len(daily_data) < 50:
                print(f"  ⚠️  {symbol:8} - Insufficient daily data ({len(daily_data) if daily_data is not None else 0} bars)")
                return None
            
            # Get the last price from the daily data (the price on target date)
            current_price = float(daily_data.iloc[-1]['close'])
            
            # Calculate indicators
            daily_indicators = self.indicator_calculator.calculate_all_daily_indicators(
                daily_data, current_price
            )
            hourly_indicators = self.indicator_calculator.calculate_all_hourly_indicators(
                hourly_data, current_price
            ) if hourly_data is not None else None
            weekly_indicators = self.indicator_calculator.calculate_all_weekly_indicators(
                weekly_data, current_price
            ) if weekly_data is not None else None
            
            # Extract signals
            buy_signals, sell_signals = self.indicator_calculator.extract_signals(
                daily_indicators, hourly_indicators, weekly_indicators
            )
            
            # Classify signal
            signal_type, signal_strength = self._classify_signal(buy_signals, sell_signals)
            
            # Build symbol data
            symbol_data = {
                'symbol': symbol,
                'last_price': current_price,
                'signal_type': signal_type,
                'signal_strength': signal_strength,
                'buy_signals': buy_signals,
                'sell_signals': sell_signals,
                'daily_indicators': daily_indicators,
                'hourly_indicators': hourly_indicators,
                'weekly_indicators': weekly_indicators
            }
            
            # Print signal info
            emoji = "🟢" if signal_type == "BULLISH" else "🔴" if signal_type == "BEARISH" else "⚪"
            print(f"  {emoji} {symbol:8} - {signal_type:8} (Strength: {signal_strength:+2d}) "
                  f"| Buy: {len(buy_signals)}, Sell: {len(sell_signals)} | Price: ${current_price:.4f}")
            
            return symbol_data
            
        except Exception as e:
            print(f"  ✗ {symbol:8} - Error: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _extract_indicator_states(self, symbol_data: dict) -> dict:
        """
        Extract current state of all indicators from symbol data
        Returns dict: {indicator_name: state}
        """
        from state_tracker import extract_current_indicator_states
        return extract_current_indicator_states(symbol_data)
    
    async def _get_previous_snapshot(self, target_date: datetime) -> Optional[dict]:
        """Get the snapshot from the previous trading day"""
        collection = self.db.daily_signal_snapshots
        
        # Find previous snapshot (before target_date)
        prev_snapshot = await collection.find_one(
            {'snapshot_date': {'$lt': target_date}},
            sort=[('snapshot_date', -1)]
        )
        
        return prev_snapshot
    
    async def _track_indicator_changes(
        self, 
        target_date: datetime,
        current_symbols_data: List[dict],
        previous_snapshot: Optional[dict]
    ) -> int:
        """
        Track indicator changes by comparing current snapshot with previous
        Returns number of changes tracked
        """
        if not previous_snapshot:
            print(f"  📝 No previous snapshot found - skipping indicator change tracking")
            return 0
        
        # Build previous states lookup
        prev_states_by_symbol = {}
        for prev_signal in previous_snapshot.get('signals', []):
            symbol = prev_signal['symbol']
            prev_states_by_symbol[symbol] = self._extract_indicator_states(prev_signal)
        
        # Track changes
        indicator_states_collection = self.db.indicator_states
        changes_count = 0
        
        snapshot_timestamp = target_date.replace(hour=17, minute=0, second=0, microsecond=0)
        est_timestamp = self.est_tz.localize(snapshot_timestamp.replace(tzinfo=None))
        timestamp_utc = est_timestamp.astimezone(timezone.utc)
        
        for current_data in current_symbols_data:
            symbol = current_data['symbol']
            current_states = self._extract_indicator_states(current_data)
            prev_states = prev_states_by_symbol.get(symbol, {})
            
            # Check each indicator for changes
            for indicator, current_state in current_states.items():
                prev_state = prev_states.get(indicator, 'NEUTRAL')
                
                if prev_state != current_state:
                    # State changed - record it
                    await indicator_states_collection.insert_one({
                        'symbol': symbol,
                        'indicator': indicator,
                        'from_state': prev_state,
                        'to_state': current_state,
                        'timestamp': timestamp_utc.isoformat(),
                        'price': current_data.get('last_price')
                    })
                    changes_count += 1
        
        return changes_count
    
    async def _backfill_date(self, target_date: datetime) -> bool:
        """
        Backfill signals for a specific date
        
        Args:
            target_date: The date to backfill
            
        Returns:
            True if successful, False otherwise
        """
        # Check if already exists
        if await self._snapshot_exists(target_date):
            print(f"📅 {target_date.strftime('%Y-%m-%d')} - Already exists, skipping")
            return True
        
        print(f"\n{'='*70}")
        print(f"📅 Processing: {target_date.strftime('%Y-%m-%d %A')}")
        print(f"{'='*70}")
        
        # Get watchlist symbols
        symbols = await self._get_watchlist_symbols()
        print(f"📊 Processing {len(symbols)} symbols...\n")
        
        # Process each symbol
        symbols_data = []
        bullish_count = 0
        bearish_count = 0
        neutral_count = 0
        
        for symbol in symbols:
            symbol_data = await self._process_symbol_for_date(symbol, target_date)
            
            if symbol_data:
                symbols_data.append(symbol_data)
                
                if symbol_data['signal_type'] == "BULLISH":
                    bullish_count += 1
                elif symbol_data['signal_type'] == "BEARISH":
                    bearish_count += 1
                else:
                    neutral_count += 1
        
        if not symbols_data:
            print(f"✗ No data available for {target_date.strftime('%Y-%m-%d')}")
            return False
        
        total_symbols = len(symbols_data)
        
        print(f"\n{'='*70}")
        print(f"Summary for {target_date.strftime('%Y-%m-%d')}:")
        print(f"  Total: {total_symbols}/{len(symbols)} symbols")
        print(f"  🟢 Bullish: {bullish_count} ({bullish_count/total_symbols*100:.1f}%)")
        print(f"  🔴 Bearish: {bearish_count} ({bearish_count/total_symbols*100:.1f}%)")
        print(f"  ⚪ Neutral: {neutral_count} ({neutral_count/total_symbols*100:.1f}%)")
        print(f"{'='*70}")
        
        # Create snapshot
        # Snapshot date is at 5pm EST on the target date
        snapshot_date = target_date.replace(hour=17, minute=0, second=0, microsecond=0)
        # Convert to EST then back to UTC
        est_date = self.est_tz.localize(snapshot_date.replace(tzinfo=None))
        snapshot_date_utc = est_date.astimezone(timezone.utc)
        
        snapshot = DailySignalSnapshot(
            snapshot_date=snapshot_date_utc,
            capture_timestamp=datetime.now(timezone.utc),
            total_symbols=total_symbols,
            bullish_count=bullish_count,
            bearish_count=bearish_count,
            neutral_count=neutral_count,
            signals=symbols_data
        )
        
        # Save snapshot to database
        try:
            collection = self.db.daily_signal_snapshots
            snapshot_dict = snapshot.model_dump()
            
            result = await collection.update_one(
                {'snapshot_date': snapshot.snapshot_date},
                {'$set': snapshot_dict},
                upsert=True
            )
            
            if result.upserted_id:
                print(f"✓ Snapshot saved with ID: {result.upserted_id}")
            else:
                print(f"✓ Snapshot updated")
            
            # Track indicator changes (compare with previous day)
            print(f"  📊 Tracking indicator changes...")
            previous_snapshot = await self._get_previous_snapshot(snapshot_date_utc)
            changes_count = await self._track_indicator_changes(
                target_date, 
                symbols_data, 
                previous_snapshot
            )
            
            if changes_count > 0:
                print(f"  ✓ Recorded {changes_count} indicator state changes")
            else:
                print(f"  • No indicator changes detected")
            
            print()
            
            return True
        except Exception as e:
            print(f"✗ Failed to save snapshot: {e}\n")
            import traceback
            traceback.print_exc()
            return False
    
    def _generate_date_range(self) -> List[datetime]:
        """
        Generate list of dates to backfill (excluding weekends)
        
        Returns:
            List of datetime objects
        """
        dates = []
        current = self.start_date
        end = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        
        while current <= end:
            # Skip weekends (Saturday=5, Sunday=6)
            if current.weekday() < 5:  # Monday=0, Friday=4
                dates.append(current)
            current += timedelta(days=1)
        
        return dates
    
    async def run(self, max_days: Optional[int] = None, skip_existing: bool = True):
        """
        Main execution method
        
        Args:
            max_days: Maximum number of days to backfill (None = all)
            skip_existing: Whether to skip dates that already have snapshots
        """
        try:
            # Connect
            if not await self.connect():
                return False
            
            # Generate date range
            dates = self._generate_date_range()
            
            # REVERSE: Process from most recent to oldest
            dates.reverse()
            
            if max_days:
                dates = dates[:max_days]  # Take the first N days (most recent after reverse)
            
            print(f"\n{'='*70}")
            print(f"🚀 Historical Signal Backfill (REVERSE ORDER)")
            print(f"{'='*70}")
            print(f"Start Date (processing from): {datetime.now(timezone.utc).strftime('%Y-%m-%d')}")
            print(f"End Date (processing to): {self.start_date.strftime('%Y-%m-%d')}")
            print(f"Total Dates: {len(dates)} (excluding weekends)")
            if max_days:
                print(f"Limiting to: Most recent {max_days} days")
            print(f"{'='*70}\n")
            
            # Process each date
            success_count = 0
            skip_count = 0
            fail_count = 0
            
            for i, date in enumerate(dates, 1):
                print(f"\n[{i}/{len(dates)}] ", end="")
                
                if skip_existing and await self._snapshot_exists(date):
                    print(f"📅 {date.strftime('%Y-%m-%d')} - Already exists, skipping")
                    skip_count += 1
                else:
                    success = await self._backfill_date(date)
                    if success:
                        success_count += 1
                    else:
                        fail_count += 1
                
                # Small delay to avoid hitting API rate limits
                await asyncio.sleep(0.5)
            
            # Final summary
            print(f"\n{'='*70}")
            print(f"🏁 Backfill Complete!")
            print(f"{'='*70}")
            print(f"✓ Successfully backfilled: {success_count} days")
            print(f"📋 Skipped (already exist): {skip_count} days")
            print(f"✗ Failed: {fail_count} days")
            print(f"Total processed: {len(dates)} days")
            print(f"{'='*70}\n")
            
            # Disconnect
            await self.disconnect()
            
            return True
            
        except Exception as e:
            print(f"\n✗ Error during backfill: {e}")
            import traceback
            traceback.print_exc()
            return False


async def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Backfill historical daily signal snapshots')
    parser.add_argument('--start-date', default='2025-01-01', help='Start date (YYYY-MM-DD)')
    parser.add_argument('--max-days', type=int, help='Maximum number of days to backfill')
    parser.add_argument('--no-skip', action='store_true', help='Re-process existing snapshots')
    
    args = parser.parse_args()
    
    backfiller = SignalBackfiller(start_date=args.start_date)
    success = await backfiller.run(
        max_days=args.max_days,
        skip_existing=not args.no_skip
    )
    
    return 0 if success else 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)
