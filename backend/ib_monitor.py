"""
IB Monitor - Manages watchlist and real-time signal monitoring
"""

from ib_insync import IB, Stock, Crypto, Forex, util
import pandas as pd
import numpy as np
from typing import Dict, List, Optional
from datetime import datetime
import asyncio
import threading
import json
import os


class IBMonitor:
    def __init__(self, host='127.0.0.1', port=4002, client_id=2):
        self.ib = None
        self.host = host
        self.port = port
        self.client_id = client_id
        self.watchlist: Dict[str, dict] = {}
        self.algorithm_config = {
            "enabled": True,
            "rsi_overbought": 70,
            "rsi_oversold": 30,
            "macd_enabled": True,
            "rsi_enabled": True
        }
        self._connected = False
        self._ib_thread = None
        self._ib_loop = None  # Store the IB thread's event loop
        self._storage_path = os.path.join(os.path.dirname(__file__), 'watchlist.json')

    def _load_watchlist(self):
        """Load persisted watchlist from disk"""
        try:
            if os.path.exists(self._storage_path):
                with open(self._storage_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        self.watchlist = data
                        print(f"✓ Loaded {len(self.watchlist)} symbols from watchlist.json")
        except Exception as e:
            print(f"✗ Failed to load watchlist: {e}")

    def _save_watchlist(self):
        """Persist current watchlist to disk"""
        try:
            with open(self._storage_path, 'w', encoding='utf-8') as f:
                json.dump(self.watchlist, f, indent=2)
        except Exception as e:
            print(f"✗ Failed to save watchlist: {e}")

    async def connect(self) -> bool:
        """Connect to IB Gateway/TWS"""
        connection_result = {'success': False, 'error': None}

        try:
            # Run IB in a separate thread with its own event loop
            def run_ib():
                try:
                    # Create new event loop for this thread
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    self._ib_loop = loop  # Store the loop for later use

                    self.ib = IB()
                    self.ib.connect(self.host, self.port,
                                    clientId=self.client_id, timeout=20)
                    self._connected = self.ib.isConnected()
                    connection_result['success'] = self._connected

                    if self._connected:
                        print(
                            f"✓ IB thread connected on {self.host}:{self.port}")
                        # Prefer delayed market data as a safe fallback to avoid IP conflicts
                        try:
                            # 3 = delayed, 1 = real-time
                            self.ib.reqMarketDataType(3)
                            print("✓ Set market data type to Delayed (3)")
                        except Exception as e:
                            print(f"⚠ Failed to set market data type: {e}")
                        # Keep IB event loop running
                        self.ib.run()
                    else:
                        connection_result['error'] = "Connection returned False"

                except Exception as e:
                    connection_result['error'] = str(e)
                    print(f"✗ Error in IB thread: {e}")

            self._ib_thread = threading.Thread(target=run_ib, daemon=True)
            self._ib_thread.start()

            # Wait for connection with timeout
            for i in range(10):  # Wait up to 5 seconds
                await asyncio.sleep(0.5)
                if connection_result['success'] or connection_result['error']:
                    break

            if connection_result['success']:
                print(f"✓ Connected to IB on {self.host}:{self.port}")
                # Load persisted watchlist (if any) after connecting
                self._load_watchlist()
                return True
            else:
                error_msg = connection_result['error'] or "Connection timeout"
                print(f"✗ Connection failed: {error_msg}")
                print(f"  Check IB Gateway connection status window")
                return False

        except Exception as e:
            print(f"✗ Connection error: {e}")
            self._connected = False
            return False

    async def disconnect(self):
        """Disconnect from IB"""
        if self._connected:
            self.ib.disconnect()
            self._connected = False

    def is_connected(self) -> bool:
        """Check if connected to IB"""
        return self._connected and self.ib.isConnected()

    def search_symbols(self, query: str) -> List[dict]:
        """Search for symbols using IB's contract search"""
        if not self._connected or not self._ib_loop:
            return []

        async def _do_search_async():
            try:
                # Use async version to avoid blocking the event loop
                contracts = await self.ib.reqMatchingSymbolsAsync(query)

                results = []
                forex_results = []
                other_results = []
                
                for contract_desc in contracts:
                    contract = contract_desc.contract
                    
                    # Only include tradeable security types
                    if contract.secType not in ['STK', 'CRYPTO', 'CASH', 'FUT', 'OPT', 'IND', 'FUND', 'CFD']:
                        continue
                    
                    # Set default currency for forex if empty
                    if contract.secType == 'CASH' and not contract.currency:
                        contract.currency = 'USD'
                    
                    # Determine display type
                    type_display = {
                        'STK': 'Stock',
                        'CRYPTO': 'Crypto',
                        'CASH': 'Forex',
                        'FUT': 'Future',
                        'OPT': 'Option',
                        'IND': 'Index',
                        'FUND': 'Fund',
                        'CFD': 'CFD'
                    }.get(contract.secType, contract.secType)

                    # Build result with contract details
                    result = {
                        "symbol": contract.symbol,
                        "name": f"{contract_desc.derivativeSecTypes or contract.localSymbol or contract.symbol} ({type_display})",
                        "exchange": contract.primaryExchange or contract.exchange or "SMART",
                        "currency": contract.currency or "USD",
                        "sec_type": contract.secType,
                        "con_id": contract.conId
                    }

                    # Add descriptive name from contract description if available
                    if hasattr(contract_desc, 'contract') and hasattr(contract, 'longName'):
                        result["name"] = f"{contract.longName} ({type_display})"

                    # Prioritize forex pairs - show them first
                    if contract.secType == 'CASH':
                        forex_results.append(result)
                    else:
                        other_results.append(result)

                # Combine with forex first
                results = forex_results + other_results
                return results[:20]  # Return top 20 matches

            except Exception as e:
                print(f"Error searching symbols: {e}")
                return []

        try:
            # Schedule the coroutine in the IB thread's loop and wait for result
            future = asyncio.run_coroutine_threadsafe(
                _do_search_async(), self._ib_loop)
            return future.result(timeout=10)
        except Exception as e:
            print(f"Error in search execution: {e}")
            return []

    async def add_to_watchlist(self, symbol: str, exchange: str = "SMART", currency: str = "USD", sec_type: str = "STK"):
        """Add symbol to watchlist"""
        if symbol in self.watchlist:
            raise ValueError(f"{symbol} already in watchlist")

        # Initialize watchlist item
        self.watchlist[symbol] = {
            "symbol": symbol,
            # Do not force IDEALPRO; use provided exchange for all sec types
            "exchange": exchange,
            "currency": currency,
            "sec_type": sec_type,
            "price": None,
            "macd": None,
            "macd_signal": None,
            "rsi": None,
            "signal": "NEUTRAL",
            "last_update": None,
            "error": None
        }
        # Persist immediately
        self._save_watchlist()

        # Fetch initial data
        await self.update_symbol(symbol)

    async def add_forex_pair(self, base: str, quote: str):
        """Convenience helper to add a Forex pair on IDEALPRO (e.g., USD/HUF)."""
        # Use sec_type CASH with IDEALPRO and proper base/quote mapping
        return await self.add_to_watchlist(symbol=base, exchange="IDEALPRO", currency=quote, sec_type="CASH")

    async def remove_from_watchlist(self, symbol: str):
        """Remove symbol from watchlist"""
        if symbol not in self.watchlist:
            raise ValueError(f"{symbol} not in watchlist")
        del self.watchlist[symbol]
        # Persist after removal
        self._save_watchlist()

    def get_watchlist_data(self) -> List[dict]:
        """Get current watchlist data"""
        # Lazy-load from disk if empty (backend already running)
        if not self.watchlist:
            try:
                self._load_watchlist()
            except Exception:
                pass
        return list(self.watchlist.values())

    def configure_algorithm(self, config: dict):
        """Update algorithm configuration"""
        self.algorithm_config.update(config)

    def get_algorithm_config(self) -> dict:
        """Get current algorithm configuration"""
        return self.algorithm_config

    def calculate_rsi(self, closes: pd.Series, period: int = 14) -> float:
        """Calculate RSI"""
        delta = closes.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        return rsi.iloc[-1]

    def calculate_ema(self, closes: pd.Series, span: int = 200) -> float:
        """Calculate EMA for given span with SMA initialization (industry standard)"""
        if len(closes) < span:
            # Not enough data, return simple EMA
            ema = closes.ewm(span=span, adjust=False).mean()
            return float(ema.iloc[-1])
        
        # Calculate initial SMA for the first 'span' values
        sma_initial = closes.iloc[:span].mean()
        
        # Calculate EMA for remaining values
        ema = sma_initial
        multiplier = 2 / (span + 1)
        
        for i in range(span, len(closes)):
            ema = (closes.iloc[i] - ema) * multiplier + ema
        
        return float(ema)

    def determine_signal(self, price: float, ema200: float) -> str:
        """Determine signal: price vs EMA200"""
        if not self.algorithm_config.get("enabled", True):
            return "DISABLED"
        if price is None or ema200 is None:
            return "NEUTRAL"
        return "BULLISH" if price > ema200 else "BEARISH"

    async def update_symbol(self, symbol: str):
        """Update data for a single symbol"""
        if symbol not in self.watchlist:
            return

        if not self._connected or not self._ib_loop:
            self.watchlist[symbol]["error"] = "Not connected to IB"
            return

        item = self.watchlist[symbol]
        sec_type = item.get("sec_type", "STK")

        async def _do_update_ib_thread():
            try:
                # Create contract object
                if sec_type == 'CRYPTO':
                    contract = Crypto(symbol, item["exchange"], item["currency"])
                elif sec_type == 'CASH':
                    # For Forex, create pair like "EURUSD" from base (symbol) + quote (currency)
                    pair = symbol + item["currency"]
                    contract = Forex(pair)  # ib_insync sets exchange to IDEALPRO for Forex by default
                else:
                    # Use the exchange from watchlist item; fallback to SMART if empty
                    stock_exchange = item["exchange"] if item.get("exchange") else 'SMART'
                    contract = Stock(symbol, stock_exchange, item["currency"])

                # Qualify contract (async)
                qualified_contracts = await self.ib.qualifyContractsAsync(contract)
                
                # If forex pair failed, try reversed pair (e.g., USDCAD instead of CADUSD)
                if not qualified_contracts and sec_type == 'CASH':
                    print(f"  Trying reversed pair for {symbol}/{item['currency']}")
                    reversed_pair = item["currency"] + symbol
                    contract = Forex(reversed_pair)
                    qualified_contracts = await self.ib.qualifyContractsAsync(contract)
                
                if not qualified_contracts:
                        if sec_type == 'CASH':
                            raise ValueError(
                                f"Forex pair {symbol}/{item['currency']} not available for this account. Try supported pairs (e.g., USD/HUF or EUR/HUF) or verify FX trading permissions.")
                        else:
                            raise ValueError(
                                f"Contract {symbol} ({sec_type}) could not be qualified. Check exchange/currency (e.g., NSE/INR for Indian stocks) and market data permissions.")

                contract = qualified_contracts[0]

                # Do not force IDEALPRO for Forex; IB will set proper venue.

                # Determine what data to request based on security type
                if sec_type == 'CASH':
                    what_to_show = 'MIDPOINT'  # For forex pairs
                elif sec_type == 'STK':
                    # ADJUSTED_LAST helps return bars consistently for equities
                    what_to_show = 'ADJUSTED_LAST'
                else:
                    what_to_show = 'TRADES'  # For crypto, etc.

                # Fetch historical data (async) with robust fallbacks for STK
                async def _fetch_bars(duration, bar_size, show, rth, fmt=1):
                    return await self.ib.reqHistoricalDataAsync(
                        contract,
                        endDateTime='',
                        durationStr=duration,
                        barSizeSetting=bar_size,
                        whatToShow=show,
                        useRTH=rth,
                        formatDate=fmt
                    )

                bars = None
                try:
                    # Primary attempt
                    bars = await _fetch_bars(
                        '30 D' if sec_type == 'STK' else '60 D',
                        '5 mins' if sec_type == 'STK' else '1 day',
                        what_to_show,
                        False if sec_type == 'STK' else True,
                        1
                    )
                except Exception as e:
                    msg = str(e)
                    if 'different IP address' in msg or 'Historical Market Data Service error' in msg:
                        # Error 162: switch to delayed data and retry
                        self.ib.reqMarketDataType(3)
                        print('ℹ Switching to delayed market data and retrying...')
                        bars = await _fetch_bars(
                            '30 D' if sec_type == 'STK' else '60 D',
                            '5 mins' if sec_type == 'STK' else '1 day',
                            what_to_show,
                            False if sec_type == 'STK' else True,
                            1
                        )
                    else:
                        raise

                # Additional fallbacks if bars still empty (common on paper accounts)
                if not bars and sec_type == 'STK':
                    # Try TRADES
                    try:
                        bars = await _fetch_bars('30 D', '5 mins', 'TRADES', False, 1)
                    except Exception:
                        pass
                if not bars and sec_type == 'STK':
                    # Try RTH only
                    try:
                        bars = await _fetch_bars('30 D', '5 mins', what_to_show, True, 1)
                    except Exception:
                        pass
                if not bars and sec_type == 'STK':
                    # Try daily bars
                    try:
                        bars = await _fetch_bars('60 D', '1 day', 'ADJUSTED_LAST', True, 1)
                    except Exception:
                        pass
                if not bars and sec_type == 'STK':
                    # Try formatDate=2
                    try:
                        bars = await _fetch_bars('60 D', '1 day', 'ADJUSTED_LAST', True, 2)
                    except Exception:
                        pass
                
                # Debug logging
                print(f"\n=== Data fetch for {symbol} ({sec_type}) ===")
                print(f"Contract: {contract}")
                print(f"whatToShow: {what_to_show}")
                print(f"Bars returned: {len(bars) if bars else 0}")
                if bars:
                    print(f"First bar: {bars[0]}")
                    print(f"Last bar: {bars[-1]}")
                    print(f"Bar type: {type(bars[0])}")
                else:
                    print("No bars returned!")
                print(f"=====================================\n")
                
                return bars
            except Exception as e:
                # Provide more helpful error message
                error_msg = str(e)
                if "No market data permissions" in error_msg:
                    raise ValueError("No FX market data subscription (IDEALPRO). Enable Forex Level 1 in Client Portal or allow delayed data.")
                if "No security definition has been found" in error_msg or "not available" in error_msg:
                        if sec_type == 'CASH':
                            raise ValueError(f"Forex pair {symbol}/{item['currency']} not available for this account. Try supported pairs (e.g., USD/HUF or EUR/HUF) or verify FX trading permissions.")
                        else:
                            raise ValueError(f"Contract {symbol} ({sec_type}) could not be qualified. Check exchange/currency (e.g., NSE/INR for Indian stocks) and market data permissions.")
                raise e

        try:
            # Execute IB operations on the IB thread
            future = asyncio.run_coroutine_threadsafe(
                _do_update_ib_thread(), self._ib_loop)
            bars = await asyncio.wrap_future(future)

            if not bars:
                item["error"] = "No data available"
                print(f"ERROR: No bars returned for {symbol}")
                return

            # Convert to DataFrame
            df = util.df(bars)
            print(f"DataFrame for {symbol}:\n{df.head()}")
            print(f"Columns: {df.columns.tolist()}")
            closes = df['close']

            # Calculate EMA200
            ema200 = self.calculate_ema(closes, span=200)

            # Store previous signal
            previous_signal = item["signal"]

            # Update watchlist item
            item["price"] = float(closes.iloc[-1])
            item["ema200"] = float(ema200)
            item["signal"] = self.determine_signal(item["price"], ema200)
            item["last_update"] = datetime.now().isoformat()
            item["error"] = None
            
            print(f"✓ Updated {symbol}: Price={item['price']}, EMA200={item['ema200']:.4f}, Signal={item['signal']}")

            # Track if signal changed
            item["signal_changed"] = previous_signal != item["signal"]

            # Persist updated values
            self._save_watchlist()

        except Exception as e:
            error_msg = str(e) if str(e) else repr(e)
            self.watchlist[symbol]["error"] = error_msg
            print(f"ERROR updating {symbol}: {error_msg}")
            import traceback
            traceback.print_exc()

    async def update_all_symbols(self) -> dict:
        """Update all symbols in watchlist"""
        tasks = [self.update_symbol(symbol)
                 for symbol in self.watchlist.keys()]
        await asyncio.gather(*tasks)

        # Find changes
        changes = []
        for symbol, data in self.watchlist.items():
            if data.get("signal_changed", False):
                changes.append({
                    "symbol": symbol,
                    "signal": data["signal"],
                    "price": data["price"],
                    "ema200": data.get("ema200"),
                    "rsi": data.get("rsi"),
                    "macd": data.get("macd")
                })
                # Reset flag
                data["signal_changed"] = False

        return {
            "watchlist": self.get_watchlist_data(),
            "changes": changes,
            "timestamp": datetime.now().isoformat()
        }
