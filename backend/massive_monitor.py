"""
MASSIVE API Monitor - Manages watchlist and real-time signal monitoring
Using MASSIVE API (formerly Polygon.io) for market data instead of Interactive Brokers

API Documentation: https://massive.com/docs
Using official polygon-api-client library
"""

from polygon import RESTClient
import pandas as pd
import numpy as np
from typing import Dict, List, Optional
from datetime import datetime, timedelta, date
import asyncio
import json
import os
from database import get_watchlist_collection, get_signal_batches_collection, get_watchlist_changes_collection


class MassiveMonitor:
    def __init__(self, api_key: Optional[str] = None, use_db: bool = True):
        """
        Initialize MASSIVE API Monitor using official Polygon REST client
        
        Args:
            api_key: MASSIVE API key (can also be set via environment variable MASSIVE_API_KEY)
            use_db: Whether to use MongoDB for watchlist storage (default: True)
        """
        self.api_key = api_key or os.getenv('MASSIVE_API_KEY')
        self.client = None
        self.watchlist: Dict[str, dict] = {}
        self.algorithm_config = {
            "enabled": True,
            "rsi_overbought": 70,
            "rsi_oversold": 30,
            "macd_enabled": True,
            "rsi_enabled": True
        }
        self._connected = False
        self._use_db = use_db

    async def _load_watchlist(self):
        """Load persisted watchlist from MongoDB"""
        try:
            if not self._use_db:
                return
                
            watchlist_collection = get_watchlist_collection()
            cursor = watchlist_collection.find({})
            
            async for doc in cursor:
                symbol = doc.get('symbol')
                if symbol:
                    # Convert MongoDB document to watchlist format (include all fields)
                    self.watchlist[symbol] = {
                        'symbol': doc.get('symbol'),
                        'exchange': doc.get('exchange', 'US'),
                        'currency': doc.get('currency', 'USD'),
                        'sec_type': doc.get('sec_type', 'STK'),
                        'market_type': doc.get('market_type', 'stocks'),
                        'price': doc.get('last_price'),
                        'bid': doc.get('bid'),
                        'ask': doc.get('ask'),
                        'volume': doc.get('volume'),
                        'signal': doc.get('signal', 'NEUTRAL'),
                        'rsi': doc.get('rsi'),
                        'macd': doc.get('macd'),
                        'ema200': doc.get('ema200'),
                        'diff': doc.get('diff'),
                        'last_update': doc.get('last_updated', datetime.now()).isoformat() if doc.get('last_updated') else datetime.now().isoformat()
                    }
            
            print(f"✓ Loaded {len(self.watchlist)} symbols from MongoDB")
        except Exception as e:
            print(f"✗ Failed to load watchlist from DB: {e}")

    async def _save_watchlist_symbol(self, symbol: str, data: dict):
        """Save or update a single symbol in MongoDB"""
        try:
            if not self._use_db:
                return
                
            watchlist_collection = get_watchlist_collection()
            
            # Prepare document (save all fields including calculated indicators)
            doc = {
                'symbol': symbol,
                'exchange': data.get('exchange', 'US'),
                'currency': data.get('currency', 'USD'),
                'sec_type': data.get('sec_type', 'STK'),
                'market_type': data.get('market_type', 'stocks'),
                'last_price': data.get('price'),
                'bid': data.get('bid'),
                'ask': data.get('ask'),
                'volume': data.get('volume'),
                'signal': data.get('signal'),
                'rsi': data.get('rsi'),
                'macd': data.get('macd'),
                'ema200': data.get('ema200'),
                'diff': data.get('diff'),
                'last_updated': datetime.now()
            }
            
            # Upsert (update or insert)
            await watchlist_collection.update_one(
                {'symbol': symbol},
                {'$set': doc},
                upsert=True
            )
        except Exception as e:
            print(f"✗ Failed to save {symbol} to DB: {e}")

    async def _remove_watchlist_symbol(self, symbol: str):
        """Remove a symbol from MongoDB"""
        try:
            if not self._use_db:
                return
                
            watchlist_collection = get_watchlist_collection()
            await watchlist_collection.delete_one({'symbol': symbol})
        except Exception as e:
            print(f"✗ Failed to remove {symbol} from DB: {e}")

    async def _log_watchlist_change(self, symbol: str, action: str, data: dict):
        """Log watchlist changes to MongoDB"""
        try:
            if not self._use_db:
                return
                
            changes_collection = get_watchlist_changes_collection()
            
            change_doc = {
                'symbol': symbol,
                'action': action,
                'timestamp': datetime.now(),
                'previous_data': data if action == 'REMOVE' else None
            }
            
            await changes_collection.insert_one(change_doc)
        except Exception as e:
            print(f"✗ Failed to log watchlist change: {e}")

    async def _save_signal_batch(self, batch_range: str, total_symbols: int, 
                                   crossovers: int, signals_data: list, 
                                   processing_time_ms: float = None):
        """Save signal batch for backtesting"""
        try:
            if not self._use_db:
                return
                
            batches_collection = get_signal_batches_collection()
            
            batch_id = f"batch_{batch_range}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
            batch_doc = {
                'batch_id': batch_id,
                'batch_range': batch_range,
                'total_symbols': total_symbols,
                'crossovers_detected': crossovers,
                'timestamp': datetime.now(),
                'processing_time_ms': processing_time_ms,
                'signals': signals_data,
                'summary': {
                    'crossover_rate': round((crossovers / total_symbols * 100), 2) if total_symbols > 0 else 0,
                    'symbols_processed': total_symbols
                }
            }
            
            await batches_collection.insert_one(batch_doc)
            print(f"✓ Saved batch {batch_range} to DB for backtesting")
        except Exception as e:
            print(f"✗ Failed to save signal batch: {e}")

    async def connect(self) -> bool:
        """Initialize connection to MASSIVE API using official client"""
        try:
            if not self.api_key:
                print("✗ MASSIVE API key not provided")
                return False

            # Initialize the official Polygon REST client
            self.client = RESTClient(self.api_key)
            
            # Test connection by fetching a known ticker's details
            try:
                test_ticker = self.client.get_ticker_details("AAPL")
                if test_ticker and hasattr(test_ticker, 'ticker'):
                    self._connected = True
                    print(f"✓ Connected to MASSIVE API (Polygon.io)")
                    await self._load_watchlist()
                    return True
                else:
                    print(f"✗ MASSIVE API test failed")
                    return False
            except Exception as e:
                print(f"✗ MASSIVE API authentication failed: {e}")
                print(f"   Please check your API key at https://massive.com/dashboard/api-keys")
                return False

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
        """Check if connected to MASSIVE API"""
        return self._connected and self.client is not None

    async def _fetch_quote(self, symbol: str, market_type: str = "stocks") -> Optional[dict]:
        """
        Fetch real-time snapshot data for a symbol (stocks or forex)
        
        Uses: GET /v2/snapshot/locale/us/markets/stocks/tickers/{ticker}
              GET /v2/snapshot/locale/global/markets/forex/tickers/{ticker}
        Docs: https://massive.com/docs/stocks/get_v2_snapshot_locale_us_markets_stocks_tickers__stocksticker
              https://massive.com/docs/forex/get_v2_snapshot_locale_global_markets_forex_tickers__ticker
        
        Args:
            symbol: Stock symbol (e.g., 'AAPL') or Forex pair (e.g., 'C:EURUSD')
            market_type: 'stocks' or 'forex'
            
        Returns:
            Dictionary with quote data or None if error
        """
        if not self.is_connected():
            return None

        try:
            # Determine market type from symbol if not specified
            if symbol.startswith('C:'):
                market_type = 'forex'
            
            # Use snapshot endpoint (available on paid tiers)
            from polygon.exceptions import BadResponse
            try:
                snapshot = self.client.get_snapshot_ticker(market_type, symbol)
            except BadResponse as e:
                # Symbol not found or not available
                return None
            
            if snapshot:
                # Extract data from snapshot
                price = 0
                bid = 0
                ask = 0
                volume = 0
                
                # Get last trade price
                if hasattr(snapshot, 'lastTrade') and snapshot.lastTrade:
                    price = snapshot.lastTrade.get('p', 0) if isinstance(snapshot.lastTrade, dict) else getattr(snapshot.lastTrade, 'p', 0)
                
                # Get last quote (bid/ask)
                if hasattr(snapshot, 'lastQuote') and snapshot.lastQuote:
                    if isinstance(snapshot.lastQuote, dict):
                        bid = snapshot.lastQuote.get('P', 0)  # Bid price (uppercase P)
                        ask = snapshot.lastQuote.get('p', 0)  # Ask price (lowercase p)
                    else:
                        bid = getattr(snapshot.lastQuote, 'P', 0)
                        ask = getattr(snapshot.lastQuote, 'p', 0)
                
                # Get day volume
                if hasattr(snapshot, 'day') and snapshot.day:
                    volume = snapshot.day.get('v', 0) if isinstance(snapshot.day, dict) else getattr(snapshot.day, 'v', 0)
                
                # Fallback to previous day close if no last trade (common for forex outside market hours)
                if price == 0:
                    if hasattr(snapshot, 'prevDay') and snapshot.prevDay:
                        price = snapshot.prevDay.get('c', 0) if isinstance(snapshot.prevDay, dict) else getattr(snapshot.prevDay, 'c', 0)
                    
                    # If still 0, try using the previous close aggregate endpoint
                    if price == 0:
                        try:
                            prev_close = self.client.get_previous_close_agg(symbol)
                            if prev_close and len(prev_close) > 0:
                                agg = prev_close[0] if isinstance(prev_close, list) else prev_close
                                price = agg.close if hasattr(agg, 'close') else agg.get('c', 0) if isinstance(agg, dict) else 0
                                if bid == 0:
                                    bid = price
                                if ask == 0:
                                    ask = price
                                if volume == 0 and hasattr(agg, 'volume'):
                                    volume = agg.volume if hasattr(agg, 'volume') else agg.get('v', 0) if isinstance(agg, dict) else 0
                        except Exception as e:
                            print(f"⚠️  Could not fetch previous close for {symbol}: {e}")
                
                return {
                    'symbol': symbol,
                    'price': price,
                    'bid': bid,
                    'ask': ask,
                    'volume': volume,
                    'timestamp': datetime.now()
                }
            else:
                print(f"✗ No snapshot data returned for {symbol}")
                return None

        except Exception as e:
            print(f"✗ Error fetching quote for {symbol}: {e}")
            import traceback
            traceback.print_exc()
            return None

    async def _fetch_historical_data(self, symbol: str, days: int = 30) -> Optional[pd.DataFrame]:
        """
        Fetch historical 5-minute candle data using official client (stocks or forex)
        
        Uses: GET /v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from}/{to}
        Docs: https://massive.com/docs/stocks/get_v2_aggs_ticker__stocksticker__range__multiplier___timespan___from___to
              https://massive.com/docs/forex/get_v2_aggs_ticker__forexticker__range__multiplier___timespan___from___to
        
        Args:
            symbol: Stock symbol or Forex pair (e.g., 'AAPL' or 'C:EURUSD')
            days: Number of days of historical data (default 30 days for 5-min candles)
            
        Returns:
            DataFrame with historical 5-minute candle data or None if error
        """
        if not self.is_connected():
            return None

        try:
            # Calculate date range - get enough 5-min candles for EMA200
            # Need at least 1000 candles (200 EMA + buffer)
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)
            
            # Use official client's list_aggs method for 5-minute candles
            aggs = []
            for agg in self.client.list_aggs(
                ticker=symbol,
                multiplier=5,
                timespan="minute",
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
            else:
                print(f"✗ No historical data for {symbol}")
                return None

        except Exception as e:
            print(f"✗ Error fetching historical data for {symbol}: {e}")
            return None

    def calculate_ema(self, prices: pd.Series, period: int) -> pd.Series:
        """Calculate Exponential Moving Average with SMA initialization (industry standard)"""
        if len(prices) < period:
            # Not enough data, return simple EMA
            return prices.ewm(span=period, adjust=False).mean()
        
        # Calculate initial SMA for the first 'period' values
        sma_initial = prices.iloc[:period].mean()
        
        # Create EMA series starting with SMA
        ema_values = [sma_initial]
        multiplier = 2 / (period + 1)
        
        # Calculate EMA for remaining values
        for i in range(period, len(prices)):
            ema = (prices.iloc[i] - ema_values[-1]) * multiplier + ema_values[-1]
            ema_values.append(ema)
        
        # Create series with NaN for first (period-1) values, then EMA values
        result = pd.Series([float('nan')] * (period - 1) + ema_values, index=prices.index)
        return result

    def calculate_rsi(self, prices: pd.Series, period: int = 14) -> pd.Series:
        """Calculate Relative Strength Index"""
        delta = prices.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        return rsi

    def calculate_macd(self, prices: pd.Series) -> dict:
        """Calculate MACD indicator"""
        exp1 = prices.ewm(span=12, adjust=False).mean()
        exp2 = prices.ewm(span=26, adjust=False).mean()
        macd = exp1 - exp2
        signal = macd.ewm(span=9, adjust=False).mean()
        histogram = macd - signal
        
        return {
            'macd': macd.iloc[-1] if len(macd) > 0 else 0,
            'signal': signal.iloc[-1] if len(signal) > 0 else 0,
            'histogram': histogram.iloc[-1] if len(histogram) > 0 else 0
        }

    async def calculate_signals(self, symbol: str, historical_data: pd.DataFrame, current_price: float) -> dict:
        """Calculate trading signals based on technical indicators with EMA200 crossover detection"""
        try:
            if historical_data is None or len(historical_data) < 200:
                return {
                    'signal': 'NEUTRAL',
                    'rsi': None,
                    'macd': None,
                    'ema200': None,
                    'diff': None
                }

            # Calculate indicators
            closes = historical_data['close']
            
            # EMA 200
            ema200_series = self.calculate_ema(closes, 200)
            # Get last non-NaN value
            ema200 = ema200_series.dropna().iloc[-1] if len(ema200_series.dropna()) > 0 else None
            ema200_prev = ema200_series.dropna().iloc[-2] if len(ema200_series.dropna()) > 1 else ema200
            
            if ema200 is None:
                return {
                    'signal': 'NEUTRAL',
                    'rsi': None,
                    'macd': None,
                    'ema200': None,
                    'diff': None
                }
            
            diff = current_price - ema200
            prev_price = closes.iloc[-2] if len(closes) > 1 else current_price
            
            # RSI
            rsi = None
            if self.algorithm_config['rsi_enabled']:
                rsi =  1 #self.calculate_rsi(closes).iloc[-1]
            
            # MACD
            macd_data = None
            if self.algorithm_config['macd_enabled']:
                macd_data = 1 #self.calculate_macd(closes)
            
            # Determine signal with EMA200 crossover detection
            signal = 'NEUTRAL'
            if self.algorithm_config['enabled']:
                # Primary signal: EMA200 crossover
                # Bullish: Price crossed ABOVE EMA200
                if prev_price <= ema200_prev and current_price > ema200:
                    signal = 'BULLISH'
                # Bearish: Price crossed BELOW EMA200
                elif prev_price >= ema200_prev and current_price < ema200:
                    signal = 'BEARISH'
                # No crossover - maintain current position
                elif current_price > ema200:
                    signal = 'BULLISH'
                else:
                    signal = 'BEARISH'
            
            return {
                'signal': signal,
                'rsi': rsi,
                'macd': macd_data,
                'ema200': round(float(ema200), 4),
                'diff': round(float(diff), 4)
            }

        except Exception as e:
            print(f"✗ Error calculating signals for {symbol}: {e}")
            return {
                'signal': 'ERROR',
                'rsi': None,
                'macd': None,
                'ema200': None,
                'diff': None
            }

    async def search_symbols(self, query: str) -> List[dict]:
        """
        Search for symbols/tickers using official client (stocks and forex)
        
        Uses: GET /v3/reference/tickers
        Docs: https://massive.com/docs/stocks/get_v3_reference_tickers
              https://massive.com/docs/forex/get_v3_reference_tickers
        
        Args:
            query: Search query (symbol, company name, or currency pair like EUR/USD)
            
        Returns:
            List of matching symbols
        """
        if not self.is_connected():
            return []

        try:
            results = []
            
            # Search stocks
            try:
                for ticker in self.client.list_tickers(
                    search=query,
                    market="stocks",
                    active=True,
                    limit=15,
                    sort="ticker",
                    order="asc"
                ):
                    results.append({
                        'symbol': ticker.ticker,
                        'name': ticker.name if hasattr(ticker, 'name') else ticker.ticker,
                        'exchange': ticker.primary_exchange if hasattr(ticker, 'primary_exchange') else 'US',
                        'currency': ticker.currency_name if hasattr(ticker, 'currency_name') else 'USD',
                        'sec_type': 'Stock',
                        'market_type': 'stocks'
                    })
            except:
                pass
            
            # Search forex (currency pairs)
            try:
                for ticker in self.client.list_tickers(
                    search=query,
                    market="fx",
                    active=True,
                    limit=15,
                    sort="ticker",
                    order="asc"
                ):
                    results.append({
                        'symbol': ticker.ticker,
                        'name': ticker.name if hasattr(ticker, 'name') else ticker.ticker,
                        'exchange': 'FX',
                        'currency': ticker.currency_name if hasattr(ticker, 'currency_name') else 'USD',
                        'sec_type': 'Forex',
                        'market_type': 'fx'
                    })
            except:
                pass
            
            return results[:20]  # Limit to 20 total results

        except Exception as e:
            print(f"✗ Error searching symbols: {e}")
            return []

    async def add_to_watchlist(self, symbol: str, exchange: str = "US", currency: str = "USD", sec_type: str = "STK", market_type: str = "stocks"):
        """Add symbol to watchlist (stocks or forex)"""
        try:
            # Determine market type from symbol
            if symbol.startswith('C:'):
                market_type = 'forex'
                sec_type = 'FX'
            
            # Fetch initial data
            quote = await self._fetch_quote(symbol, market_type)
            if not quote:
                raise Exception(f"Could not fetch data for {symbol}")

            historical_data = await self._fetch_historical_data(symbol)
            signals = await self.calculate_signals(symbol, historical_data, quote['price'])

            self.watchlist[symbol] = {
                'symbol': symbol,
                'exchange': exchange,
                'currency': currency,
                'sec_type': sec_type,
                'market_type': market_type,
                'price': quote['price'],
                'bid': quote['bid'],
                'ask': quote['ask'],
                'volume': quote['volume'],
                'signal': signals['signal'],
                'rsi': signals['rsi'],
                'macd': signals['macd'],
                'ema200': signals['ema200'],
                'diff': signals['diff'],
                'last_update': datetime.now().isoformat()
            }

            # Save to MongoDB
            await self._save_watchlist_symbol(symbol, self.watchlist[symbol])
            
            # Log the change
            await self._log_watchlist_change(symbol, 'ADD', self.watchlist[symbol])
            
            print(f"✓ Added {symbol} to watchlist")

        except Exception as e:
            print(f"✗ Error adding {symbol}: {e}")
            raise

    async def remove_from_watchlist(self, symbol: str):
        """Remove symbol from watchlist"""
        if symbol in self.watchlist:
            previous_data = self.watchlist[symbol].copy()
            del self.watchlist[symbol]
            
            # Remove from MongoDB
            await self._remove_watchlist_symbol(symbol)
            
            # Log the change
            await self._log_watchlist_change(symbol, 'REMOVE', previous_data)
            
            print(f"✓ Removed {symbol} from watchlist")

    def get_watchlist_data(self) -> dict:
        """Get current watchlist data"""
        return {
            'symbols': list(self.watchlist.values()),
            'count': len(self.watchlist),
            'last_update': datetime.now().isoformat()
        }

    async def update_batch(self, batch_start: int, batch_size: int = 15) -> dict:
        """Update a single batch of symbols
        
        Args:
            batch_start: Starting index for this batch (0-based)
            batch_size: Number of symbols to process concurrently (default 15)
        """
        if not self.is_connected() or not self.watchlist:
            return {'symbols': [], 'changes': [], 'batch_start': batch_start, 'batch_end': batch_start}

        changes = []
        updated_symbols = []
        
        # Convert to list for batch processing
        symbol_list = list(self.watchlist.keys())
        total_symbols = len(symbol_list)
        
        # Get batch slice
        batch_end = min(batch_start + batch_size, total_symbols)
        batch = symbol_list[batch_start:batch_end]
        
        if not batch:
            return {'symbols': [], 'changes': [], 'batch_start': batch_start, 'batch_end': batch_start}
        
        print(f"📊 Processing batch {batch_start+1}-{batch_end}/{total_symbols}...")
        
        # Process batch concurrently
        tasks = [self._update_single_symbol(symbol) for symbol in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Collect results
        processed_count = 0
        failed_symbols = []
        for symbol, result in zip(batch, results):
            if isinstance(result, Exception):
                failed_symbols.append(symbol)
                print(f"❌ FAILED: {symbol} - {str(result)[:100]}")
                continue
                
            if result:
                # Check if result contains error
                if 'error' in result:
                    failed_symbols.append(result['symbol'])
                    print(f"❌ FAILED: {result['symbol']} - {result['error']}")
                    continue
                    
                if 'data' in result:
                    updated_symbols.append(result['data'])
                    if result.get('signal_changed'):
                        changes.append(result['data'])
                    processed_count += 1
        
        # Summary output
        if changes:
            print(f"🎯 Batch {batch_start+1}-{batch_end}: {len(changes)} crossovers detected!")
        if failed_symbols:
            print(f"⚠️  Failed symbols in this batch: {', '.join(failed_symbols)}")
            print(f"   → Consider removing these from watchlist")
        
        # Save signal batch to DB for backtesting
        batch_range = f"{batch_start+1}-{batch_end}"
        signals_data = []
        for change in changes:
            signals_data.append({
                'symbol': change.get('symbol'),
                'signal': change.get('signal'),
                'price': change.get('price'),
                'rsi': change.get('rsi'),
                'macd': change.get('macd'),
                'ema200': change.get('ema200'),
                'diff': change.get('diff'),
                'timestamp': datetime.now().isoformat()
            })
        
        await self._save_signal_batch(
            batch_range=batch_range,
            total_symbols=len(batch),
            crossovers=len(changes),
            signals_data=signals_data,
            processing_time_ms=None
        )

        return {
            'symbols': updated_symbols,
            'changes': changes,
            'timestamp': datetime.now().isoformat(),
            'batch_start': batch_start,
            'batch_end': batch_end,
            'total': total_symbols,
            'processed': processed_count,
            'failed': failed_symbols
        }
    
    async def _update_single_symbol(self, symbol: str) -> Optional[dict]:
        """Update a single symbol and return the result"""
        try:
            # Get market type from watchlist
            market_type = self.watchlist[symbol].get('market_type', 'stocks')
            
            # Fetch latest quote
            quote = await self._fetch_quote(symbol, market_type)
            if not quote:
                # Return None silently - will be handled in batch processing
                return None

            # Fetch historical data
            historical_data = await self._fetch_historical_data(symbol)
            signals = await self.calculate_signals(symbol, historical_data, quote['price'])

            old_signal = self.watchlist[symbol].get('signal')
            new_signal = signals['signal']

            # Update watchlist entry
            self.watchlist[symbol].update({
                'price': quote['price'],
                'bid': quote['bid'],
                'ask': quote['ask'],
                'volume': quote['volume'],
                'signal': new_signal,
                'rsi': signals['rsi'],
                'macd': signals['macd'],
                'ema200': signals['ema200'],
                'diff': signals['diff'],
                'last_update': datetime.now().isoformat()
            })

            # Track signal changes
            signal_changed = old_signal != new_signal and new_signal in ['BULLISH', 'BEARISH']

            return {
                'data': self.watchlist[symbol],
                'signal_changed': signal_changed
            }

        except Exception as e:
            # Return error info instead of raising
            return {'error': str(e), 'symbol': symbol}

    async def add_all_forex_pairs(self, limit: int = 1000):
        """
        Scan and add all available forex currency pairs to the watchlist
        
        Args:
            limit: Maximum number of forex pairs to add (default 1000)
        """
        if not self.is_connected():
            print("✗ Not connected to MASSIVE API")
            return
        
        print(f"🔍 Scanning all forex currency pairs...")
        added_count = 0
        failed_count = 0
        
        try:
            # List all active forex tickers
            for ticker in self.client.list_tickers(
                market="fx",
                active=True,
                limit=limit,
                sort="ticker",
                order="asc"
            ):
                try:
                    symbol = ticker.ticker
                    name = ticker.name if hasattr(ticker, 'name') else symbol
                    
                    # Skip if already in watchlist
                    if symbol in self.watchlist:
                        print(f"⏭️  {symbol} already in watchlist")
                        continue
                    
                    print(f"➕ Adding {symbol} ({name})...")
                    
                    # Add to watchlist
                    await self.add_to_watchlist(
                        symbol=symbol,
                        exchange='FX',
                        currency='USD',
                        sec_type='FX',
                        market_type='forex'
                    )
                    
                    added_count += 1
                    print(f"✅ Added {symbol} - Total: {added_count}")
                    
                except Exception as e:
                    failed_count += 1
                    print(f"✗ Failed to add {symbol}: {e}")
                    continue
            
            print(f"\n{'='*60}")
            print(f"✅ Forex scan complete!")
            print(f"   Added: {added_count} pairs")
            print(f"   Failed: {failed_count} pairs")
            print(f"   Total in watchlist: {len(self.watchlist)}")
            print(f"{'='*60}")
            
        except Exception as e:
            print(f"✗ Error scanning forex pairs: {e}")
            import traceback
            traceback.print_exc()

    def configure_algorithm(self, config: dict):
        """Update algorithm configuration"""
        self.algorithm_config.update(config)
        print(f"✓ Algorithm configured: {self.algorithm_config}")

    def get_algorithm_config(self) -> dict:
        """Get current algorithm configuration"""
        return self.algorithm_config
