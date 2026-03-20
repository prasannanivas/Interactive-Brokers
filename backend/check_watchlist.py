"""
Check Watchlist Contents
"""
import asyncio
from database import Database

async def check_watchlist():
    await Database.connect_db()
    db = Database.get_db()
    
    print("\n" + "="*70)
    print("WATCHLIST SYMBOLS")
    print("="*70)
    
    count = await db.watchlist.count_documents({})
    print(f"Total symbols: {count}\n")
    
    async for doc in db.watchlist.find({}).sort("symbol", 1):
        symbol = doc.get('symbol')
        market_type = doc.get('market_type', 'Unknown')
        buy_signals = doc.get('buy_signals', [])
        sell_signals = doc.get('sell_signals', [])
        
        signal_str = f"Buy:{len(buy_signals)} Sell:{len(sell_signals)}"
        print(f"  • {symbol:15} [{market_type:10}] {signal_str}")
    
    print("="*70)
    
    # Check what's in daily_signal_snapshots
    print("\nDAILY SIGNAL SNAPSHOTS")
    print("="*70)
    
    snapshot_count = await db.daily_signal_snapshots.count_documents({})
    print(f"Total snapshots: {snapshot_count}")
    
    if snapshot_count > 0:
        latest = await db.daily_signal_snapshots.find_one({}, sort=[('snapshot_date', -1)])
        if latest:
            print(f"Latest snapshot: {latest.get('snapshot_date')}")
            print(f"Total symbols in snapshot: {latest.get('total_symbols')}")
            print(f"  Bullish: {latest.get('bullish_count')}")
            print(f"  Bearish: {latest.get('bearish_count')}")
            print(f"  Neutral: {latest.get('neutral_count')}")
    
    print("="*70)
    
    # Check indicator_states
    print("\nINDICATOR STATES")
    print("="*70)
    
    indicator_count = await db.indicator_states.count_documents({})
    print(f"Total indicator change records: {indicator_count}")
    
    if indicator_count > 0:
        # Get unique symbols
        symbols = await db.indicator_states.distinct('symbol')
        print(f"Symbols tracked: {len(symbols)}")
        print(f"Symbols: {', '.join(sorted(symbols)[:10])}")
        
        # Sample record
        sample = await db.indicator_states.find_one({}, sort=[('timestamp', -1)])
        if sample:
            print(f"\nLatest change:")
            print(f"  Symbol: {sample.get('symbol')}")
            print(f"  Indicator: {sample.get('indicator')}")
            print(f"  From: {sample.get('from_state')} → To: {sample.get('to_state')}")
            print(f"  Time: {sample.get('timestamp')}")
    
    print("="*70)
    
    Database.client.close()

if __name__ == "__main__":
    asyncio.run(check_watchlist())
