"""
Check for snapshots with missing symbols
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

async def check_incomplete():
    mongo_uri = os.getenv('MONGODB_URL')
    client = AsyncIOMotorClient(mongo_uri)
    db_name = os.getenv('MONGODB_DB_NAME', 'trading_monitor')
    db = client[db_name]
    collection = db.daily_signal_snapshots
    
    print("🔍 Checking for incomplete snapshots...\n")
    
    # Get all snapshots
    snapshots = await collection.find({}).sort('snapshot_date', 1).to_list(length=None)
    
    print(f"📊 Total snapshots: {len(snapshots)}\n")
    
    incomplete_dates = []
    
    for snap in snapshots:
        date = snap['snapshot_date']
        signals = snap.get('signals', [])
        symbol_count = len(signals)
        
        if symbol_count < 58:
            incomplete_dates.append((date, symbol_count))
            print(f"❌ {date.strftime('%Y-%m-%d %A')}: Only {symbol_count}/58 symbols")
    
    if not incomplete_dates:
        print("✅ All snapshots have 58 symbols!")
    else:
        print(f"\n⚠️  Found {len(incomplete_dates)} incomplete snapshots")
        print(f"\n💡 To fix, delete these and re-run backfill:")
        for date, count in incomplete_dates:
            print(f"   {date.strftime('%Y-%m-%d')}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(check_incomplete())
