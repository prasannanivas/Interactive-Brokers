"""
Check for missing dates in daily_signal_snapshots collection
"""
import asyncio
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

async def check_missing_dates():
    # Connect to MongoDB
    mongo_uri = os.getenv('MONGODB_URL')
    if not mongo_uri:
        print("❌ MONGODB_URL environment variable not set!")
        return
    client = AsyncIOMotorClient(mongo_uri)
    db_name = os.getenv('MONGODB_DB_NAME', 'trading_monitor')
    db = client[db_name]
    collection = db.daily_signal_snapshots
    
    print("🔍 Checking daily_signal_snapshots collection...\n")
    
    # Get all existing snapshots sorted by date
    cursor = collection.find({}, {'snapshot_date': 1}).sort('snapshot_date', ASCENDING)
    snapshots = await cursor.to_list(length=None)
    
    if not snapshots:
        print("❌ No snapshots found in database!")
        return
    
    # Extract dates
    existing_dates = set()
    for snap in snapshots:
        snapshot_date = snap['snapshot_date']
        if isinstance(snapshot_date, str):
            snapshot_date = datetime.fromisoformat(snapshot_date.replace('Z', '+00:00'))
        date_only = snapshot_date.date()
        existing_dates.add(date_only)
    
    existing_dates_sorted = sorted(existing_dates)
    
    print(f"📊 Found {len(existing_dates)} snapshots")
    print(f"   First: {existing_dates_sorted[0]}")
    print(f"   Last:  {existing_dates_sorted[-1]}")
    print()
    
    # Check for gaps from Jan 1, 2025 to today
    start_date = datetime(2025, 1, 1).date()
    end_date = datetime(2026, 3, 21).date()
    
    print(f"📅 Checking range: {start_date} to {end_date}")
    print()
    
    missing_dates = []
    current_date = start_date
    
    while current_date <= end_date:
        # Skip weekends
        if current_date.weekday() < 5:  # Monday = 0, Friday = 4
            if current_date not in existing_dates:
                missing_dates.append(current_date)
        current_date += timedelta(days=1)
    
    if missing_dates:
        print(f"❌ Found {len(missing_dates)} missing trading days:\n")
        
        # Group by month for better readability
        by_month = {}
        for date in missing_dates:
            month_key = date.strftime('%Y-%m')
            if month_key not in by_month:
                by_month[month_key] = []
            by_month[month_key].append(date)
        
        for month, dates in sorted(by_month.items()):
            print(f"  📆 {month}: {len(dates)} missing days")
            for date in dates:
                print(f"     {date.strftime('%Y-%m-%d %A')}")
        
        print(f"\n💡 To backfill from {missing_dates[0]}, run:")
        print(f"   python backfill_signals.py --start-date {missing_dates[0]}")
    else:
        print("✅ No missing dates! All trading days are filled.")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(check_missing_dates())
