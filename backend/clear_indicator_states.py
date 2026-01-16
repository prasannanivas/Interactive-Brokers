import asyncio
from database import Database, get_indicator_states_collection

async def clear_indicator_states():
    """Clear old indicator states data"""
    await Database.connect_db()
    collection = get_indicator_states_collection()
    result = await collection.delete_many({})
    print(f'✓ Deleted {result.deleted_count} old records from indicator_states collection')
    await Database.close_db()

if __name__ == "__main__":
    asyncio.run(clear_indicator_states())
