"""
Delete incomplete snapshots and re-backfill them
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

async def fix_incomplete():
    mongo_uri = os.getenv('MONGODB_URL')
    client = AsyncIOMotorClient(mongo_uri)
    db_name = os.getenv('MONGODB_DB_NAME', 'trading_monitor')
    db = client[db_name]
    collection = db.daily_signal_snapshots
    
    # Dates with incomplete data
    incomplete_dates = [
        datetime(2025, 12, 26),
        datetime(2026, 3, 3),
        datetime(2026, 3, 17)
    ]
    
    print("🗑️  Deleting incomplete snapshots...\n")
    
    for date in incomplete_dates:
        result = await collection.delete_one({'snapshot_date': date})
        if result.deleted_count > 0:
            print(f"✓ Deleted: {date.strftime('%Y-%m-%d')}")
        else:
            print(f"⚠️  Not found: {date.strftime('%Y-%m-%d')}")
    
    print("\n✅ Deleted incomplete snapshots!")
    print("\n💡 Now run backfill for these dates:")
    print("   python backfill_signals.py --start-date 2025-12-26 --end-date 2025-12-26")
    print("   python backfill_signals.py --start-date 2026-03-03 --end-date 2026-03-03")
    print("   python backfill_signals.py --start-date 2026-03-17 --end-date 2026-03-17")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(fix_incomplete())
