"""
Test script for new indicator logic
"""

import asyncio
import os
import sys
from dotenv import load_dotenv
from database import Database
from massive_monitor_v2 import MassiveMonitorV2

# Load environment variables from .env file
load_dotenv()


async def test_new_logic():
    """Test the new indicator logic"""
    
    print("="*80)
    print("TESTING NEW INDICATOR LOGIC")
    print("="*80)
    
    # Connect to database
    print("\n1. Connecting to MongoDB...")
    await Database.connect_db()
    
    # Initialize monitor
    print("\n2. Initializing MASSIVE Monitor V2...")
    monitor = MassiveMonitorV2()
    
    # Connect to API
    print("\n3. Connecting to MASSIVE API...")
    connected = await monitor.connect()
    
    if not connected:
        print("❌ Failed to connect to MASSIVE API")
        print("Please set MASSIVE_API_KEY environment variable")
        return
    
    # Load watchlist from JSON
    print("\n4. Loading watchlist from watchlist.json...")
    await monitor.load_watchlist_from_json("watchlist.json")
    
    # Display loaded symbols
    watchlist_data = monitor.get_watchlist_data()
    print(f"\n✓ Loaded {watchlist_data['count']} symbols:")
    for symbol_data in watchlist_data['symbols']:
        print(f"   - {symbol_data['symbol']}")
    
    # Update all symbols
    print("\n5. Updating all symbols with new indicator logic...")
    print("-"*80)
    await monitor.update_all()
    
    # Display results
    print("\n" + "="*80)
    print("RESULTS")
    print("="*80)
    
    watchlist_data = monitor.get_watchlist_data()
    
    for symbol_data in watchlist_data['symbols']:
        symbol = symbol_data['symbol']
        price = symbol_data.get('last_price', 0)
        buy_signals = symbol_data.get('buy_signals', [])
        sell_signals = symbol_data.get('sell_signals', [])
        
        print(f"\n{symbol} @ ${price:.6f}")
        
        if buy_signals:
            print(f"  🟢 BUY Signals: {', '.join(buy_signals)}")
        
        if sell_signals:
            print(f"  🔴 SELL Signals: {', '.join(sell_signals)}")
        
        if not buy_signals and not sell_signals:
            print(f"  ⚪ No signals")
        
        # Display daily indicators
        daily = symbol_data.get('daily_indicators', {})
        if daily:
            print(f"\n  Daily Indicators:")
            
            if daily.get('bollinger_band'):
                bb = daily['bollinger_band']
                print(f"    • Bollinger Band: Upper={bb['upper_band']:.6f}, Middle={bb['middle_band']:.6f}, Lower={bb['lower_band']:.6f}")
                if bb.get('signal'):
                    print(f"      → {bb['signal']}")
            
            if daily.get('rsi_9'):
                rsi = daily['rsi_9']
                print(f"    • RSI(9): {rsi['rsi_value']:.2f}")
                if rsi.get('signal'):
                    print(f"      → {rsi['signal']}")
            
            if daily.get('sma_9'):
                print(f"    • SMA(9): {daily['sma_9']:.6f}")
            
            if daily.get('sma_20'):
                print(f"    • SMA(20): {daily['sma_20']:.6f}")
            
            if daily.get('sma_50'):
                sma50 = daily['sma_50']
                print(f"    • SMA(50): {sma50['sma_value']:.6f}")
                if sma50.get('signal'):
                    print(f"      → {sma50['signal']}")
            
            if daily.get('sma_200'):
                print(f"    • SMA(200): {daily['sma_200']:.6f}")
            
            if daily.get('ma_crossover'):
                mac = daily['ma_crossover']
                print(f"    • MA Crossover: Fast(9)={mac['fast_ema']:.6f}, Slow(21)={mac['slow_ema']:.6f}")
                if mac.get('signal'):
                    print(f"      → {mac['signal']}")
            
            if daily.get('macd'):
                macd = daily['macd']
                print(f"    • MACD: Line={macd['macd_line']:.6f}, Signal={macd['signal_line']:.6f}, Histogram={macd['histogram']:.6f}")
                if macd.get('signal'):
                    print(f"      → {macd['signal']}")
        
        # Display hourly indicators
        hourly = symbol_data.get('hourly_indicators', {})
        if hourly:
            print(f"\n  Hourly Indicators:")
            
            if hourly.get('ema_100'):
                ema = hourly['ema_100']
                print(f"    • EMA(100): {ema['ema_value']:.6f}")
                if ema.get('signal'):
                    print(f"      → {ema['signal']}")
    
    # Disconnect
    print("\n" + "="*80)
    print("\n6. Disconnecting...")
    await monitor.disconnect()
    await Database.close_db()
    
    print("\n✅ Test complete!")


if __name__ == "__main__":
    # Check for API key
    if not os.getenv('MASSIVE_API_KEY'):
        print("❌ ERROR: MASSIVE_API_KEY environment variable not set")
        print("\nPlease set it using:")
        print("  Windows: set MASSIVE_API_KEY=your_api_key")
        print("  Linux/Mac: export MASSIVE_API_KEY=your_api_key")
        sys.exit(1)
    
    asyncio.run(test_new_logic())
