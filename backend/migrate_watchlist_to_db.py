"""
Migration Script: Import watchlist.json to MongoDB

Run this script ONCE to migrate your existing watchlist from JSON file to MongoDB.
After migration, the system will use MongoDB for all watchlist operations.
"""

import asyncio
import json
import os
from datetime import datetime
from dotenv import load_dotenv
from database import Database, get_watchlist_collection

# Load environment variables
load_dotenv()


async def migrate_watchlist():
    """Migrate watchlist from JSON file to MongoDB"""
    
    # Connect to MongoDB
    print("Connecting to MongoDB...")
    await Database.connect_db()
    
    # Read JSON file
    watchlist_file = os.path.join(os.path.dirname(__file__), 'watchlist2.json')
    
    if not os.path.exists(watchlist_file):
        print(f"❌ Watchlist file not found: {watchlist_file}")
        print("Trying watchlist.json instead...")
        watchlist_file = os.path.join(os.path.dirname(__file__), 'watchlist.json')
        
        if not os.path.exists(watchlist_file):
            print(f"❌ No watchlist files found!")
            await Database.close_db()
            return
    
    print(f"📖 Reading watchlist from: {watchlist_file}")
    
    with open(watchlist_file, 'r', encoding='utf-8') as f:
        watchlist_data = json.load(f)
    
    if not isinstance(watchlist_data, dict):
        print(f"❌ Invalid watchlist format. Expected dict, got {type(watchlist_data)}")
        await Database.close_db()
        return
    
    print(f"✓ Found {len(watchlist_data)} symbols in JSON file")
    
    # Get MongoDB collection
    watchlist_collection = get_watchlist_collection()
    
    # Check if collection already has data
    existing_count = await watchlist_collection.count_documents({})
    if existing_count > 0:
        print(f"⚠️  MongoDB already has {existing_count} symbols")
        response = input("Do you want to REPLACE all existing data? (yes/no): ")
        if response.lower() != 'yes':
            print("Migration cancelled.")
            await Database.close_db()
            return
        
        # Clear existing data
        result = await watchlist_collection.delete_many({})
        print(f"✓ Deleted {result.deleted_count} existing symbols")
    
    # Import symbols
    imported = 0
    failed = 0
    
    print(f"\n🔄 Starting migration...")
    
    for symbol, data in watchlist_data.items():
        try:
            doc = {
                'symbol': symbol,
                'exchange': data.get('exchange', 'US'),
                'currency': data.get('currency', 'USD'),
                'sec_type': data.get('sec_type', 'STK'),
                'market_type': data.get('market_type', 'stocks'),
                'last_price': data.get('price'),
                'last_updated': datetime.now(),
                'added_at': datetime.now()
            }
            
            await watchlist_collection.insert_one(doc)
            imported += 1
            
            if imported % 100 == 0:
                print(f"  ✓ Imported {imported}/{len(watchlist_data)} symbols...")
                
        except Exception as e:
            print(f"  ❌ Failed to import {symbol}: {e}")
            failed += 1
    
    print(f"\n✅ Migration complete!")
    print(f"   Imported: {imported}")
    print(f"   Failed: {failed}")
    print(f"   Total: {len(watchlist_data)}")
    
    # Verify
    final_count = await watchlist_collection.count_documents({})
    print(f"\n✓ MongoDB now has {final_count} symbols")
    
    # Close connection
    await Database.close_db()
    print("\n✓ Database connection closed")
    print("\n🎉 You can now start using the system with MongoDB storage!")


if __name__ == "__main__":
    print("=" * 60)
    print("  Watchlist Migration Tool: JSON → MongoDB")
    print("=" * 60)
    print()
    
    try:
        asyncio.run(migrate_watchlist())
    except KeyboardInterrupt:
        print("\n\n⚠️  Migration cancelled by user")
    except Exception as e:
        print(f"\n\n❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
