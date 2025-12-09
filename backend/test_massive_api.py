"""
Test script to verify MASSIVE API integration
Run this to test your API key and endpoints before starting the full application
"""

import asyncio
import os
from dotenv import load_dotenv
from massive_monitor import MassiveMonitor

async def test_massive_api():
    """Test MASSIVE API connection and basic functionality"""
    
    # Load environment variables
    load_dotenv()
    api_key = os.getenv('MASSIVE_API_KEY')
    
    if not api_key:
        print("❌ ERROR: MASSIVE_API_KEY not found in .env file")
        print("\nPlease:")
        print("1. Copy .env.example to .env")
        print("2. Add your MASSIVE API key to .env")
        print("3. Get your API key from https://massive.com/dashboard/api-keys")
        return
    
    print(f"✓ API Key found: {api_key[:10]}...")
    print("\n" + "="*60)
    print("Testing MASSIVE API Integration")
    print("="*60 + "\n")
    
    # Initialize monitor
    monitor = MassiveMonitor(api_key=api_key)
    
    # Test 1: Connection
    print("Test 1: Connecting to MASSIVE API...")
    connected = await monitor.connect()
    
    if not connected:
        print("❌ Connection failed. Check your API key and internet connection.")
        return
    
    print("✅ Connection successful!\n")
    
    # Test 2: Search symbols
    print("Test 2: Searching for 'AAPL'...")
    results = await monitor.search_symbols("AAPL")
    
    if results:
        print(f"✅ Found {len(results)} results:")
        for r in results[:3]:
            print(f"   • {r['symbol']}: {r['name']}")
    else:
        print("❌ Search returned no results")
    
    print()
    
    # Test 3: Fetch real-time quote
    print("Test 3: Fetching real-time quote for AAPL...")
    quote = await monitor._fetch_quote("AAPL")
    
    if quote:
        print(f"✅ Quote received:")
        print(f"   Price: ${quote['price']:.2f}")
        print(f"   Bid: ${quote['bid']:.2f}")
        print(f"   Ask: ${quote['ask']:.2f}")
        print(f"   Volume: {quote['volume']:,}")
    else:
        print("❌ Failed to fetch quote")
    
    print()
    
    # Test 4: Fetch historical data
    print("Test 4: Fetching historical data (last 30 days)...")
    historical = await monitor._fetch_historical_data("AAPL", days=30)
    
    if historical is not None and not historical.empty:
        print(f"✅ Historical data received:")
        print(f"   Rows: {len(historical)}")
        print(f"   Columns: {list(historical.columns)}")
        print(f"   Date range: {historical.index[0]} to {historical.index[-1]}")
        print(f"\n   Last 5 days:")
        print(historical[['close', 'volume']].tail())
    else:
        print("❌ Failed to fetch historical data")
    
    print()
    
    # Test 5: Add to watchlist and calculate signals
    print("Test 5: Adding AAPL to watchlist with signal calculation...")
    try:
        await monitor.add_to_watchlist("AAPL", exchange="NASDAQ", currency="USD", sec_type="CS")
        watchlist = monitor.get_watchlist_data()
        
        if watchlist['count'] > 0:
            aapl_data = watchlist['symbols'][0]
            print(f"✅ Added to watchlist:")
            print(f"   Symbol: {aapl_data['symbol']}")
            print(f"   Price: ${aapl_data['price']:.2f}")
            print(f"   Signal: {aapl_data['signal']}")
            print(f"   RSI: {aapl_data['rsi']}")
            print(f"   EMA200: ${aapl_data['ema200']:.2f}")
            print(f"   Diff from EMA200: ${aapl_data['diff']:.2f}")
        else:
            print("❌ Failed to add to watchlist")
    
    except Exception as e:
        print(f"❌ Error: {e}")
    
    print()
    
    # Cleanup
    await monitor.disconnect()
    
    print("\n" + "="*60)
    print("✅ All tests completed!")
    print("="*60)
    print("\nYour MASSIVE API integration is working correctly.")
    print("You can now run: python app.py")

if __name__ == "__main__":
    asyncio.run(test_massive_api())
