"""
Script to clear all collections in the database
Run this before implementing new logic
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


async def clear_database():
    """Clear all collections in the database"""
    try:
        # Connect to MongoDB
        mongodb_url = os.getenv('MONGODB_URL', 'mongodb://localhost:27017')
        client = AsyncIOMotorClient(mongodb_url)
        db_name = os.getenv('MONGODB_DB_NAME', 'trading_monitor')
        db = client[db_name]
        
        print(f"🔗 Connected to MongoDB at {mongodb_url}")
        print(f"📦 Using database: {db_name}")
        
        # List all collections
        collections = await db.list_collection_names()
        print(f"\n📋 Found {len(collections)} collections:")
        for col in collections:
            print(f"   - {col}")
        
        # Confirm before deletion
        print("\n⚠️  WARNING: This will delete ALL data from the database!")
        print("Collections to be cleared:")
        for col in collections:
            count = await db[col].count_documents({})
            print(f"   - {col}: {count} documents")
        
        # Clear all collections
        print("\n🗑️  Clearing all collections...")
        for collection_name in collections:
            result = await db[collection_name].delete_many({})
            print(f"   ✓ Cleared {collection_name}: {result.deleted_count} documents deleted")
        
        print("\n✅ Database cleared successfully!")
        
        # Close connection
        client.close()
        
    except Exception as e:
        print(f"❌ Error clearing database: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(clear_database())
