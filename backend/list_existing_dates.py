import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

async def list_dates():
    mongo_uri = os.getenv('MONGODB_URL')
    client = AsyncIOMotorClient(mongo_uri)
    db_name = os.getenv('MONGODB_DB_NAME', 'trading_monitor')
    db = client[db_name]
    collection = db.daily_signal_snapshots
    
    # Get all unique dates
    snapshots = await collection.find({}, {'snapshot_date': 1}).sort('snapshot_date', 1).to_list(length=None)
    
    print(f"\n📊 Found {len(snapshots)} snapshots\n")
    print("Existing dates:")
    print("=" * 50)
    
    for snap in snapshots:
        date = snap['snapshot_date']
        print(f"  {date.strftime('%Y-%m-%d %A')}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(list_dates())
