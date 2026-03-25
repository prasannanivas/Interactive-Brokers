"""
Incremental Data Fetcher: Fetch only new data since last available date
Fetches bond yields and interest rates from Trading Economics API for missing dates only
"""

import os
import json
from datetime import datetime, timedelta
from pathlib import Path
from pymongo import MongoClient
from dotenv import load_dotenv
import requests
import time

# Load environment variables
load_dotenv()

# MongoDB connection
MONGODB_URL = os.getenv('MONGODB_URL', 'mongodb://localhost:27017')
MONGODB_DB_NAME = os.getenv('MONGODB_DB_NAME', 'trading_monitor')

# Trading Economics API credentials
TE_API_KEY = os.getenv('TRADING_ECONOMICS_API_KEY', 'FD7D4940DA88440:697C30A6298E4B5')
TE_BASE_URL = 'https://api.tradingeconomics.com'

# Country mappings
COUNTRIES = {
    'United States': {'api_name': 'United States', 'symbol_10y': 'USGG10YR:IND', 'symbol_2y': 'USGG2YR:IND'},
    'Canada': {'api_name': 'Canada', 'symbol_10y': 'CAGB10Y:IND', 'symbol_2y': 'CAGB2Y:IND'},
    'Euro Area': {'api_name': 'Germany', 'symbol_10y': 'GDBR10:IND', 'symbol_2y': 'GDBR2:IND'},  # API uses Germany
    'Japan': {'api_name': 'Japan', 'symbol_10y': 'GJGB10:IND', 'symbol_2y': 'GJGB2:IND'},
    'United Kingdom': {'api_name': 'United Kingdom', 'symbol_10y': 'GUKG10:IND', 'symbol_2y': 'GUKG2:IND'},
    'Australia': {'api_name': 'Australia', 'symbol_10y': 'GAGB10:IND', 'symbol_2y': 'GAGB2:IND'}
}


def parse_date_dd_mm_yyyy(date_str):
    """Parse date string in DD/MM/YYYY format"""
    try:
        return datetime.strptime(date_str, '%d/%m/%Y')
    except:
        try:
            return datetime.strptime(date_str, '%Y-%m-%d')
        except:
            return None


def parse_date_iso(date_str):
    """Parse ISO format date string"""
    try:
        return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
    except:
        try:
            return datetime.strptime(date_str[:10], '%Y-%m-%d')
        except:
            return None


def fetch_bond_data_from_te(country, api_country, maturity, start_date, end_date):
    """
    Fetch bond yield data from Trading Economics API
    
    Args:
        country: Display country name (e.g., United States)
        api_country: API country name (e.g., United States or Germany for Euro Area)
        maturity: Bond maturity (10y or 2y)
        start_date: Start date (datetime object)
        end_date: End date (datetime object)
    
    Returns:
        List of records in format: [{Date, Open, High, Low, Close}, ...]
    """
    try:
        # Format dates as YYYY-MM-DD
        start_str = start_date.strftime('%Y-%m-%d')
        end_str = end_date.strftime('%Y-%m-%d')
        
        # Construct URL using country and indicator
        country_encoded = api_country.replace(' ', '%20')
        url = f"{TE_BASE_URL}/historical/country/{country_encoded}/indicator/government%20bond%20{maturity}"
        params = {
            'c': TE_API_KEY,
            'd1': start_str,
            'd2': end_str
        }
        
        print(f"  📡 Fetching {country} {maturity.upper()} from {start_str} to {end_str}...")
        
        response = requests.get(url, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            print(f"  📦 API returned {len(data)} total records")
            
            # Transform to our format AND filter by date range
            records = []
            for item in data:
                date = item.get('DateTime', '')
                if not date:
                    continue
                
                # Parse date and convert to DD/MM/YYYY
                try:
                    dt = datetime.fromisoformat(date.split('T')[0])
                    
                    # CRITICAL: Only include records in our requested date range
                    if dt < start_date or dt > end_date:
                        continue
                    
                    date_str = dt.strftime('%d/%m/%Y')
                except:
                    continue
                
                value = float(item.get('Value', 0))
                records.append({
                    'date': date_str,
                    'date_obj': dt,
                    'open': value,
                    'high': value,
                    'low': value,
                    'close': value
                })
            
            print(f"  ✓ Filtered to {len(records)} records in date range {start_str} to {end_str}")
            return records
            
        else:
            print(f"  ⚠ API error: {response.status_code} - {response.text[:200]}")
            return []
            
    except Exception as e:
        print(f"  ❌ Error fetching {country} {maturity}: {e}")
        return []


def fetch_interest_rate_from_te(country, api_country, start_date, end_date):
    """
    Fetch interest rate data from Trading Economics API
    
    Args:
        country: Display country name (e.g., United States)
        api_country: API country name (same as display name usually)
        start_date: Start date (datetime object)
        end_date: End date (datetime object)
    
    Returns:
        List of records in format: [{date_time, date_obj, value, last_update}, ...]
    """
    try:
        # Format dates as YYYY-MM-DD
        start_str = start_date.strftime('%Y-%m-%d')
        end_str = end_date.strftime('%Y-%m-%d')
        
        # Construct URL using country and indicator
        country_encoded = api_country.replace(' ', '%20')
        url = f"{TE_BASE_URL}/historical/country/{country_encoded}/indicator/interest%20rate"
        params = {
            'c': TE_API_KEY,
            'd1': start_str,
            'd2': end_str
        }
        
        print(f"  📡 Fetching {country} interest rates from {start_str} to {end_str}...")
        
        response = requests.get(url, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            print(f"  📦 API returned {len(data)} total records")
            
            # Transform to our format AND filter by date range
            records = []
            for item in data:
                date = item.get('DateTime', '')
                if not date:
                    continue
                
                # Keep ISO format for interest rates
                try:
                    dt = datetime.fromisoformat(date.split('T')[0])
                    
                    # CRITICAL: Only include records in our requested date range
                    if dt < start_date or dt > end_date:
                        continue
                        
                except:
                    continue
                
                records.append({
                    'date_time': date,
                    'date_obj': dt,
                    'value': float(item.get('Value', 0)),
                    'last_update': date
                })
            
            print(f"  ✓ Filtered to {len(records)} records in date range {start_str} to {end_str}")
            return records
            
        else:
            print(f"  ⚠ API error: {response.status_code} - {response.text[:200]}")
            return []
            
    except Exception as e:
        print(f"  ❌ Error fetching {country} interest rates: {e}")
        return []


def update_bond_yields(db):
    """Update bond yields with incremental data"""
    print("\n" + "=" * 80)
    print("UPDATING BOND YIELDS (Incremental)")
    print("=" * 80)
    
    bond_collection = db.bond_yields
    total_new_records = 0
    
    for country, info in COUNTRIES.items():
        api_country = info['api_name']
        
        for maturity in ['10y', '2y']:
            print(f"\n📊 Checking {country} {maturity.upper()} bonds...")
            
            # Get current document
            doc = bond_collection.find_one({'country': country, 'maturity': maturity})
            
            if not doc:
                print(f"  ⚠ No existing data found, skipping...")
                continue
            
            last_date = doc.get('last_available_date')
            if not last_date:
                print(f"  ⚠ No last_available_date found, skipping...")
                continue
            
            # Calculate date range to fetch
            today = datetime.now()
            start_date = last_date + timedelta(days=1)  # Start from day after last available
            
            if start_date >= today:
                print(f"  ✓ Already up to date (last: {last_date.strftime('%d/%m/%Y')})")
                continue
            
            print(f"  📅 Last available: {last_date.strftime('%d/%m/%Y')}")
            print(f"  📅 Fetching from: {start_date.strftime('%d/%m/%Y')} to {today.strftime('%d/%m/%Y')}")
            
            # Fetch new data from Trading Economics
            new_records = fetch_bond_data_from_te(country, api_country, maturity, start_date, today)
            
            if not new_records:
                print(f"  ℹ No new data available")
                continue
            
            # Append new records to the data array
            try:
                result = bond_collection.update_one(
                    {'country': country, 'maturity': maturity},
                    {
                        '$push': {'data': {'$each': new_records}},
                        '$set': {
                            'last_available_date': max(new_records, key=lambda x: x['date_obj'])['date_obj'],
                            'last_updated': datetime.now(),
                            'record_count': doc['record_count'] + len(new_records)
                        }
                    }
                )
                
                if result.modified_count > 0:
                    total_new_records += len(new_records)
                    new_last_date = max(new_records, key=lambda x: x['date_obj'])['date_obj']
                    print(f"  ✅ Added {len(new_records)} new records")
                    print(f"  📅 New last date: {new_last_date.strftime('%d/%m/%Y')}")
                else:
                    print(f"  ⚠ Update failed")
                    
            except Exception as e:
                print(f"  ❌ Error updating: {e}")
            
            # Rate limiting - wait between requests
            time.sleep(1)
    
    print(f"\n✅ Bond yields update complete!")
    print(f"   Total new records added: {total_new_records}")
    return total_new_records


def update_interest_rates(db):
    """Update interest rates with incremental data"""
    print("\n" + "=" * 80)
    print("UPDATING INTEREST RATES (Incremental)")
    print("=" * 80)
    
    ir_collection = db.interest_rates
    total_new_records = 0
    
    for country, info in COUNTRIES.items():
        api_country = info['api_name']
        
        print(f"\n🏦 Checking {country} interest rates...")
        
        # Get current document
        doc = ir_collection.find_one({'country': country})
        
        if not doc:
            print(f"  ⚠ No existing data found, skipping...")
            continue
        
        last_date = doc.get('last_available_date')
        if not last_date:
            print(f"  ⚠ No last_available_date found, skipping...")
            continue
        
        # Calculate date range to fetch
        today = datetime.now()
        start_date = last_date + timedelta(days=1)  # Start from day after last available
        
        if start_date >= today:
            print(f"  ✓ Already up to date (last: {last_date.strftime('%Y-%m-%d')})")
            continue
        
        print(f"  📅 Last available: {last_date.strftime('%Y-%m-%d')}")
        print(f"  📅 Fetching from: {start_date.strftime('%Y-%m-%d')} to {today.strftime('%Y-%m-%d')}")
        
        # Fetch new data from Trading Economics
        new_records = fetch_interest_rate_from_te(country, api_country, start_date, today)
        
        if not new_records:
            print(f"  ℹ No new data available")
            continue
        
        # Append new records to the data array
        try:
            result = ir_collection.update_one(
                {'country': country},
                {
                    '$push': {'data': {'$each': new_records}},
                    '$set': {
                        'last_available_date': max(new_records, key=lambda x: x['date_obj'])['date_obj'],
                        'last_updated': datetime.now(),
                        'record_count': doc['record_count'] + len(new_records)
                    }
                }
            )
            
            if result.modified_count > 0:
                total_new_records += len(new_records)
                new_last_date = max(new_records, key=lambda x: x['date_obj'])['date_obj']
                print(f"  ✅ Added {len(new_records)} new records")
                print(f"  📅 New last date: {new_last_date.strftime('%Y-%m-%d')}")
            else:
                print(f"  ⚠ Update failed")
                
        except Exception as e:
            print(f"  ❌ Error updating: {e}")
        
        # Rate limiting - wait between requests
        time.sleep(1)
    
    print(f"\n✅ Interest rates update complete!")
    print(f"   Total new records added: {total_new_records}")
    return total_new_records


def main():
    """Main incremental update function"""
    print("\n" + "=" * 80)
    print("INCREMENTAL DATA UPDATE: Fetch only missing dates")
    print("=" * 80)
    print(f"Current date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    try:
        # Connect to MongoDB
        print("\n🔌 Connecting to MongoDB...")
        client = MongoClient(
            MONGODB_URL,
            serverSelectionTimeoutMS=30000,
            connectTimeoutMS=30000,
            socketTimeoutMS=30000
        )
        
        # Test connection
        client.admin.command('ping')
        print(f"✓ Connected to MongoDB")
        
        db = client[MONGODB_DB_NAME]
        
        # Update bond yields (incremental)
        bonds_added = update_bond_yields(db)
        
        # Update interest rates (incremental)
        rates_added = update_interest_rates(db)
        
        print("\n" + "=" * 80)
        print("INCREMENTAL UPDATE SUMMARY")
        print("=" * 80)
        print(f"Bond Yields:")
        print(f"  • New records added: {bonds_added}")
        print(f"\nInterest Rates:")
        print(f"  • New records added: {rates_added}")
        print(f"\n✅ Incremental update complete!")
        print(f"✅ Only fetched missing data from last available date to today")
        print("=" * 80)
        
    except Exception as e:
        print(f"\n❌ Update failed: {str(e)}")
        import traceback
        traceback.print_exc()
        
    finally:
        # Close MongoDB connection
        if 'client' in locals():
            client.close()
            print("\n✓ MongoDB connection closed")


if __name__ == "__main__":
    main()
