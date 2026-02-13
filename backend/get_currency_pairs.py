import asyncio
from database import Database

async def get_currency_pairs():
    """Get all currency pairs from watchlist"""
    try:
        # Connect to database
        await Database.connect_db()
        db = Database.get_db()
        
        # Get all watchlist items
        watchlist = await db['watchlist'].find({}).to_list(None)
        
        print(f"Total watchlist items: {len(watchlist)}")
        print("\nCurrency Pairs:")
        
        pairs = []
        for item in watchlist:
            if 'symbol' in item:
                symbol = item['symbol'].replace('C:', '')
                pairs.append(symbol)
                print(f"  - {symbol}")
        
        # Close connection
        await Database.close_db()
        
        return pairs
        
    except Exception as e:
        print(f"Error: {e}")
        return []

if __name__ == '__main__':
    pairs = asyncio.run(get_currency_pairs())
