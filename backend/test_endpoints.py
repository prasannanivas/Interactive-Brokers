"""
Test script to verify bond and interest rate API endpoints
"""

import asyncio
import json
from database import Database
from database import get_bond_yields_collection, get_interest_rates_collection
from datetime import datetime, timedelta


async def test_bond_yields_structure():
    """Test the new bond yields data structure"""
    print("\n" + "=" * 80)
    print("TESTING BOND YIELDS DATA STRUCTURE")
    print("=" * 80)
    
    await Database.connect_db()
    collection = get_bond_yields_collection()
    
    # Test fetching US 10Y bonds
    doc = await collection.find_one({'country': 'United States', 'maturity': '10y'})
    
    if doc:
        print(f"\n✓ Found document for US 10Y bonds")
        print(f"  Country: {doc['country']}")
        print(f"  Symbol: {doc['symbol']}")
        print(f"  Maturity: {doc['maturity']}")
        print(f"  Record count: {doc['record_count']}")
        print(f"  Last available date: {doc['last_available_date']}")
        
        # Test extracting recent data (last 30 days)
        cutoff_date = datetime.now() - timedelta(days=30)
        recent_data = [
            {
                'Symbol': doc['symbol'],
                'Date': dp['date'],
                'Open': dp['open'],
                'High': dp['high'],
                'Low': dp['low'],
                'Close': dp['close']
            }
            for dp in doc['data']
            if dp['date_obj'] >= cutoff_date
        ]
        
        print(f"\n✓ Extracted {len(recent_data)} records from last 30 days")
        if recent_data:
            print(f"\nSample record:")
            print(json.dumps(recent_data[0], indent=2))
    else:
        print("❌ No US 10Y bond document found")
    
    await Database.close_db()


async def test_interest_rates_structure():
    """Test the new interest rates data structure"""
    print("\n" + "=" * 80)
    print("TESTING INTEREST RATES DATA STRUCTURE")
    print("=" * 80)
    
    await Database.connect_db()
    collection = get_interest_rates_collection()
    
    # Test fetching Canada interest rates
    doc = await collection.find_one({'country': 'Canada'})
    
    if doc:
        print(f"\n✓ Found document for Canada interest rates")
        print(f"  Country: {doc['country']}")
        print(f"  Category: {doc['category']}")
        print(f"  Symbol: {doc['historical_data_symbol']}")
        print(f"  Record count: {doc['record_count']}")
        print(f"  Last available date: {doc['last_available_date']}")
        
        # Test extracting recent data (last 60 days)
        cutoff_date = datetime.now() - timedelta(days=60)
        recent_data = [
            {
                'Country': doc['country'],
                'Category': doc['category'],
                'DateTime': dp['date_time'],
                'Value': dp['value'],
                'Frequency': doc['frequency'],
                'HistoricalDataSymbol': doc['historical_data_symbol'],
                'LastUpdate': dp['last_update']
            }
            for dp in doc['data']
            if dp['date_obj'] >= cutoff_date
        ]
        
        print(f"\n✓ Extracted {len(recent_data)} records from last 60 days")
        if recent_data:
            print(f"\nSample record:")
            print(json.dumps(recent_data[0], indent=2))
    else:
        print("❌ No Canada interest rate document found")
    
    await Database.close_db()


async def test_last_available_dates():
    """Test checking last available dates for incremental fetching"""
    print("\n" + "=" * 80)
    print("TESTING LAST AVAILABLE DATES (for incremental fetch)")
    print("=" * 80)
    
    await Database.connect_db()
    
    # Test bonds
    bond_collection = get_bond_yields_collection()
    print("\n📊 Bond Yields - Last Available Dates:")
    async for doc in bond_collection.find({}, {'country': 1, 'maturity': 1, 'last_available_date': 1, 'record_count': 1}):
        print(f"  • {doc['country']} {doc['maturity']}: {doc['last_available_date'].strftime('%d/%m/%Y')} ({doc['record_count']} records)")
    
    # Test interest rates
    ir_collection = get_interest_rates_collection()
    print("\n🏦 Interest Rates - Last Available Dates:")
    async for doc in ir_collection.find({}, {'country': 1, 'last_available_date': 1, 'record_count': 1}):
        print(f"  • {doc['country']}: {doc['last_available_date'].strftime('%Y-%m-%d')} ({doc['record_count']} records)")
    
    await Database.close_db()


async def main():
    """Run all tests"""
    try:
        await test_bond_yields_structure()
        await test_interest_rates_structure()
        await test_last_available_dates()
        
        print("\n" + "=" * 80)
        print("✅ ALL TESTS PASSED!")
        print("=" * 80)
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
