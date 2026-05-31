import asyncio
from database import Database

async def check():
    await Database.connect_db()
    db = Database.get_db()
    col = db.signals
    count = await col.count_documents({})
    print('Total signals records:', count)
    
    latest = await col.find_one({}, sort=[('timestamp', -1)])
    if latest:
        print('Latest signal timestamp:', latest.get('timestamp'))
        print('Fields:', [k for k in latest.keys() if k != '_id'])
        print('buy_signals len:', len(latest.get('buy_signals', [])))
        print('sell_signals len:', len(latest.get('sell_signals', [])))
    else:
        print('NO signals found')
    
    # How many distinct symbols
    symbols = await col.distinct('symbol')
    print('Distinct symbols:', len(symbols))
    
    # How many records per day (sample)
    from datetime import datetime, timedelta
    seven_ago = datetime.utcnow() - timedelta(days=7)
    recent_count = await col.count_documents({'timestamp': {'$gte': seven_ago}})
    print('Records in last 7 days:', recent_count)

asyncio.run(check())
