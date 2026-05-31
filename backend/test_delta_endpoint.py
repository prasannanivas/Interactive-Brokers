import asyncio
from database import Database
from datetime import datetime, timedelta, timezone

async def test():
    await Database.connect_db()
    db = Database.get_db()
    col = db.signals
    target_time = datetime.now(timezone.utc) - timedelta(days=7)
    print('Target time:', target_time)
    pipeline = [
        {"$match": {"timestamp": {"$lte": target_time}}},
        {"$sort": {"symbol": 1, "timestamp": -1}},
        {"$group": {
            "_id": "$symbol",
            "buy_count": {"$first": {"$size": {"$ifNull": ["$buy_signals", []]}}},
            "sell_count": {"$first": {"$size": {"$ifNull": ["$sell_signals", []]}}},
            "timestamp": {"$first": "$timestamp"},
        }},
    ]
    results = await col.aggregate(pipeline).to_list(length=None)
    print('Results count:', len(results))
    if results:
        for r in results[:3]:
            print(' ', r)

asyncio.run(test())
