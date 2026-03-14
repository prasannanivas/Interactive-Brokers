"""
Migration Script: Remove unique constraint from username index
Run this once to update existing MongoDB indexes
"""

import asyncio
import sys
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Load environment
load_dotenv()


async def migrate():
    """Remove unique constraint from username index"""
    
    # Connect to MongoDB
    mongodb_url = os.getenv('MONGODB_URL', 'mongodb://localhost:27017')
    db_name = os.getenv('MONGODB_DB_NAME', 'trading_monitor')
    
    client = AsyncIOMotorClient(mongodb_url)
    db = client[db_name]
    users_collection = db.users
    
    try:
        print("="*60)
        print("Migration: Remove unique constraint from username")
        print("="*60)
        
        # List current indexes
        print("\nCurrent indexes:")
        indexes = await users_collection.index_information()
        for name, info in indexes.items():
            print(f"  - {name}: {info}")
        
        # Drop the unique username index if it exists
        print("\n⏳ Dropping unique username index...")
        try:
            await users_collection.drop_index("username_1")
            print("✅ Dropped username_1 index")
        except Exception as e:
            print(f"ℹ️  Index may not exist or already dropped: {e}")
        
        # Create non-unique username index
        print("\n⏳ Creating non-unique username index...")
        await users_collection.create_index("username")
        print("✅ Created non-unique username index")
        
        # Verify new indexes
        print("\nUpdated indexes:")
        indexes = await users_collection.index_information()
        for name, info in indexes.items():
            print(f"  - {name}: {info}")
        
        print("\n" + "="*60)
        print("✅ Migration completed successfully!")
        print("="*60)
        print("\nNotes:")
        print("- Username is no longer unique")
        print("- Email remains unique")
        print("- Multiple users can now have the same username")
        
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        return False
    finally:
        client.close()
    
    return True


if __name__ == "__main__":
    try:
        success = asyncio.run(migrate())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\nMigration cancelled")
        sys.exit(1)
