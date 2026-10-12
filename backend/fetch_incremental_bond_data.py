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

# Bond yield tickers on Trading Economics (verified against /markets/bond).
# Fetched by ticker from /markets/historical/{symbol} - the country "government bond 2y"
# indicator endpoint returns no data, which is why 2Y yields stopped updating.
# None = Trading Economics has no such bond for that country.
BOND_SYMBOLS = {
    'United States':  {'10y': 'USGG10YR:IND',  '2y': 'USGG2YR:IND'},
    'Canada':         {'10y': 'GCAN10YR:IND',  '2y': 'GCAN2Y:IND'},
    'Euro Area':      {'10y': 'GDBR10:IND',    '2y': 'GDBR2:IND'},     # Germany as Euro Area benchmark
    'Japan':          {'10y': 'GJGB10:IND',    '2y': 'GJGB2Y:IND'},
    'United Kingdom': {'10y': 'GUKG10:IND',    '2y': 'GUKG2:IND'},
    'Australia':      {'10y': 'GACGB10:IND',   '2y': 'GACGB2Y:IND'},
    'China':          {'10y': 'GCNY10YR:GOV',  '2y': 'GCNY2Y:GOV'},
    'Czech Republic': {'10y': 'CZGB10YR:GOV',  '2y': None},
    'Denmark':        {'10y': 'GDGB10YR:GOV',  '2y': 'GDGB2YR:GOV'},
    'Hong Kong':      {'10y': 'GHKGB10Y:GOV',  '2y': None},
    'Hungary':        {'10y': 'GHGB10YR:GOV',  '2y': None},
    'Israel':         {'10y': 'GISR10YR:GOV',  '2y': None},
    'Mexico':         {'10y': 'GMXN10YR:IND',  '2y': None},
    'New Zealand':    {'10y': 'GNZGB10:IND',   '2y': 'GNZGB2:GOV'},
    'Norway':         {'10y': 'GNOR10YR:GOV',  '2y': None},
    'Russia':         {'10y': 'RUGE10Y:GOV',   '2y': 'RUGE2Y:GOV'},
    'Singapore':      {'10y': 'MASB10Y:GOV',   '2y': 'SGPGB2:GOV'},
    'Sweden':         {'10y': 'GSGB10YR:GOV',  '2y': 'GSGB2YR:GOV'},
    'Switzerland':    {'10y': 'GSWISS10:IND',  '2y': 'GSWISS2:GOV'},
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


def fetch_bond_data_from_te(country, symbol, maturity, start_date, end_date):
    """
    Fetch daily bond yield OHLC from Trading Economics by ticker (/markets/historical/{symbol})
    
    Args:
        country: Display country name (e.g., United States)
        symbol: Trading Economics ticker (e.g., USGG2YR:IND)
        maturity: Bond maturity (10y or 2y)
        start_date: Start date (datetime object)
        end_date: End date (datetime object)
    
    Returns:
        List of records: [{date (DD/MM/YYYY), date_obj, open, high, low, close}, ...] oldest first
    """
    try:
        start_str = start_date.strftime('%Y-%m-%d')
        end_str = end_date.strftime('%Y-%m-%d')
        url = f"{TE_BASE_URL}/markets/historical/{symbol}"
        params = {
            'c': TE_API_KEY,
            'd1': start_str,
            'd2': end_str,
            'f': 'json'
        }
        
        print(f"  📡 Fetching {country} {maturity.upper()} ({symbol}) from {start_str} to {end_str}...")
        
        response = requests.get(url, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            print(f"  📦 API returned {len(data)} total records")
            
            records = []
            for item in data:
                dt = parse_date_dd_mm_yyyy(item.get('Date', ''))
                if not dt:
                    continue
                # Only include records in our requested date range
                if dt < start_date.replace(hour=0, minute=0, second=0, microsecond=0) or dt > end_date:
                    continue
                close = item.get('Close')
                if close is None:
                    continue
                records.append({
                    'date': dt.strftime('%d/%m/%Y'),
                    'date_obj': dt,
                    'open': float(item.get('Open') if item.get('Open') is not None else close),
                    'high': float(item.get('High') if item.get('High') is not None else close),
                    'low': float(item.get('Low') if item.get('Low') is not None else close),
                    'close': float(close)
                })
            
            records.sort(key=lambda r: r['date_obj'])
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
    
    for country, symbols in BOND_SYMBOLS.items():
        for maturity in ['10y', '2y']:
            symbol = symbols.get(maturity)
            if not symbol:
                continue  # Trading Economics has no such bond for this country
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
            new_records = fetch_bond_data_from_te(country, symbol, maturity, start_date, today)
            
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
                            'symbol': symbol,
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


def rebuild_bond_yields(db, maturities, apply=False):
    """
    Replace stored bond yield history with real data fetched by ticker.
    Used once to remove the synthetic 2Y series (10Y minus a fixed spread, from generate_2y_from_10y.py)
    and to refill series that stopped updating. Dry run unless apply=True.
    Countries with no such bond on Trading Economics get their (synthetic) document removed.
    """
    print("\n" + "=" * 80)
    print(f"REBUILDING BOND YIELDS ({', '.join(m.upper() for m in maturities)}) - {'APPLY' if apply else 'DRY RUN'}")
    print("=" * 80)

    bond_collection = db.bond_yields
    today = datetime.now()

    for country, symbols in BOND_SYMBOLS.items():
        for maturity in maturities:
            symbol = symbols.get(maturity)
            doc = bond_collection.find_one({'country': country, 'maturity': maturity}, {'data': 0})

            if not symbol:
                if doc:
                    print(f"\n🗑  {country} {maturity.upper()}: no such bond on Trading Economics - "
                          f"{'removing' if apply else 'would remove'} {doc.get('record_count', 0)} stored (synthetic) records")
                    if apply:
                        bond_collection.delete_one({'country': country, 'maturity': maturity})
                continue

            # Full history - Trading Economics returns at most the latest 10,000 daily records
            start_date = datetime(1980, 1, 1)

            print(f"\n📊 {country} {maturity.upper()}")
            records = fetch_bond_data_from_te(country, symbol, maturity, start_date, today)
            if not records:
                print(f"  ⚠ Nothing returned - keeping existing data")
                time.sleep(1)
                continue

            old = f"{doc.get('record_count', 0)} records, symbol {doc.get('symbol')}, last {doc.get('last_available_date')}" if doc else "none"
            print(f"  existing: {old}")
            print(f"  real:     {len(records)} records {records[0]['date']} -> {records[-1]['date']}, "
                  f"last close {records[-1]['close']}")

            if apply:
                bond_collection.replace_one(
                    {'country': country, 'maturity': maturity},
                    {
                        'country': country,
                        'symbol': symbol,
                        'maturity': maturity,
                        'last_available_date': records[-1]['date_obj'],
                        'last_updated': datetime.now(),
                        'record_count': len(records),
                        'source': 'tradingeconomics markets/historical',
                        'data': records
                    },
                    upsert=True
                )
                print(f"  ✅ Replaced")

            time.sleep(1)

    if not apply:
        print("\nDry run only - nothing was changed. Re-run with --apply to write these changes.")


def main():
    """Main incremental update function"""
    import argparse
    parser = argparse.ArgumentParser(description="Incremental bond yield and interest rate update")
    parser.add_argument('--rebuild', choices=['2y', '10y', 'all'],
                        help="Replace stored bond history with real data by ticker (dry run unless --apply)")
    parser.add_argument('--apply', action='store_true', help="Write the --rebuild changes")
    args = parser.parse_args()
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

        if args.rebuild:
            maturities = ['10y', '2y'] if args.rebuild == 'all' else [args.rebuild]
            rebuild_bond_yields(db, maturities, apply=args.apply)
            return

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
