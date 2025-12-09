"""
Quick script to scan and add all forex pairs to watchlist
Run this: python scan_forex.py
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
    
    print("Connecting to MASSIVE API...")
    connected = await monitor.connect()
    
    if not connected:
        print("❌ Failed to connect. Check your API key.")
        return
    
    print("✅ Connected!\n")
    
    # Scan and add all forex pairs
    await monitor.add_all_forex_pairs(limit=1000)
    
    # Show watchlist summary
    watchlist = monitor.get_watchlist_data()
    print(f"\n📊 Watchlist Summary:")
    print(f"   Total symbols: {watchlist['count']}")
    
    # Count by type
    forex_count = sum(1 for s in watchlist['symbols'] if s.get('market_type') == 'forex')
    stock_count = sum(1 for s in watchlist['symbols'] if s.get('market_type') == 'stocks')
    
    print(f"   Forex pairs: {forex_count}")
    print(f"   Stocks: {stock_count}")
    
    # Disconnect
    await monitor.disconnect()
    print("\n✅ Done!")

if __name__ == "__main__":
    asyncio.run(main())
