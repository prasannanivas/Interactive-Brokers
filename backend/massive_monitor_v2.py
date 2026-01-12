"""
MASSIVE API Monitor V2 - New Indicator Logic
Implements comprehensive technical indicators for daily and hourly timeframes
"""

from polygon import RESTClient
import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import asyncio
import json
import os
from database import (
    get_watchlist_collection, 
    get_signal_batches_collection, 
    get_watchlist_changes_collection,
    get_signals_collection
)
from indicator_calculator import IndicatorCalculator


def convert_datetime_to_string(obj: Any) -> Any:
    """Recursively convert all datetime objects to ISO format strings"""
    if isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, dict):
        return {key: convert_datetime_to_string(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_datetime_to_string(item) for item in obj]
    else:
        return obj


class MassiveMonitorV2:
    def __init__(self, api_key: Optional[str] = None, use_db: bool = True):
        """
        Initialize MASSIVE API Monitor V2 with new indicator logic
        
        Args:
            api_key: MASSIVE API key
            use_db: Whether to use MongoDB for storage
        """
        self.api_key = api_key or os.getenv('MASSIVE_API_KEY')
        self.client = None
        self.watchlist: Dict[str, dict] = {}
        self._connected = False
        self._use_db = use_db
        self.indicator_calculator = IndicatorCalculator()

    async def connect(self):
        """Connect to MASSIVE API"""
        try:
            if not self.api_key:
                raise ValueError("MASSIVE_API_KEY not provided")
            
            self.client = RESTClient(self.api_key)
            self._connected = True
            
            # Load watchlist from DB
            if self._use_db:
                await self._load_watchlist()
            
            print(f"✓ Connected to MASSIVE API")
            return True
            
        except Exception as e:
            print(f"✗ Connection error: {e}")
            self._connected = False
            return False

    async def disconnect(self):
        """Disconnect from MASSIVE API"""
        self.client = None
        self._connected = False
        print("✓ Disconnected from MASSIVE API")

    def is_connected(self) -> bool:
        """Check if connected"""
        return self._connected and self.client is not None

    async def _load_watchlist(self):
        """Load watchlist from MongoDB"""
        try:
            if not self._use_db:
                return
            
            watchlist_collection = get_watchlist_collection()
            cursor = watchlist_collection.find({})
            
            async for doc in cursor:
                symbol = doc.get('symbol')
                if symbol:
                    # Convert the entire document recursively to handle all datetime objects
                    clean_doc = convert_datetime_to_string(dict(doc))
                    
                    self.watchlist[symbol] = {
                        'symbol': symbol,
                        'exchange': clean_doc.get('exchange', 'US'),
                        'currency': clean_doc.get('currency', 'USD'),
                        'sec_type': clean_doc.get('sec_type', 'FX'),
                        'market_type': clean_doc.get('market_type', 'forex'),
                        'last_price': clean_doc.get('last_price'),
                        'last_updated': clean_doc.get('last_updated'),
                        'daily_indicators': clean_doc.get('daily_indicators'),
                        'hourly_indicators': clean_doc.get('hourly_indicators'),
                        'weekly_indicators': clean_doc.get('weekly_indicators'),
                        'buy_signals': clean_doc.get('buy_signals', []),
                        'sell_signals': clean_doc.get('sell_signals', [])
                    }
            
            print(f"✓ Loaded {len(self.watchlist)} symbols from MongoDB")
        except Exception as e:
            print(f"✗ Failed to load watchlist: {e}")

    async def _save_watchlist_symbol(self, symbol: str, data: dict):
        """Save or update symbol in MongoDB"""
        try:
            if not self._use_db:
                return
            
            watchlist_collection = get_watchlist_collection()
            
            # Convert datetime to ISO string for JSON serialization
            last_updated = data.get('last_updated')
            if isinstance(last_updated, datetime):
                last_updated = last_updated.isoformat()
            elif isinstance(last_updated, str):
                # Already a string, keep as is
                last_updated = last_updated
            else:
                # None or other type, use current time
                last_updated = datetime.now().isoformat()
            
            doc = {
                'symbol': symbol,
                'exchange': data.get('exchange', 'US'),
                'currency': data.get('currency', 'USD'),
                'sec_type': data.get('sec_type', 'FX'),
                'market_type': data.get('market_type', 'forex'),
                'last_price': data.get('last_price'),
                'last_updated': last_updated,
                'daily_indicators': data.get('daily_indicators'),
                'hourly_indicators': data.get('hourly_indicators'),
                'weekly_indicators': data.get('weekly_indicators'),
                'buy_signals': data.get('buy_signals', []),
                'sell_signals': data.get('sell_signals', [])
            }
            
            await watchlist_collection.update_one(
                {'symbol': symbol},
                {'$set': doc},
                upsert=True
            )
        except Exception as e:
            print(f"✗ Failed to save {symbol}: {e}")

    async def _remove_watchlist_symbol(self, symbol: str):
        """Remove symbol from MongoDB"""
        try:
            if not self._use_db:
                return
            
            watchlist_collection = get_watchlist_collection()
            await watchlist_collection.delete_one({'symbol': symbol})
        except Exception as e:
            print(f"✗ Failed to remove {symbol}: {e}")

    async def _log_signal(self, symbol: str, signal_type: str, data: dict):
        """Log signal to MongoDB"""
        try:
            if not self._use_db:
                return
            
            signals_collection = get_signals_collection()
            
            signal_doc = {
                'symbol': symbol,
                'signal_type': signal_type,
                'timestamp': datetime.now(),
                'price': data.get('last_price'),
                'daily_indicators': data.get('daily_indicators'),
                'hourly_indicators': data.get('hourly_indicators'),
                'weekly_indicators': data.get('weekly_indicators'),
                'buy_signals': data.get('buy_signals', []),
                'sell_signals': data.get('sell_signals', [])
            }
            
            await signals_collection.insert_one(signal_doc)
        except Exception as e:
            print(f"✗ Failed to log signal: {e}")

    async def _fetch_quote(self, symbol: str, market_type: str = "forex") -> Optional[dict]:
        """Fetch current quote for symbol"""
        if not self.is_connected():
            return None

        try:
            from polygon.exceptions import BadResponse
            
            try:
                snapshot = self.client.get_snapshot_ticker(market_type, symbol)
            except BadResponse:
                return None
            
            if snapshot:
                price = 0
                
                # Get last trade price
                if hasattr(snapshot, 'lastTrade') and snapshot.lastTrade:
                    price = snapshot.lastTrade.get('p', 0) if isinstance(snapshot.lastTrade, dict) else getattr(snapshot.lastTrade, 'p', 0)
                
                # Fallback to previous close
                if price == 0:
                    if hasattr(snapshot, 'prevDay') and snapshot.prevDay:
                        price = snapshot.prevDay.get('c', 0) if isinstance(snapshot.prevDay, dict) else getattr(snapshot.prevDay, 'c', 0)
                
                # Last resort: use previous close aggregate
                if price == 0:
                    try:
                        prev_close = self.client.get_previous_close_agg(symbol)
                        if prev_close and len(prev_close) > 0:
                            agg = prev_close[0] if isinstance(prev_close, list) else prev_close
                            price = agg.close if hasattr(agg, 'close') else agg.get('c', 0)
                    except:
                        pass
                
                return {
                    'symbol': symbol,
                    'price': price,
                    'timestamp': datetime.now()
                }
            
            return None

        except Exception as e:
            print(f"✗ Error fetching quote for {symbol}: {e}")
            return None

    async def _fetch_daily_data(self, symbol: str, days: int = 250) -> Optional[pd.DataFrame]:
        """Fetch daily historical data (need 200+ days for SMA200)"""
        if not self.is_connected():
            return None

        try:
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)
            
            aggs = []
            for agg in self.client.list_aggs(
                ticker=symbol,
                multiplier=1,
                timespan="day",
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
            print(f"✗ Error fetching daily data for {symbol}: {e}")
            return None

    async def _fetch_hourly_data(self, symbol: str, days: int = 30) -> Optional[pd.DataFrame]:
        """Fetch hourly historical data (need 100+ hours for EMA100)"""
        if not self.is_connected():
            return None

        try:
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)
            
            aggs = []
            for agg in self.client.list_aggs(
                ticker=symbol,
                multiplier=1,
                timespan="hour",
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
            print(f"✗ Error fetching hourly data for {symbol}: {e}")
            return None

    async def _fetch_weekly_data(self, symbol: str, weeks: int = 30) -> Optional[pd.DataFrame]:
        """Fetch weekly historical data (need 20+ weeks for EMA20)"""
        if not self.is_connected():
            return None

        try:
            end_date = datetime.now()
            start_date = end_date - timedelta(days=weeks*7)  # Convert weeks to days
            
            aggs = []
            for agg in self.client.list_aggs(
                ticker=symbol,
                multiplier=1,
                timespan="week",
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
            print(f"✗ Error fetching weekly data for {symbol}: {e}")
            return None

    async def search_symbols(self, query: str, limit: int = 20) -> List[dict]:
        """Search for symbols using MASSIVE API"""
        if not self.is_connected():
            return []
        
        try:
            results = []
            
            # Run synchronous API call in executor to avoid blocking
            loop = asyncio.get_event_loop()
            tickers = await loop.run_in_executor(
                None,
                lambda: list(self.client.list_tickers(
                    search=query,
                    market='fx',  # Forex only for now
                    active=True,
                    limit=limit
                ))
            )
            
            for ticker in tickers:
                results.append({
                    'symbol': ticker.ticker,
                    'name': ticker.name if hasattr(ticker, 'name') else ticker.ticker,
                    'currency': ticker.currency_name if hasattr(ticker, 'currency_name') else 'USD',
                    'exchange': 'FX',
                    'market_type': 'forex'
                })
            
            return results
        except Exception as e:
            print(f"✗ Error searching symbols: {e}")
            import traceback
            traceback.print_exc()
            return []

    async def add_to_watchlist(self, symbol: str, exchange: str = "FX", currency: str = "USD", 
                                sec_type: str = "FX", market_type: str = "forex"):
        """Add symbol to watchlist and immediately calculate indicators"""
        try:
            if symbol.startswith('C:'):
                market_type = 'forex'
                sec_type = 'FX'
            
            # Fetch initial data
            quote = await self._fetch_quote(symbol, market_type)
            if not quote:
                raise Exception(f"Could not fetch data for {symbol}")

            self.watchlist[symbol] = {
                'symbol': symbol,
                'exchange': exchange,
                'currency': currency,
                'sec_type': sec_type,
                'market_type': market_type,
                'last_price': quote['price'],
                'last_updated': datetime.now().isoformat(),
                'daily_indicators': None,
                'hourly_indicators': None,
                'buy_signals': [],
                'sell_signals': []
            }

            await self._save_watchlist_symbol(symbol, self.watchlist[symbol])
            print(f"✓ Added {symbol} to watchlist, calculating indicators...")

            # Immediately update with indicators
            await self._update_single_symbol(symbol)
            print(f"✓ Indicators calculated for {symbol}")

        except Exception as e:
            print(f"✗ Error adding {symbol}: {e}")
            raise

    async def remove_from_watchlist(self, symbol: str):
        """Remove symbol from watchlist"""
        if symbol in self.watchlist:
            del self.watchlist[symbol]
            await self._remove_watchlist_symbol(symbol)
            print(f"✓ Removed {symbol} from watchlist")

    async def load_watchlist_from_json(self, json_file: str = "watchlist.json"):
        """Load watchlist from JSON file"""
        try:
            with open(json_file, 'r') as f:
                data = json.load(f)
            
            for symbol, info in data.items():
                if symbol not in self.watchlist:
                    await self.add_to_watchlist(
                        symbol=symbol,
                        exchange=info.get('exchange', 'FX'),
                        currency=info.get('currency', 'USD'),
                        sec_type=info.get('sec_type', 'FX'),
                        market_type=info.get('market_type', 'forex')
                    )
            
            print(f"✓ Loaded {len(data)} symbols from {json_file}")
        except Exception as e:
            print(f"✗ Error loading watchlist: {e}")

    async def update_all(self):
        """Update all symbols in watchlist"""
        if not self.is_connected() or not self.watchlist:
            return
        
        print(f"📊 Updating {len(self.watchlist)} symbols...")
        
        for symbol in list(self.watchlist.keys()):
            await self._update_single_symbol(symbol)
        
        print(f"✓ Update complete")

    async def _update_single_symbol(self, symbol: str) -> Optional[dict]:
        """Update a single symbol with new indicator logic"""
        try:
            market_type = self.watchlist[symbol].get('market_type', 'forex')
            
            # Fetch current quote
            quote = await self._fetch_quote(symbol, market_type)
            if not quote:
                return None
            
            current_price = quote['price']
            
            # Fetch historical data
            daily_data = await self._fetch_daily_data(symbol)
            hourly_data = await self._fetch_hourly_data(symbol)
            weekly_data = await self._fetch_weekly_data(symbol)
            
            # Calculate indicators
            daily_indicators = self.indicator_calculator.calculate_all_daily_indicators(daily_data, current_price)
            hourly_indicators = self.indicator_calculator.calculate_all_hourly_indicators(hourly_data, current_price)
            weekly_indicators = self.indicator_calculator.calculate_all_weekly_indicators(weekly_data, current_price)
            
            # Extract signals
            buy_signals, sell_signals = self.indicator_calculator.extract_signals(daily_indicators, hourly_indicators, weekly_indicators)
            
            # Update watchlist
            self.watchlist[symbol].update({
                'last_price': current_price,
                'last_updated': datetime.now().isoformat(),
                'daily_indicators': daily_indicators,
                'hourly_indicators': hourly_indicators,
                'weekly_indicators': weekly_indicators,
                'buy_signals': buy_signals,
                'sell_signals': sell_signals
            })
            
            # Save to DB
            await self._save_watchlist_symbol(symbol, self.watchlist[symbol])
            
            # Log signals if any
            if buy_signals:
                await self._log_signal(symbol, 'BUY', self.watchlist[symbol])
                print(f"🟢 {symbol}: BUY signals - {', '.join(buy_signals)}")
            
            if sell_signals:
                await self._log_signal(symbol, 'SELL', self.watchlist[symbol])
                print(f"🔴 {symbol}: SELL signals - {', '.join(sell_signals)}")
            
            if not buy_signals and not sell_signals:
                print(f"⚪ {symbol}: No signals")
            
            return self.watchlist[symbol]

        except Exception as e:
            print(f"✗ Error updating {symbol}: {e}")
            return None

    async def update_batch(self, start_index: int = 0, batch_size: int = 15) -> dict:
        """Update a batch of symbols in the watchlist"""
        try:
            if not self.watchlist:
                return {
                    'batch_start': 0,
                    'batch_end': 0,
                    'total': 0,
                    'symbols': [],
                    'changes': []
                }
            
            symbols_list = list(self.watchlist.keys())
            total = len(symbols_list)
            end_index = min(start_index + batch_size, total)
            batch = symbols_list[start_index:end_index]
            
            updated_symbols = []
            changes = []
            
            print(f"🔄 Updating batch {start_index+1}-{end_index}/{total}: {', '.join(batch)}")
            
            for symbol in batch:
                updated_data = await self._update_single_symbol(symbol)
                if updated_data:
                    updated_symbols.append(updated_data)
                    
                    # Check for signal changes (for notifications)
                    if updated_data.get('buy_signals') or updated_data.get('sell_signals'):
                        changes.append({
                            'symbol': symbol,
                            'signal': 'BULLISH' if updated_data.get('buy_signals') else 'BEARISH',
                            'price': updated_data.get('last_price'),
                            'buy_signals': updated_data.get('buy_signals', []),
                            'sell_signals': updated_data.get('sell_signals', [])
                        })
            
            return {
                'batch_start': start_index,
                'batch_end': end_index,
                'total': total,
                'symbols': updated_symbols,
                'changes': changes
            }
        
        except Exception as e:
            print(f"✗ Error updating batch: {e}")
            import traceback
            traceback.print_exc()
            return {
                'batch_start': start_index,
                'batch_end': start_index,
                'total': len(self.watchlist),
                'symbols': [],
                'changes': []
            }

    def get_watchlist_data(self) -> dict:
        """Get current watchlist data with JSON-serializable datetime"""
        # Use the recursive converter to ensure ALL datetime objects are converted
        symbols = [convert_datetime_to_string(symbol_data) for symbol_data in self.watchlist.values()]
        
        return {
            'symbols': symbols,
            'count': len(self.watchlist),
            'last_update': datetime.now().isoformat()
        }
