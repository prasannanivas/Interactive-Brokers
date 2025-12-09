"""
Script to fetch and add ALL available forex currency pairs to watchlist
Run this: python add_all_forex.py
"""

import asyncio
import os
from dotenv import load_dotenv
from massive_monitor import MassiveMonitor

async def main():
    # Load environment variables
    load_dotenv()
    
    # Initialize monitor
    monitor = MassiveMonitor()
    
    print("🔍 Connecting to MASSIVE API...")
    connected = await monitor.connect()
    
    if not connected:
        print("❌ Failed to connect. Check your API key.")
        return
    
    print("✅ Connected!\n")
    print("🔍 Fetching ALL available forex currency pairs...\n")
    
    try:
        # Get all forex tickers from API
        all_forex = []
        
        for ticker in monitor.client.list_tickers(
            market='fx',  # Forex market
            active=True,  # Only active pairs
            limit=1000
        ):
            all_forex.append(ticker.ticker)
        
        print(f"✅ Found {len(all_forex)} forex pairs")
        print(f"🔄 Adding all pairs to watchlist...\n")
        
        # Add each pair to watchlist
        added = 0
        failed = 0
        
        for idx, symbol in enumerate(all_forex, 1):
            try:
                success = await monitor.add_to_watchlist(symbol)
                if success:
                    added += 1
                    print(f"✓ {idx}/{len(all_forex)}: Added {symbol}")
                else:
                    failed += 1
                    print(f"✗ {idx}/{len(all_forex)}: Failed {symbol}")
                
                # Small delay to avoid rate limiting
                if idx % 10 == 0:
                    await asyncio.sleep(0.5)
                    
            except Exception as e:
                failed += 1
                print(f"✗ {idx}/{len(all_forex)}: Error {symbol} - {e}")
        
        print("\n" + "=" * 80)
        print(f"📊 Summary:")
        print(f"   Total forex pairs found: {len(all_forex)}")
        print(f"   ✅ Successfully added: {added}")
        print(f"   ❌ Failed: {failed}")
        print("=" * 80)
        
        # Show watchlist summary
        watchlist = monitor.get_watchlist_data()
        forex_count = sum(1 for s in watchlist['symbols'] if s.get('market_type') == 'forex')
        stock_count = sum(1 for s in watchlist['symbols'] if s.get('market_type') == 'stocks')
        
        print(f"\n📊 Current Watchlist:")
        print(f"   Total symbols: {watchlist['count']}")
        print(f"   Forex pairs: {forex_count}")
        print(f"   Stocks: {stock_count}")
        
        # Disconnect
        await monitor.disconnect()
        print("\n✅ Done!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
