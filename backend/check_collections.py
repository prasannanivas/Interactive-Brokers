"""
Check MongoDB Collections
"""
import asyncio
from database import Database

async def check_collections():
    await Database.connect_db()
    db = Database.get_db()
    
    collections = await db.list_collection_names()
    
    print("\n" + "="*70)
    print("MongoDB Collections:")
    print("="*70)
    
    for collection in sorted(collections):
        count = await db[collection].count_documents({})
        print(f"  • {collection:30} ({count:,} documents)")
    
    print("="*70)
    
    # Check indicator_states structure
    print("\nSample indicator_states document:")
    print("="*70)
    doc = await db.indicator_states.find_one()
    if doc:
        print(f"  Symbol: {doc.get('symbol')}")
        print(f"  Indicator: {doc.get('indicator')}")
        print(f"  From State: {doc.get('from_state')}")
        print(f"  To State: {doc.get('to_state')}")
        print(f"  Timestamp: {doc.get('timestamp')}")
        print(f"  Price: {doc.get('price')}")
    else:
        print("  No documents found")
    
    print("="*70)
    
    Database.client.close()

if __name__ == "__main__":
    asyncio.run(check_collections())
