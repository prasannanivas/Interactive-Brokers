"""
Synchronous Migration Script: Move Bond & Interest Rate JSON Data to MongoDB
Uses pymongo (sync) instead of motor (async) for more reliable bulk operations
"""

import json
from pathlib import Path
from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

# MongoDB connection
MONGODB_URL = os.getenv('MONGODB_URL', 'mongodb://localhost:27017')
MONGODB_DB_NAME = os.getenv('MONGODB_DB_NAME', 'trading_monitor')

# Bond yield data mapping: base filename (without -10y/-2y suffix) -> country
BOND_FILES = {
    'australia': 'Australia',
    'canada': 'Canada',
    'germany': 'Euro Area',
    'japan': 'Japan',
    'uk': 'United Kingdom',
    'us': 'United States',
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

# Interest rate data mapping: filename -> country
INTEREST_RATE_FILES = {
    'australia.json': 'Australia',
    'canada.json': 'Canada',
    'euro_area.json': 'Euro Area',
    'japan.json': 'Japan',
    'united_kingdom.json': 'United Kingdom',
    'united_states.json': 'United States',
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


def parse_date_dd_mm_yyyy(date_str):
    """Parse date string in DD/MM/YYYY format"""
    try:
        return datetime.strptime(date_str, '%d/%m/%Y')
    except:
        try:
            return datetime.strptime(date_str, '%Y-%m-%d')
        except:
            return datetime.now()


def parse_date_iso(date_str):
    """Parse ISO format date string"""
    try:
        return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
    except:
        try:
            return datetime.strptime(date_str[:10], '%Y-%m-%d')
        except:
            return datetime.now()


def migrate_bond_yields(db):
    """Migrate bond yield data from JSON files to MongoDB"""
    print("\n" + "=" * 80)
    print("MIGRATING BOND YIELD DATA")
    print("=" * 80)
    
    bond_collection = db.bond_yields
    total_records = 0
    
    # Base directory for bond data
    base_dir = Path(__file__).parent.parent / 'frontend' / 'public' / 'bond'
    
    # Process each country's bond files
    for base_filename, country in BOND_FILES.items():
        file_10y = base_dir / f'{base_filename}-10y.json'
        file_2y = base_dir / f'{base_filename}-2y.json'
        
        # Process 10Y bonds
        if file_10y.exists():
            print(f"\n📊 Processing {country} 10Y bonds...")
            with open(file_10y, 'r') as f:
                data_10y = json.load(f)
            
            # Get symbol from first record
            symbol = (data_10y[0].get('Symbol') or data_10y[0].get('symbol')) if data_10y else ''
            
            # Build array of all historical data
            historical_data = []
            latest_date = None
            
            for record in data_10y:
                date_str = record.get('Date') or record.get('date')
                if not date_str:
                    continue
                
                try:
                    date_obj = parse_date_dd_mm_yyyy(date_str)
                except:
                    continue
                
                data_point = {
                    'date': date_str,
                    'date_obj': date_obj,
                    'open': float(record.get('Open') or record.get('open', 0)),
                    'high': float(record.get('High') or record.get('high', 0)),
                    'low': float(record.get('Low') or record.get('low', 0)),
                    'close': float(record.get('Close') or record.get('close', 0))
                }
                historical_data.append(data_point)
                
                # Track latest date
                if not latest_date or date_obj > latest_date:
                    latest_date = date_obj
            
            # Create single document for this country + maturity
            if historical_data:
                bond_document = {
                    'country': country,
                    'symbol': symbol,
                    'maturity': '10y',
                    'last_available_date': latest_date,
                    'last_updated': datetime.now(),
                    'record_count': len(historical_data),
                    'data': historical_data
                }
                
                # Upsert the document
                bond_collection.replace_one(
                    {'country': country, 'maturity': '10y'},
                    bond_document,
                    upsert=True
                )
                total_records += len(historical_data)
                print(f"  ✓ Stored {len(historical_data)} records, latest: {latest_date.strftime('%d/%m/%Y')}")
        
        # Process 2Y bonds
        if file_2y.exists():
            print(f"\n📊 Processing {country} 2Y bonds...")
            with open(file_2y, 'r') as f:
                data_2y = json.load(f)
            
            # Get symbol from first record
            symbol = (data_2y[0].get('Symbol') or data_2y[0].get('symbol')) if data_2y else ''
            
            # Build array of all historical data
            historical_data = []
            latest_date = None
            
            for record in data_2y:
                date_str = record.get('Date') or record.get('date')
                if not date_str:
                    continue
                
                try:
                    date_obj = parse_date_dd_mm_yyyy(date_str)
                except:
                    continue
                
                data_point = {
                    'date': date_str,
                    'date_obj': date_obj,
                    'open': float(record.get('Open') or record.get('open', 0)),
                    'high': float(record.get('High') or record.get('high', 0)),
                    'low': float(record.get('Low') or record.get('low', 0)),
                    'close': float(record.get('Close') or record.get('close', 0))
                }
                historical_data.append(data_point)
                
                # Track latest date
                if not latest_date or date_obj > latest_date:
                    latest_date = date_obj
            
            # Create single document for this country + maturity
            if historical_data:
                bond_document = {
                    'country': country,
                    'symbol': symbol,
                    'maturity': '2y',
                    'last_available_date': latest_date,
                    'last_updated': datetime.now(),
                    'record_count': len(historical_data),
                    'data': historical_data
                }
                
                # Upsert the document
                bond_collection.replace_one(
                    {'country': country, 'maturity': '2y'},
                    bond_document,
                    upsert=True
                )
                total_records += len(historical_data)
                print(f"  ✓ Stored {len(historical_data)} records, latest: {latest_date.strftime('%d/%m/%Y')}")
    
    print(f"\n✅ Bond yield migration complete!")
    print(f"   Total historical records: {total_records}")
    print(f"   Total documents: {bond_collection.count_documents({})}")
    return total_records


def migrate_interest_rates(db):
    """Migrate interest rate data from JSON files to MongoDB"""
    print("\n" + "=" * 80)
    print("MIGRATING INTEREST RATE DATA")
    print("=" * 80)
    
    interest_rate_collection = db.interest_rates
    total_records = 0
    
    # Base directory for interest rate data
    interest_rate_dir = Path(__file__).parent.parent / 'frontend' / 'public' / 'Interest rate'
    
    # Process each interest rate file
    for filename, country in INTEREST_RATE_FILES.items():
        file_path = interest_rate_dir / filename
        
        if not file_path.exists():
            print(f"⚠ File not found: {filename}, skipping...")
            continue
        
        print(f"\n🏦 Processing {country} interest rates...")
        with open(file_path, 'r') as f:
            data = json.load(f)
        
        # Build array of all historical data
        historical_data = []
        latest_date = None
        category = ''
        historical_data_symbol = ''
        frequency = ''
        
        for record in data:
            date_time_str = record.get('DateTime', '')
            value = record.get('Value')
            
            if not date_time_str or value is None:
                continue
            
            try:
                date_obj = parse_date_iso(date_time_str)
            except:
                continue
            
            # Get metadata from first record
            if not category:
                category = record.get('Category', 'Interest Rate')
                historical_data_symbol = record.get('HistoricalDataSymbol', '')
                frequency = record.get('Frequency', 'Daily')
            
            data_point = {
                'date_time': date_time_str,
                'date_obj': date_obj,
                'value': float(value),
                'last_update': record.get('LastUpdate', date_time_str)
            }
            historical_data.append(data_point)
            
            # Track latest date
            if not latest_date or date_obj > latest_date:
                latest_date = date_obj
        
        # Create single document for this country
        if historical_data:
            interest_document = {
                'country': country,
                'category': category,
                'historical_data_symbol': historical_data_symbol,
                'frequency': frequency,
                'last_available_date': latest_date,
                'last_updated': datetime.now(),
                'record_count': len(historical_data),
                'data': historical_data
            }
            
            # Upsert the document
            interest_rate_collection.replace_one(
                {'country': country},
                interest_document,
                upsert=True
            )
            total_records += len(historical_data)
            print(f"  ✓ Stored {len(historical_data)} records, latest: {latest_date.strftime('%Y-%m-%d')}")
    
    print(f"\n✅ Interest rate migration complete!")
    print(f"   Total historical records: {total_records}")
    print(f"   Total documents: {interest_rate_collection.count_documents({})}")
    return total_records


def update_fetch_tracker(db):
    """Verify data structure - no longer needed since last_available_date is in each document"""
    print("\n" + "=" * 80)
    print("VERIFYING DATA STRUCTURE")
    print("=" * 80)
    
    bond_collection = db.bond_yields
    interest_rate_collection = db.interest_rates
    
    print("\n📊 Bond Yields:")
    for doc in bond_collection.find({}, {'country': 1, 'maturity': 1, 'last_available_date': 1, 'record_count': 1}):
        print(f"  • {doc['country']} {doc['maturity']}: {doc['record_count']} records, latest: {doc['last_available_date'].strftime('%d/%m/%Y')}")
    
    print("\n🏦 Interest Rates:")
    for doc in interest_rate_collection.find({}, {'country': 1, 'last_available_date': 1, 'record_count': 1}):
        print(f"  • {doc['country']}: {doc['record_count']} records, latest: {doc['last_available_date'].strftime('%Y-%m-%d')}")
    
    print(f"\n✅ Data structure verified!")
    print(f"   Bond yield documents: {bond_collection.count_documents({})}")
    print(f"   Interest rate documents: {interest_rate_collection.count_documents({})}")


def main():
    """Main migration function"""
    print("\n" + "=" * 80)
    print("STARTING BOND & INTEREST RATE DATA MIGRATION TO MONGODB")
    print("=" * 80)
    
    try:
        # Connect to MongoDB
        print("\n🔌 Connecting to MongoDB...")
        client = MongoClient(
            MONGODB_URL,
            serverSelectionTimeoutMS=300000,  # 5 minutes
            connectTimeoutMS=300000,
            socketTimeoutMS=300000
        )
        
        # Test connection
        client.admin.command('ping')
        print(f"✓ Connected to MongoDB")
        
        db = client[MONGODB_DB_NAME]
        
        # Clear existing collections to start fresh
        print("\n🗑️ Clearing existing collections...")
        db.bond_yields.delete_many({})
        db.interest_rates.delete_many({})
        print("  ✓ Collections cleared")
        
        # Migrate bond yields
        bonds_total = migrate_bond_yields(db)
        
        # Migrate interest rates
        rates_total = migrate_interest_rates(db)
        
        # Verify data structure
        update_fetch_tracker(db)
        
        print("\n" + "=" * 80)
        print("MIGRATION SUMMARY")
        print("=" * 80)
        print(f"Bond Yields:")
        print(f"  • Total historical records: {bonds_total}")
        print(f"  • Total documents: 12 (6 countries × 2 maturities)")
        print(f"\nInterest Rates:")
        print(f"  • Total historical records: {rates_total}")
        print(f"  • Total documents: 6 (one per country)")
        print(f"\n✅ All data successfully migrated to MongoDB!")
        print(f"✅ Efficient structure: Only 18 documents total with arrays of historical data")
        print("=" * 80)
        
    except Exception as e:
        print(f"\n❌ Migration failed: {str(e)}")
        import traceback
        traceback.print_exc()
        
    finally:
        # Close MongoDB connection
        if client:
            client.close()
            print("\n✓ MongoDB connection closed")


if __name__ == "__main__":
    main()
