import asyncio
from database import Database
from datetime import datetime, timedelta

async def check():
    await Database.connect_db()
    from database import get_daily_signal_snapshots_collection
    col = get_daily_signal_snapshots_collection()
    count = await col.count_documents({})
    print('Total snapshots:', count)
    
    # Find latest
    latest = await col.find_one({}, sort=[('snapshot_date', -1)])
    if latest:
        print('Latest snapshot:', latest['snapshot_date'])
    
    # Check 7 days ago  
    seven_ago = datetime.utcnow() - timedelta(days=7)
    print('Looking for snapshot around:', seven_ago.strftime('%Y-%m-%d'))
    start = datetime(seven_ago.year, seven_ago.month, seven_ago.day)
    end = start + timedelta(days=1)
    snap = await col.find_one({'snapshot_date': {'$gte': start, '$lt': end}})
    print('7-day snapshot found:', snap is not None)
    
    # Last 10 snapshot dates
    print('Last 10 dates:')
    async for doc in col.find({}, {'snapshot_date': 1}).sort('snapshot_date', -1).limit(10):
        print(' ', doc['snapshot_date'])

asyncio.run(check())
