"""
Interactive Brokers - Chart Data Fetcher with MACD and RSI
Connects to IB Gateway and retrieves historical data with technical indicators
"""

from ib_insync import IB, Stock, util
import pandas as pd
import numpy as np
from datetime import datetime, timedelta


class IBDataFetcher:
    def __init__(self, host='127.0.0.1', port=4002, client_id=1):
        """
        Initialize IB connection

        Args:
            host: localhost IP (default: 127.0.0.1)
            port: 4002 for TWS paper trading (default), 7497 for Gateway paper, 7496 for live
            client_id: unique ID for this connection
        """
        self.ib = IB()
        self.host = host
        self.port = port
        self.client_id = client_id

    def connect(self):
        """Connect to IB Gateway/TWS"""
        try:
            self.ib.connect(self.host, self.port, clientId=self.client_id)
            print(f"✓ Connected to IB Gateway on {self.host}:{self.port}")
            return True
        except Exception as e:
            print(f"✗ Connection failed: {e}")
            print("\nMake sure:")
            print("  1. IB Gateway/TWS is running and logged in")
            print(
                "  2. Scroll down in API Settings and enable 'Enable ActiveX and Socket Clients'")
            print(
                f"  3. Port matches: {self.port} (shown as 'Socket port' in settings)")
            print("  4. Click OK/Apply after changing settings")
            return False

    def disconnect(self):
        """Disconnect from IB"""
        self.ib.disconnect()
        print("✓ Disconnected from IB Gateway")

    def fetch_historical_data(self, symbol, exchange='SMART', currency='USD',
                              duration='30 D', bar_size='1 day', what_to_show='TRADES'):
        """
        Fetch historical data for a symbol

        Args:
            symbol: Stock ticker (e.g., 'AAPL', 'TSLA')
            exchange: Exchange (default: 'SMART' for best price)
            currency: Currency (default: 'USD')
            duration: How far back (e.g., '1 D', '1 W', '1 M', '1 Y')
            bar_size: Bar size (e.g., '1 min', '5 mins', '1 hour', '1 day')
            what_to_show: Data type ('TRADES', 'MIDPOINT', 'BID', 'ASK')

        Returns:
            pandas DataFrame with OHLCV data
        """
        try:
            # Create contract
            contract = Stock(symbol, exchange, currency)

            # Qualify the contract
            self.ib.qualifyContracts(contract)
            print(f"\n📊 Fetching data for {symbol}...")

            # Request historical data
            bars = self.ib.reqHistoricalData(
                contract,
                endDateTime='',
                durationStr=duration,
                barSizeSetting=bar_size,
                whatToShow=what_to_show,
                useRTH=True,  # Regular Trading Hours only
                formatDate=1
            )

            # Convert to DataFrame
            df = util.df(bars)

            if df.empty:
                print(f"✗ No data received for {symbol}")
                return None

            print(f"✓ Retrieved {len(df)} bars for {symbol}")
            return df

        except Exception as e:
            print(f"✗ Error fetching data: {e}")
            return None

    def calculate_rsi(self, df, period=14):
        """
        Calculate RSI (Relative Strength Index)

        Args:
            df: DataFrame with 'close' column
            period: RSI period (default: 14)

        Returns:
            DataFrame with RSI column added
        """
        delta = df['close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()

        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))

        df['RSI'] = rsi
        return df

    def calculate_macd(self, df, fast=12, slow=26, signal=9):
        """
        Calculate MACD (Moving Average Convergence Divergence)

        Args:
            df: DataFrame with 'close' column
            fast: Fast EMA period (default: 12)
            slow: Slow EMA period (default: 26)
            signal: Signal line period (default: 9)

        Returns:
            DataFrame with MACD, Signal, and Histogram columns
        """
        # Calculate EMAs
        ema_fast = df['close'].ewm(span=fast, adjust=False).mean()
        ema_slow = df['close'].ewm(span=slow, adjust=False).mean()

        # Calculate MACD line
        macd_line = ema_fast - ema_slow

        # Calculate signal line
        signal_line = macd_line.ewm(span=signal, adjust=False).mean()

        # Calculate histogram
        histogram = macd_line - signal_line

        df['MACD'] = macd_line
        df['MACD_Signal'] = signal_line
        df['MACD_Histogram'] = histogram

        return df

    def get_data_with_indicators(self, symbol, duration='30 D', bar_size='1 day'):
        """
        Fetch data and calculate all indicators

        Args:
            symbol: Stock ticker
            duration: Historical data duration
            bar_size: Bar size

        Returns:
            DataFrame with OHLCV + MACD + RSI
        """
        df = self.fetch_historical_data(
            symbol, duration=duration, bar_size=bar_size)

        if df is None or df.empty:
            return None

        # Calculate indicators
        df = self.calculate_macd(df)
        df = self.calculate_rsi(df)

        return df

    def display_latest_data(self, df, rows=10):
        """Display latest data with indicators"""
        if df is None or df.empty:
            print("No data to display")
            return

        print(f"\n📈 Latest {rows} data points:\n")

        # Select relevant columns
        display_cols = ['date', 'close', 'MACD',
                        'MACD_Signal', 'MACD_Histogram', 'RSI']
        display_df = df[display_cols].tail(rows)

        # Format for better display
        pd.options.display.float_format = '{:.2f}'.format
        print(display_df.to_string(index=False))

        # Latest values
        latest = df.iloc[-1]
        print(f"\n🎯 Latest Values ({latest['date']}):")
        print(f"   Close: ${latest['close']:.2f}")
        print(f"   MACD: {latest['MACD']:.4f}")
        print(f"   MACD Signal: {latest['MACD_Signal']:.4f}")
        print(f"   MACD Histogram: {latest['MACD_Histogram']:.4f}")
        print(f"   RSI: {latest['RSI']:.2f}")

        # RSI interpretation
        if latest['RSI'] > 70:
            print(f"   📊 RSI Status: OVERBOUGHT (>{70})")
        elif latest['RSI'] < 30:
            print(f"   📊 RSI Status: OVERSOLD (<{30})")
        else:
            print(f"   📊 RSI Status: NEUTRAL")

        # MACD interpretation
        if latest['MACD'] > latest['MACD_Signal']:
            print(f"   📊 MACD Status: BULLISH (MACD > Signal)")
        else:
            print(f"   📊 MACD Status: BEARISH (MACD < Signal)")


def main():
    """Main execution function"""

    # Create fetcher instance (port 4002 is default for TWS paper trading)
    fetcher = IBDataFetcher(host='127.0.0.1', port=4002)

    # Connect to IB Gateway
    if not fetcher.connect():
        return

    try:
        # Example: Fetch data for AAPL
        symbol = 'AAPL'  # Change this to any symbol you want

        print(f"\n{'='*60}")
        print(f"Fetching chart data for {symbol}")
        print(f"{'='*60}")

        # Get data with indicators
        df = fetcher.get_data_with_indicators(
            symbol=symbol,
            duration='60 D',  # Last 60 days
            bar_size='1 day'   # Daily bars
        )

        if df is not None:
            # Display results
            fetcher.display_latest_data(df, rows=10)

            # Optionally save to CSV
            output_file = f'{symbol}_data.csv'
            df.to_csv(output_file, index=False)
            print(f"\n💾 Data saved to: {output_file}")

    finally:
        # Always disconnect
        fetcher.disconnect()


if __name__ == '__main__':
    main()
