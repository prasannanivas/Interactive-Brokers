"""
Quick check of snapshot structure and volume data
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

async def check_structure():
    mongo_uri = os.getenv('MONGODB_URL')
    client = AsyncIOMotorClient(mongo_uri)
    db_name = os.getenv('MONGODB_DB_NAME', 'trading_monitor')
    db = client[db_name]
    collection = db.daily_signal_snapshots
    
    print("Checking latest snapshot structure...")
    
    # Get the latest snapshot
    snapshot = await collection.find_one({}, sort=[('snapshot_date', -1)])
    
    if not snapshot:
        print("❌ No snapshots found!")
        return
    
    print(f"\n✓ Latest snapshot: {snapshot['snapshot_date']}")
    print(f"  Total symbols: {snapshot.get('total_symbols', 0)}")
    
    signals = snapshot.get('signals', [])
    print(f"  Signals count: {len(signals)}")
    
    if signals:
        # Check first few signals
        print(f"\n  Sample signals:")
        for i, signal in enumerate(signals[:3], 1):
            symbol = signal.get('symbol', 'N/A')
            volume = signal.get('volume', None)
            position = signal.get('position', 'N/A')
            print(f"    {i}. {symbol}: volume={volume}, position={position}")
        
        # Count how many have zero/null volume
        zero_vol = sum(1 for s in signals if s.get('volume', 0) == 0)
        null_vol = sum(1 for s in signals if s.get('volume') is None)
        has_vol = sum(1 for s in signals if s.get('volume', 0) > 0)
        
        print(f"\n  Volume statistics:")
        print(f"    Has volume (>0): {has_vol}")
        print(f"    Zero volume: {zero_vol}")
        print(f"    Null volume: {null_vol}")
        
        if zero_vol > 0 or null_vol > 0:
            print(f"\n  ⚠️  Found {zero_vol + null_vol} signals with missing/zero volume!")
            print(f"  This is normal - forex volume can be missing from data sources.")
        else:
            print(f"\n  ✅ All signals have volume data!")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(check_structure())
