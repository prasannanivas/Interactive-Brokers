"""
Check existing users in the database
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os

load_dotenv()

async def check_users():
    # Connect to MongoDB
    mongo_uri = os.getenv('MONGODB_URI')
    client = AsyncIOMotorClient(mongo_uri)
    db = client.trading_monitor
    users_collection = db.users
    
    print("=" * 60)
    print("Checking existing users...")
    print("=" * 60)
    
    # Get all users
    users = await users_collection.find({}).to_list(length=None)
    
    if not users:
        print("\n❌ No users found in database!")
        print("\nYou need to register a new user.")
        print("\nExample registration data:")
        print("  Email: admin@example.com")
        print("  Username: admin")
        print("  Password: admin123")
        print("  Full Name: Admin User")
    else:
        print(f"\n✓ Found {len(users)} user(s):\n")
        for user in users:
            print(f"  📧 Email: {user.get('email')}")
            print(f"  👤 Username: {user.get('username')}")
            print(f"  📛 Full Name: {user.get('full_name', 'N/A')}")
            print(f"  🔑 User ID: {user.get('_id')}")
            print(f"  ✅ Active: {user.get('is_active', True)}")
            print(f"  📅 Created: {user.get('created_at', 'N/A')}")
            print("-" * 60)
    
    print()
    client.close()

if __name__ == "__main__":
    asyncio.run(check_users())
