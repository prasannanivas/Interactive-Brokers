"""
MongoDB Database Configuration and Connection Management
"""

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ConnectionFailure
import os
from datetime import datetime


class Database:
    client: AsyncIOMotorClient = None
    
    @classmethod
    async def connect_db(cls):
        """Connect to MongoDB"""
        try:
            mongodb_url = os.getenv('MONGODB_URL', 'mongodb://localhost:27017')
            cls.client = AsyncIOMotorClient(mongodb_url)
            # Test connection
            await cls.client.admin.command('ping')
            print(f"✓ Connected to MongoDB at {mongodb_url}")
            
            # Create indexes
            await cls.create_indexes()
            
        except ConnectionFailure as e:
            print(f"✗ MongoDB connection failed: {e}")
            raise
    
    @classmethod
    async def close_db(cls):
        """Close MongoDB connection"""
        if cls.client:
            cls.client.close()
            print("✓ MongoDB connection closed")
    
    @classmethod
    def get_db(cls):
        """Get database instance"""
        db_name = os.getenv('MONGODB_DB_NAME', 'trading_monitor')
        return cls.client[db_name]
    
    @classmethod
    async def create_indexes(cls):
        """Create database indexes for better performance"""
        db = cls.get_db()
        
        # Users collection indexes
        await db.users.create_index("email", unique=True)
        await db.users.create_index("username", unique=True)
        
        # Login history indexes
        await db.login_history.create_index([("user_id", 1), ("login_time", -1)])
        await db.login_history.create_index("login_time")
        
        # API calls history indexes
        await db.api_calls.create_index([("timestamp", -1)])
        await db.api_calls.create_index([("endpoint", 1), ("timestamp", -1)])
        await db.api_calls.create_index([("user_id", 1), ("timestamp", -1)])
        
        # Signals history indexes
        await db.signals.create_index([("symbol", 1), ("timestamp", -1)])
        await db.signals.create_index([("timestamp", -1)])
        await db.signals.create_index([("signal_type", 1), ("timestamp", -1)])
        
        # Watchlist history indexes
        await db.watchlist_changes.create_index([("timestamp", -1)])
        await db.watchlist_changes.create_index([("symbol", 1), ("timestamp", -1)])
        
        # Watchlist collection indexes
        await db.watchlist.create_index("symbol", unique=True)
        await db.watchlist.create_index([("market_type", 1)])
        
        # Signal batches indexes (for backtesting)
        await db.signal_batches.create_index([("timestamp", -1)])
        await db.signal_batches.create_index([("batch_id", 1)], unique=True)
        
        # Indicator states indexes (for tracking individual indicator changes)
        await db.indicator_states.create_index([("symbol", 1), ("indicator", 1)])
        await db.indicator_states.create_index([("symbol", 1), ("timestamp", -1)])
        
        # Position changes indexes (for backtesting overall BUY/SELL/NEUTRAL)
        await db.position_changes.create_index([("symbol", 1), ("timestamp", -1)])
        await db.position_changes.create_index([("timestamp", -1)])
        await db.position_changes.create_index([("position", 1), ("timestamp", -1)])
        
        print("✓ MongoDB indexes created")


# Collections helper functions
def get_users_collection():
    """Get users collection"""
    return Database.get_db().users


def get_login_history_collection():
    """Get login history collection"""
    return Database.get_db().login_history


def get_api_calls_collection():
    """Get API calls collection"""
    return Database.get_db().api_calls


def get_signals_collection():
    """Get signals collection"""
    return Database.get_db().signals


def get_watchlist_changes_collection():
    """Get watchlist changes collection"""
    return Database.get_db().watchlist_changes


def get_watchlist_collection():
    """Get watchlist collection"""
    return Database.get_db().watchlist


def get_signal_batches_collection():
    """Get signal batches collection"""
    return Database.get_db().signal_batches


def get_indicator_states_collection():
    """Get indicator states collection for tracking changes"""
    return Database.get_db().indicator_states


def get_position_changes_collection():
    """Get position changes collection for backtesting"""
    return Database.get_db().position_changes
