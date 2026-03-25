import asyncio
from database import Database

async def test():
    await Database.connect_db()
    print("✓ Remote MongoDB connected successfully!")
    await Database.close_db()

asyncio.run(test())
