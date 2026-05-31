"""
Migrate Bond Yield and Interest Rate data from JSON files to MongoDB
This script reads all existing JSON files and imports them into MongoDB collections
"""

import asyncio
import json
import os
from datetime import datetime
from pathlib import Path
from pymongo import UpdateOne
from database import Database, get_bond_yields_collection, get_interest_rates_collection, get_data_fetch_tracker_collection


# Country mappings
BOND_COUNTRIES = {
    'us': 'United States',
    'canada': 'Canada',
    'japan': 'Japan',
    'germany': 'Euro Area',
    'uk': 'United Kingdom',
    'australia': 'Australia',
    'china': 'China',
    'czech': 'Czech Republic',
    'denmark': 'Denmark',
    'hong_kong': 'Hong Kong',
    'hungary': 'Hungary',
    'israel': 'Israel',
    'mexico': 'Mexico',
    'new_zealand': 'New Zealand',
    'norway': 'Norway',
    'russia': 'Russia',
    'singapore': 'Singapore',
    'sweden': 'Sweden',
    'switzerland': 'Switzerland'
}

INTEREST_RATE_FILES = {
    'united_states.json': 'United States',
    'canada.json': 'Canada',
    'japan.json': 'Japan',
    'euro_area.json': 'Euro Area',
    'united_kingdom.json': 'United Kingdom',
    'australia.json': 'Australia',
    'china.json': 'China',
    'czech_republic.json': 'Czech Republic',
    'denmark.json': 'Denmark',
    'hong_kong.json': 'Hong Kong',
    'hungary.json': 'Hungary',
    'israel.json': 'Israel',
    'mexico.json': 'Mexico',
    'new_zealand.json': 'New Zealand',
    'norway.json': 'Norway',
    'russia.json': 'Russia',
    'singapore.json': 'Singapore',
    'sweden.json': 'Sweden',
    'switzerland.json': 'Switzerland'
}

# Symbol to country mapping for bonds
SYMBOL_TO_COUNTRY = {
    'USGG10YR:IND': 'United States',
    'USGG2YR:IND': 'United States',
    'GTDEM10Y:GOV': 'Euro Area',
    'GTDEM2Y:GOV': 'Euro Area',
    'GUKG10:IND': 'United Kingdom',
    'GUKG2:IND': 'United Kingdom',
    'GJGB10:IND': 'Japan',
    'GJGB2:IND': 'Japan',
    'GCAN10YR:IND': 'Canada',
    'GCAN2YR:IND': 'Canada',
    'GACGB10:IND': 'Australia',
    'GACGB2YR:IND': 'Australia'
}


def parse_date_dd_mm_yyyy(date_str: str) -> datetime:
    """Parse date in DD/MM/YYYY format"""
    return datetime.strptime(date_str, '%d/%m/%Y')


def parse_date_iso(date_str: str) -> datetime:
    """Parse ISO format date (YYYY-MM-DDTHH:MM:SS)"""
    return datetime.fromisoformat(date_str.replace('Z', '+00:00').split('T')[0])


async def migrate_bond_yields():
    """Migrate bond yield data from JSON files to MongoDB"""
    bond_dir = Path(r'e:\Interactive Brokers\frontend\public\bond')
    bond_collection = get_bond_yields_collection()
    
    print("\n" + "=" * 80)
    print("MIGRATING BOND YIELD DATA")
    print("=" * 80)
    
    total_inserted = 0
    total_updated = 0
    
    # Process each bond file
    for file_path in bond_dir.glob('*-10y.json'):
        country_prefix = file_path.stem.replace('-10y', '')
        country = BOND_COUNTRIES.get(country_prefix)
        
        if not country:
            print(f"⚠ Unknown country prefix: {country_prefix}, skipping...")
            continue
        
        # Process 10Y bonds
        print(f"\n📊 Processing {country} 10Y bonds...")
        with open(file_path, 'r') as f:
            data_10y = json.load(f)
        
        # Batch operations for better performance
        operations_10y = []
        for record in data_10y:
            symbol = record.get('Symbol') or record.get('symbol')
            date_str = record.get('Date') or record.get('date')
            
            if not symbol or not date_str:
                continue
            
            try:
                date_obj = parse_date_dd_mm_yyyy(date_str)
            except:
                continue
            
            bond_doc = {
                'country': country,
                'symbol': symbol,
                'maturity': '10y',
                'date': date_str,
                'date_obj': date_obj,
                'open': float(record.get('Open') or record.get('open', 0)),
                'high': float(record.get('High') or record.get('high', 0)),
                'low': float(record.get('Low') or record.get('low', 0)),
                'close': float(record.get('Close') or record.get('close', 0))
            }
            
            operations_10y.append({
                'filter': {'country': country, 'symbol': symbol, 'date': date_str, 'maturity': '10y'},
                'update': {'$set': bond_doc},
                'upsert': True
            })
        
        # Execute bulk operations in batches of 500
        if operations_10y:
            batch_size = 100
            for i in range(0, len(operations_10y), batch_size):
                batch = operations_10y[i:i+batch_size]
                try:
                    bulk_ops = [UpdateOne(op['filter'], op['update'], upsert=op['upsert']) for op in batch]
                    result = await bond_collection.bulk_write(bulk_ops, ordered=False)
                    total_inserted += result.upserted_count
                    total_updated += result.modified_count
                except Exception as e:
                    print(f"  ⚠ Error in batch: {str(e)[:100]}")
        
        print(f"  ✓ Processed {len(data_10y)} records for {country} 10Y")
        
        # Process 2Y bonds
        file_2y = bond_dir / f'{country_prefix}-2y.json'
        if file_2y.exists():
            print(f"📊 Processing {country} 2Y bonds...")
            with open(file_2y, 'r') as f:
                data_2y = json.load(f)
            
            operations_2y = []
            for record in data_2y:
                symbol = record.get('Symbol') or record.get('symbol')
                date_str = record.get('Date') or record.get('date')
                
                if not symbol or not date_str:
                    continue
                
                try:
                    date_obj = parse_date_dd_mm_yyyy(date_str)
                except:
                    continue
                
                bond_doc = {
                    'country': country,
                    'symbol': symbol,
                    'maturity': '2y',
                    'date': date_str,
                    'date_obj': date_obj,
                    'open': float(record.get('Open') or record.get('open', 0)),
                    'high': float(record.get('High') or record.get('high', 0)),
                    'low': float(record.get('Low') or record.get('low', 0)),
                    'close': float(record.get('Close') or record.get('close', 0))
                }
                
                operations_2y.append({
                    'filter': {'country': country, 'symbol': symbol, 'date': date_str, 'maturity': '2y'},
                    'update': {'$set': bond_doc},
                    'upsert': True
                })
            
            # Execute bulk operations in batches
            if operations_2y:
                batch_size = 100
                for i in range(0, len(operations_2y), batch_size):
                    batch = operations_2y[i:i+batch_size]
                    try:
                        bulk_ops = [UpdateOne(op['filter'], op['update'], upsert=op['upsert']) for op in batch]
                        result = await bond_collection.bulk_write(bulk_ops, ordered=False)
                        total_inserted += result.upserted_count
                        total_updated += result.modified_count
                    except Exception as e:
                        print(f"  ⚠ Error in batch: {str(e)[:100]}")
            
            print(f"  ✓ Processed {len(data_2y)} records for {country} 2Y")
    
    print(f"\n✅ Bond yield migration complete!")
    print(f"   Inserted: {total_inserted} | Updated: {total_updated}")
    return total_inserted, total_updated


async def migrate_interest_rates():
    """Migrate interest rate data from JSON files to MongoDB"""
    interest_rate_dir = Path(r'e:\Interactive Brokers\frontend\public\Interest rate')
    interest_rate_collection = get_interest_rates_collection()
    
    print("\n" + "=" * 80)
    print("MIGRATING INTEREST RATE DATA")
    print("=" * 80)
    
    total_inserted = 0
    total_updated = 0
    
    # Process each interest rate file
    for filename, country in INTEREST_RATE_FILES.items():
        file_path = interest_rate_dir / filename
        
        if not file_path.exists():
            print(f"⚠ File not found: {filename}, skipping...")
            continue
        
        print(f"\n🏦 Processing {country} interest rates...")
        with open(file_path, 'r') as f:
            data = json.load(f)
        
        operations = []
        for record in data:
            date_time_str = record.get('DateTime', '')
            value = record.get('Value')
            
            if not date_time_str or value is None:
                continue
            
            try:
                date_obj = parse_date_iso(date_time_str)
            except:
                continue
            
            interest_doc = {
                'country': country,
                'category': record.get('Category', 'Interest Rate'),
                'date_time': date_time_str,
                'date_obj': date_obj,
                'value': float(value),
                'frequency': record.get('Frequency', 'Daily'),
                'historical_data_symbol': record.get('HistoricalDataSymbol', ''),
                'last_update': record.get('LastUpdate', date_time_str)
            }
            
            operations.append({
                'filter': {'country': country, 'date_time': date_time_str},
                'update': {'$set': interest_doc},
                'upsert': True
            })
        
        # Execute bulk operations in batches
        if operations:
            batch_size = 100
            for i in range(0, len(operations), batch_size):
                batch = operations[i:i+batch_size]
                try:
                    bulk_ops = [UpdateOne(op['filter'], op['update'], upsert=op['upsert']) for op in batch]
                    result = await interest_rate_collection.bulk_write(bulk_ops, ordered=False)
                    total_inserted += result.upserted_count
                    total_updated += result.modified_count
                except Exception as e:
                    print(f"  ⚠ Error in batch: {str(e)[:100]}")
        
        print(f"  ✓ Processed {len(data)} records for {country}")
    
    print(f"\n✅ Interest rate migration complete!")
    print(f"   Inserted: {total_inserted} | Updated: {total_updated}")
    return total_inserted, total_updated


async def update_fetch_tracker():
    """Update the data fetch tracker with last available dates"""
    bond_collection = get_bond_yields_collection()
    interest_rate_collection = get_interest_rates_collection()
    tracker_collection = get_data_fetch_tracker_collection()
    
    print("\n" + "=" * 80)
    print("UPDATING DATA FETCH TRACKER")
    print("=" * 80)
    
    # Update bond yield trackers
    for country in BOND_COUNTRIES.values():
        # 10Y bonds
        latest_10y = await bond_collection.find_one(
            {'country': country, 'maturity': '10y'},
            sort=[('date_obj', -1)]
        )
        
        if latest_10y:
            count_10y = await bond_collection.count_documents(
                {'country': country, 'maturity': '10y'}
            )
            
            await tracker_collection.update_one(
                {'country': country, 'data_type': 'bond_10y'},
                {'$set': {
                    'country': country,
                    'data_type': 'bond_10y',
                    'last_fetch_date': latest_10y['date_obj'],
                    'last_available_date': latest_10y['date_obj'],
                    'total_records': count_10y,
                    'last_updated': datetime.utcnow()
                }},
                upsert=True
            )
            print(f"  ✓ {country} 10Y: {count_10y} records, latest: {latest_10y['date']}")
        
        # 2Y bonds
        latest_2y = await bond_collection.find_one(
            {'country': country, 'maturity': '2y'},
            sort=[('date_obj', -1)]
        )
        
        if latest_2y:
            count_2y = await bond_collection.count_documents(
                {'country': country, 'maturity': '2y'}
            )
            
            await tracker_collection.update_one(
                {'country': country, 'data_type': 'bond_2y'},
                {'$set': {
                    'country': country,
                    'data_type': 'bond_2y',
                    'last_fetch_date': latest_2y['date_obj'],
                    'last_available_date': latest_2y['date_obj'],
                    'total_records': count_2y,
                    'last_updated': datetime.utcnow()
                }},
                upsert=True
            )
            print(f"  ✓ {country} 2Y: {count_2y} records, latest: {latest_2y['date']}")
    
    # Update interest rate trackers
    for country in INTEREST_RATE_FILES.values():
        latest_ir = await interest_rate_collection.find_one(
            {'country': country},
            sort=[('date_obj', -1)]
        )
        
        if latest_ir:
            count_ir = await interest_rate_collection.count_documents(
                {'country': country}
            )
            
            await tracker_collection.update_one(
                {'country': country, 'data_type': 'interest_rate'},
                {'$set': {
                    'country': country,
                    'data_type': 'interest_rate',
                    'last_fetch_date': latest_ir['date_obj'],
                    'last_available_date': latest_ir['date_obj'],
                    'total_records': count_ir,
                    'last_updated': datetime.utcnow()
                }},
                upsert=True
            )
            print(f"  ✓ {country} Interest Rate: {count_ir} records, latest: {latest_ir['date_time'][:10]}")
    
    print(f"\n✅ Data fetch tracker updated!")


async def main():
    """Main migration function"""
    print("\n" + "=" * 80)
    print("STARTING BOND & INTEREST RATE DATA MIGRATION TO MONGODB")
    print("=" * 80)
    
    try:
        # Connect to MongoDB
        await Database.connect_db()
        
        # Migrate bond yields
        bonds_inserted, bonds_updated = await migrate_bond_yields()
        
        # Migrate interest rates
        rates_inserted, rates_updated = await migrate_interest_rates()
        
        # Update fetch tracker
        await update_fetch_tracker()
        
        print("\n" + "=" * 80)
        print("MIGRATION SUMMARY")
        print("=" * 80)
        print(f"Bond Yields:")
        print(f"  • Inserted: {bonds_inserted}")
        print(f"  • Updated: {bonds_updated}")
        print(f"\nInterest Rates:")
        print(f"  • Inserted: {rates_inserted}")
        print(f"  • Updated: {rates_updated}")
        print(f"\n✅ All data successfully migrated to MongoDB!")
        print("=" * 80)
        
    except Exception as e:
        print(f"\n❌ Migration failed: {str(e)}")
        import traceback
        traceback.print_exc()
        
    finally:
        # Close MongoDB connection
        await Database.close_db()


if __name__ == "__main__":
    asyncio.run(main())
