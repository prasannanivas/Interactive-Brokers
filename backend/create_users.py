"""
Script to create user accounts in the database
Run this to migrate hardcoded users or create new accounts
"""

import asyncio
import sys
import os
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(__file__))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Import auth functions
from auth import get_password_hash

# Load environment
load_dotenv()


async def create_user(email: str, username: str, password: str, full_name: str = None):
    """Create a user account in MongoDB"""
    
    # Connect to MongoDB
    mongodb_url = os.getenv('MONGODB_URL', 'mongodb://localhost:27017')
    db_name = os.getenv('MONGODB_DB_NAME', 'trading_monitor')
    
    client = AsyncIOMotorClient(mongodb_url)
    db = client[db_name]
    users_collection = db.users
    
    try:
        # Check if user already exists
        existing_user = await users_collection.find_one({
            "$or": [
                {"email": email},
                {"username": username}
            ]
        })
        
        if existing_user:
            print(f"❌ User already exists: {email} or {username}")
            return False
        
        # Hash password
        hashed_password = get_password_hash(password)
        
        # Create user document
        user_doc = {
            "username": username,
            "email": email,
            "hashed_password": hashed_password,
            "full_name": full_name,
            "is_active": True,
            "created_at": datetime.utcnow(),
            "last_login": None
        }
        
        # Insert user
        result = await users_collection.insert_one(user_doc)
        
        print(f"✅ Created user: {email} (ID: {result.inserted_id})")
        return True
        
    except Exception as e:
        print(f"❌ Error creating user {email}: {e}")
        return False
    finally:
        client.close()


async def create_hardcoded_users():
    """Create accounts for the hardcoded users from simple-login"""
    
    # List of hardcoded users from the old system
    hardcoded_users = [
        {
            "email": "Anatoli@gmail.com",
            "username": "Anatoli",
            "full_name": "Anatoli",
            "password": "secret"  # CHANGE THESE IN PRODUCTION!
        },
        {
            "email": "Nivas@gmail.com",
            "username": "Nivas",
            "full_name": "Nivas",
            "password": "secret"
        },
        {
            "email": "leor@gmail.com",
            "username": "Leor",
            "full_name": "Leor",
            "password": "secret"
        },
        {
            "email": "tolik1@gmail.com",
            "username": "Tolik",
            "full_name": "Tolik",
            "password": "secret"
        },
        {
            "email": "leor.jivotovsky@gmail.com",
            "username": "Leor2",
            "full_name": "Leor Jivotovsky",
            "password": "secret"
        }
    ]
    
    print("Creating accounts for hardcoded users...")
    print("=" * 60)
    
    success_count = 0
    for user in hardcoded_users:
        success = await create_user(
            email=user["email"],
            username=user["username"],
            password=user["password"],
            full_name=user["full_name"]
        )
        if success:
            success_count += 1
    
    print("=" * 60)
    print(f"Created {success_count} out of {len(hardcoded_users)} users")
    
    if success_count > 0:
        print("\n⚠️  IMPORTANT: Change the default passwords!")
        print("These users were created with password: 'secret'")
        print("Have users reset their passwords immediately.")


async def create_custom_user():
    """Interactive user creation"""
    print("\nCreate a new user")
    print("=" * 60)
    
    email = input("Email: ").strip()
    username = input("Username: ").strip()
    password = input("Password: ").strip()
    full_name = input("Full name (optional): ").strip() or None
    
    if not email or not username or not password:
        print("❌ Email, username, and password are required")
        return
    
    if len(password) < 8:
        print("❌ Password must be at least 8 characters")
        return
    
    await create_user(email, username, password, full_name)


async def list_users():
    """List all users in the database"""
    mongodb_url = os.getenv('MONGODB_URL', 'mongodb://localhost:27017')
    db_name = os.getenv('MONGODB_DB_NAME', 'trading_monitor')
    
    client = AsyncIOMotorClient(mongodb_url)
    db = client[db_name]
    users_collection = db.users
    
    try:
        users = await users_collection.find({}).to_list(length=None)
        
        print("\nUsers in database:")
        print("=" * 80)
        print(f"{'Email':<30} {'Username':<20} {'Full Name':<20} {'Active':<10}")
        print("=" * 80)
        
        for user in users:
            email = user.get('email', 'N/A')
            username = user.get('username', 'N/A')
            full_name = user.get('full_name', 'N/A') or 'N/A'
            is_active = '✓' if user.get('is_active', False) else '✗'
            
            print(f"{email:<30} {username:<20} {full_name:<20} {is_active:<10}")
        
        print("=" * 80)
        print(f"Total users: {len(users)}")
        
    except Exception as e:
        print(f"❌ Error listing users: {e}")
    finally:
        client.close()


async def main():
    """Main function"""
    print("User Management Tool")
    print("=" * 60)
    print("1. Create accounts for hardcoded users")
    print("2. Create a custom user")
    print("3. List all users")
    print("4. Exit")
    print("=" * 60)
    
    choice = input("\nSelect option (1-4): ").strip()
    
    if choice == "1":
        await create_hardcoded_users()
    elif choice == "2":
        await create_custom_user()
    elif choice == "3":
        await list_users()
    elif choice == "4":
        print("Goodbye!")
        return
    else:
        print("Invalid option")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nOperation cancelled")
