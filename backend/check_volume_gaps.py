"""
Volume Gap Detection and Backfill Script

Identifies missing or zero volume bars in historical forex data
and attempts to backfill from MASSIVE API.
"""

import asyncio
import os
from datetime import datetime, timedelta
from typing import List, Dict, Tuple
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from polygon import RESTClient
import pandas as pd
from collections import defaultdict

# Load environment variables
load_dotenv()


class VolumeGapChecker:
    """Check and backfill missing volume data for forex pairs"""
    
    def __init__(self):
        self.mongodb_url = os.getenv('MONGODB_URL', 'mongodb://localhost:27017')
        self.db_name = os.getenv('MONGODB_DB_NAME', 'trading_monitor')
        self.massive_api_key = os.getenv('MASSIVE_API_KEY')
        self.client = None
        self.db = None
        self.polygon_client = None
        
    async def connect(self):
        """Connect to MongoDB and MASSIVE API"""
        try:
            # MongoDB
            self.client = AsyncIOMotorClient(self.mongodb_url)
            await self.client.admin.command('ping')
            self.db = self.client[self.db_name]
            print(f"✓ Connected to MongoDB")
            
            # MASSIVE API (Polygon)
            if not self.massive_api_key:
                raise ValueError("MASSIVE_API_KEY not found in environment")
            self.polygon_client = RESTClient(self.massive_api_key)
            print(f"✓ Connected to MASSIVE API")
            
            return True
        except Exception as e:
            print(f"✗ Connection failed: {e}")
            return False
    
    async def disconnect(self):
        """Close connections"""
        if self.client:
            self.client.close()
            print("✓ Connections closed")
    
    async def get_watchlist_symbols(self) -> List[str]:
        """Get all symbols from watchlist"""
        collection = self.db.watchlist
        cursor = collection.find({}, {'symbol': 1})
        symbols = []
        async for doc in cursor:
            symbols.append(doc['symbol'])
        return symbols
    
    async def check_volume_gaps(
        self, 
        symbols: List[str], 
        start_date: str = None,
        end_date: str = None,
        min_volume: float = 0.0
    ) -> Dict[str, List[Dict]]:
        """
        Check for missing or zero volume in daily snapshots
        
        Args:
            symbols: List of currency pair symbols
            start_date: Start date in YYYY-MM-DD format
            end_date: End date in YYYY-MM-DD format
            min_volume: Minimum volume threshold (default: 0.0 = check for zero/null)
        
        Returns:
            Dictionary mapping symbols to list of gaps
        """
        if not start_date:
            start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')  # Reduced to 30 days
        if not end_date:
            end_date = datetime.now().strftime('%Y-%m-%d')
        
        start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        end_dt = datetime.strptime(end_date, '%Y-%m-%d')
        
        print(f"\n{'='*70}")
        print(f"🔍 Checking Volume Gaps")
        print(f"{'='*70}")
        print(f"Date Range: {start_date} to {end_date}")
        print(f"Symbols: {len(symbols)}")
        print(f"Min Volume Threshold: {min_volume}")
        print(f"{'='*70}\n")
        
        gaps_by_symbol = {}
        collection = self.db.daily_signal_snapshots
        
        total_gaps = 0
        
        # Get all snapshots in date range ONCE (more efficient)
        print("📥 Loading snapshots...")
        cursor = collection.find({
            'snapshot_date': {
                '$gte': start_dt,
                '$lte': end_dt
            }
        }).sort('snapshot_date', 1)
        
        snapshots = await cursor.to_list(length=1000)  # Limit to avoid memory issues
        print(f"✓ Loaded {len(snapshots)} snapshots\n")
        
        # Now check each symbol across all snapshots
        for i, symbol in enumerate(symbols, 1):
            print(f"  [{i}/{len(symbols)}] Checking {symbol}...", end='\r')
            symbol_gaps = []
            
            # Check this symbol in each snapshot
            for snapshot in snapshots:
                date = snapshot['snapshot_date']
                signals = snapshot.get('signals', [])
                
                # Find this symbol in the snapshot
                symbol_found = False
                for signal in signals:
                    if signal.get('symbol') == symbol:
                        symbol_found = True
                        volume = signal.get('volume', 0)
                        
                        # Check if volume is missing or below threshold
                        if volume is None or volume <= min_volume:
                            symbol_gaps.append({
                                'date': date.strftime('%Y-%m-%d'),
                                'volume': volume,
                                'issue': 'zero_volume' if volume == 0 else 'null_volume'
                            })
                        break
                
                # Symbol not in snapshot at all
                if not symbol_found and date.weekday() < 5:  # Weekdays only
                    symbol_gaps.append({
                        'date': date.strftime('%Y-%m-%d'),
                        'volume': None,
                        'issue': 'missing_symbol'
                    })
            
            if symbol_gaps:
                gaps_by_symbol[symbol] = symbol_gaps
                total_gaps += len(symbol_gaps)
        
        print()  # Clear the progress line
        
        # Display results
        print(f"\n📊 Volume Gap Summary:")
        print(f"   Symbols with gaps: {len(gaps_by_symbol)}/{len(symbols)}")
        print(f"   Total gaps found: {total_gaps}\n")
        
        if gaps_by_symbol:
            print(f"{'Symbol':<15} {'Gaps':<8} {'Sample Dates'}")
            print(f"{'-'*70}")
            
            for symbol, gaps in sorted(gaps_by_symbol.items(), key=lambda x: len(x[1]), reverse=True):
                sample_dates = ', '.join([g['date'] for g in gaps[:3]])
                if len(gaps) > 3:
                    sample_dates += f" ... +{len(gaps)-3} more"
                print(f"{symbol:<15} {len(gaps):<8} {sample_dates}")
        else:
            print("✅ No volume gaps found!")
        
        return gaps_by_symbol
    
    async def backfill_volume_gaps(
        self, 
        gaps_by_symbol: Dict[str, List[Dict]],
        dry_run: bool = True
    ) -> Dict[str, int]:
        """
        Backfill missing volume data from MASSIVE API
        
        Args:
            gaps_by_symbol: Dictionary from check_volume_gaps()
            dry_run: If True, only simulate changes
        
        Returns:
            Dictionary with backfill statistics
        """
        stats = {
            'attempted': 0,
            'success': 0,
            'failed': 0,
            'no_data_available': 0
        }
        
        mode_indicator = "🔍 DRY RUN" if dry_run else "✏️  LIVE MODE"
        print(f"\n{'='*70}")
        print(f"{mode_indicator} - Backfilling Volume Data")
        print(f"{'='*70}\n")
        
        for symbol, gaps in gaps_by_symbol.items():
            print(f"\n📈 Processing {symbol} ({len(gaps)} gaps)...")
            
            for gap in gaps:
                stats['attempted'] += 1
                date = gap['date']
                
                try:
                    # Fetch data from MASSIVE API for this specific date
                    date_obj = datetime.strptime(date, '%Y-%m-%d')
                    
                    # Get aggregates for the day
                    # Format: C:EURUSD -> C:EUR-USD for Polygon API
                    api_symbol = symbol.replace('C:', 'C:').replace('JPY', '-JPY').replace('USD', '-USD')
                    
                    print(f"  🔄 Fetching {date}...", end='')
                    
                    # Get bars for this date
                    aggs = self.polygon_client.get_aggs(
                        ticker=api_symbol,
                        multiplier=1,
                        timespan="day",
                        from_=date,
                        to=date,
                        limit=1
                    )
                    
                    if aggs and len(aggs) > 0:
                        bar = aggs[0]
                        volume = getattr(bar, 'volume', 0)
                        
                        if volume > 0:
                            if not dry_run:
                                # Update the snapshot in database
                                await self._update_volume_in_snapshot(symbol, date_obj, volume, bar)
                            
                            print(f" ✓ Found volume: {volume:,.0f}")
                            stats['success'] += 1
                        else:
                            print(f" ⚠️  Zero volume on API")
                            stats['no_data_available'] += 1
                    else:
                        print(f" ⚠️  No data available")
                        stats['no_data_available'] += 1
                
                except Exception as e:
                    print(f" ✗ Error: {str(e)[:50]}")
                    stats['failed'] += 1
                
                # Rate limiting
                await asyncio.sleep(0.2)  # 5 requests per second max
        
        # Print summary
        print(f"\n{'='*70}")
        print(f"Backfill Summary:")
        print(f"  Attempted: {stats['attempted']}")
        print(f"  ✓ Success: {stats['success']}")
        print(f"  ✗ Failed: {stats['failed']}")
        print(f"  ℹ No Data: {stats['no_data_available']}")
        print(f"{'='*70}\n")
        
        if dry_run and stats['success'] > 0:
            print(f"💡 Run with --live flag to apply changes to database")
        
        return stats
    
    async def _update_volume_in_snapshot(
        self, 
        symbol: str, 
        date: datetime, 
        volume: float,
        bar: any
    ):
        """Update volume for a symbol in a specific snapshot"""
        collection = self.db.daily_signal_snapshots
        
        # Find the snapshot for this date
        snapshot = await collection.find_one({
            'snapshot_date': date
        })
        
        if not snapshot:
            print(f"    ⚠️  Snapshot not found for {date.strftime('%Y-%m-%d')}")
            return
        
        # Update the volume in signals array
        signals = snapshot.get('signals', [])
        updated = False
        
        for signal in signals:
            if signal.get('symbol') == symbol:
                # Update volume and OHLC if available
                signal['volume'] = volume
                if hasattr(bar, 'open'):
                    signal['open'] = bar.open
                if hasattr(bar, 'high'):
                    signal['high'] = bar.high
                if hasattr(bar, 'low'):
                    signal['low'] = bar.low
                if hasattr(bar, 'close'):
                    signal['close'] = bar.close
                updated = True
                break
        
        if updated:
            # Save back to database
            await collection.update_one(
                {'_id': snapshot['_id']},
                {'$set': {'signals': signals}}
            )


async def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Check and backfill volume gaps in forex data')
    parser.add_argument('--start-date', help='Start date YYYY-MM-DD (default: 90 days ago)')
    parser.add_argument('--end-date', help='End date YYYY-MM-DD (default: today)')
    parser.add_argument('--symbols', nargs='+', help='Specific symbols to check (default: all watchlist)')
    parser.add_argument('--min-volume', type=float, default=0.0, help='Minimum volume threshold')
    parser.add_argument('--backfill', action='store_true', help='Backfill gaps after checking')
    parser.add_argument('--live', action='store_true', help='Apply changes (default is dry-run)')
    
    args = parser.parse_args()
    
    checker = VolumeGapChecker()
    
    try:
        # Connect
        if not await checker.connect():
            return
        
        # Get symbols
        if args.symbols:
            symbols = args.symbols
        else:
            symbols = await checker.get_watchlist_symbols()
            print(f"Found {len(symbols)} symbols in watchlist")
        
        # Check for gaps
        gaps = await checker.check_volume_gaps(
            symbols=symbols,
            start_date=args.start_date,
            end_date=args.end_date,
            min_volume=args.min_volume
        )
        
        # Backfill if requested
        if args.backfill and gaps:
            stats = await checker.backfill_volume_gaps(
                gaps_by_symbol=gaps,
                dry_run=not args.live
            )
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await checker.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
