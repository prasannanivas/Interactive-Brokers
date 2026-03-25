"""
Incremental Bond Yield and Interest Rate Data Fetcher
This script fetches only new data (from last available date to current date) and stores it in MongoDB
"""

import asyncio
import requests
from datetime import datetime, timedelta
from database import Database, get_bond_yields_collection, get_interest_rates_collection, get_data_fetch_tracker_collection
import time


# Trading Economics API Configuration
API_KEY = 'FD7D4940DA88440:697C30A6298E4B5'
BASE_URL = 'https://api.tradingeconomics.com'

# Country configurations
COUNTRIES = {
    'United States': {
        'api_name': 'United States',
        'bond_symbols': {'10y': 'USGG10YR:IND', '2y': 'USGG2YR:IND'}
    },
    'Canada': {
        'api_name': 'Canada',
        'bond_symbols': {'10y': 'GCAN10YR:IND', '2y': 'GCAN2YR:IND'}
    },
    'Japan': {
        'api_name': 'Japan',
        'bond_symbols': {'10y': 'GJGB10:IND', '2y': 'GJGB2:IND'}
    },
    'Euro Area': {
        'api_name': 'Germany',  # API uses Germany for Euro Area
        'bond_symbols': {'10y': 'GTDEM10Y:GOV', '2y': 'GTDEM2Y:GOV'}
    },
    'United Kingdom': {
        'api_name': 'United Kingdom',
        'bond_symbols': {'10y': 'GUKG10:IND', '2y': 'GUKG2:IND'}
    },
    'Australia': {
        'api_name': 'Australia',
        'bond_symbols': {'10y': 'GACGB10:IND', '2y': 'GACGB2YR:IND'}
    }
}


def parse_date_iso(date_str: str) -> datetime:
    """Parse ISO format date (YYYY-MM-DDTHH:MM:SS)"""
    try:
        return datetime.fromisoformat(date_str.replace('Z', '+00:00').split('T')[0])
    except:
        return datetime.strptime(date_str.split('T')[0], '%Y-%m-%d')


def format_date_dd_mm_yyyy(date_obj: datetime) -> str:
    """Format date as DD/MM/YYYY"""
    return date_obj.strftime('%d/%m/%Y')


async def get_last_available_date(collection, country: str, data_type: str = None, maturity: str = None):
    """Get the last available date for a country from MongoDB"""
    query = {'country': country}
    if maturity:
        query['maturity'] = maturity
    
    latest = await collection.find_one(query, sort=[('date_obj', -1)])
    
    if latest:
        return latest['date_obj']
    else:
        # If no data exists, start from 5 years ago
        return datetime.now() - timedelta(days=365 * 5)


def fetch_bond_data_from_api(country: str, maturity: str, start_date: datetime, end_date: datetime):
    """Fetch bond yield data from Trading Economics API"""
    api_country = COUNTRIES[country]['api_name']
    
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')
    
    url = f"{BASE_URL}/historical/country/{api_country.replace(' ', '%20')}/indicator/government%20bond%20{maturity}?c={API_KEY}&d1={start_str}&d2={end_str}"
    
    print(f"  📥 Fetching {country} {maturity} from {start_str} to {end_str}...")
    
    try:
        response = requests.get(url, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            print(f"  ✓ Fetched {len(data)} new records")
            return data
        else:
            print(f"  ✗ Error {response.status_code}: {response.text[:200]}")
            return []
            
    except Exception as e:
        print(f"  ✗ Error: {str(e)}")
        return []


def fetch_interest_rate_from_api(country: str, start_date: datetime, end_date: datetime):
    """Fetch interest rate data from Trading Economics API"""
    api_country = COUNTRIES[country]['api_name']
    
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')
    
    url = f"{BASE_URL}/historical/country/{api_country.replace(' ', '%20')}/indicator/interest%20rate?c={API_KEY}&d1={start_str}&d2={end_str}"
    
    print(f"  📥 Fetching {country} interest rates from {start_str} to {end_str}...")
    
    try:
        response = requests.get(url, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            print(f"  ✓ Fetched {len(data)} new records")
            return data
        else:
            print(f"  ✗ Error {response.status_code}: {response.text[:200]}")
            return []
            
    except Exception as e:
        print(f"  ✗ Error: {str(e)}")
        return []


def convert_bond_to_ohlc(data: list, country: str, maturity: str):
    """Convert Trading Economics data to OHLC format"""
    if not data:
        return []
    
    # Group by date and create OHLC
    daily_data = {}
    
    for record in data:
        date_str = record.get('DateTime', '')
        value = record.get('Value') or record.get('Close', 0)
        
        if not date_str:
            continue
        
        try:
            date_obj = parse_date_iso(date_str)
            date_key = date_obj.strftime('%Y-%m-%d')
            
            if date_key not in daily_data:
                daily_data[date_key] = {
                    'date_obj': date_obj,
                    'values': []
                }
            
            daily_data[date_key]['values'].append(float(value))
        except:
            continue
    
    # Convert to OHLC
    ohlc_data = []
    for date_key, day_data in daily_data.items():
        values = day_data['values']
        date_obj = day_data['date_obj']
        
        ohlc_data.append({
            'date': format_date_dd_mm_yyyy(date_obj),
            'date_obj': date_obj,
            'open': values[0],
            'high': max(values),
            'low': min(values),
            'close': values[-1]
        })
    
    # Sort by date (newest first)
    ohlc_data.sort(key=lambda x: x['date_obj'], reverse=True)
    
    return ohlc_data


async def fetch_and_store_bond_yields(country: str):
    """Fetch and store bond yield data for a country"""
    bond_collection = get_bond_yields_collection()
    tracker_collection = get_data_fetch_tracker_collection()
    
    print(f"\n{'='*70}")
    print(f"Processing Bond Yields: {country}")
    print(f"{'='*70}")
    
    for maturity in ['10y', '2y']:
        print(f"\n📊 {maturity.upper()} Bonds:")
        
        # Get last available date from DB
        last_date = await get_last_available_date(bond_collection, country, maturity=maturity)
        current_date = datetime.now()
        
        # Only fetch if there's a gap (more than 1 day)
        days_gap = (current_date - last_date).days
        
        if days_gap <= 1:
            print(f"  ℹ Data is up to date (last date: {last_date.strftime('%Y-%m-%d')})")
            continue
        
        print(f"  📅 Last available: {last_date.strftime('%Y-%m-%d')}")
        print(f"  📅 Fetching gap of {days_gap} days...")
        
        # Fetch new data from API
        start_fetch = last_date + timedelta(days=1)
        raw_data = fetch_bond_data_from_api(country, maturity, start_fetch, current_date)
        time.sleep(1)  # Rate limiting
        
        if not raw_data:
            print(f"  ⚠ No new data available")
            continue
        
        # Convert to OHLC format
        ohlc_data = convert_bond_to_ohlc(raw_data, country, maturity)
        
        if not ohlc_data:
            print(f"  ⚠ No valid data after conversion")
            continue
        
        # Store in MongoDB
        symbol = COUNTRIES[country]['bond_symbols'][maturity]
        inserted = 0
        updated = 0
        
        for record in ohlc_data:
            bond_doc = {
                'country': country,
                'symbol': symbol,
                'maturity': maturity,
                'date': record['date'],
                'date_obj': record['date_obj'],
                'open': record['open'],
                'high': record['high'],
                'low': record['low'],
                'close': record['close']
            }
            
            result = await bond_collection.update_one(
                {'country': country, 'symbol': symbol, 'date': record['date'], 'maturity': maturity},
                {'$set': bond_doc},
                upsert=True
            )
            
            if result.upserted_id:
                inserted += 1
            elif result.modified_count > 0:
                updated += 1
        
        print(f"  ✓ Stored: {inserted} new, {updated} updated")
        
        # Update tracker
        total_records = await bond_collection.count_documents({'country': country, 'maturity': maturity})
        latest = await bond_collection.find_one(
            {'country': country, 'maturity': maturity},
            sort=[('date_obj', -1)]
        )
        
        if latest:
            await tracker_collection.update_one(
                {'country': country, 'data_type': f'bond_{maturity}'},
                {'$set': {
                    'country': country,
                    'data_type': f'bond_{maturity}',
                    'last_fetch_date': current_date,
                    'last_available_date': latest['date_obj'],
                    'total_records': total_records,
                    'last_updated': datetime.utcnow()
                }},
                upsert=True
            )
            print(f"  📊 Total records in DB: {total_records}")
            print(f"  📅 Latest date in DB: {latest['date']}")


async def fetch_and_store_interest_rates(country: str):
    """Fetch and store interest rate data for a country"""
    interest_rate_collection = get_interest_rates_collection()
    tracker_collection = get_data_fetch_tracker_collection()
    
    print(f"\n{'='*70}")
    print(f"Processing Interest Rates: {country}")
    print(f"{'='*70}")
    
    # Get last available date from DB
    last_date = await get_last_available_date(interest_rate_collection, country)
    current_date = datetime.now()
    
    # Only fetch if there's a gap (more than 1 day)
    days_gap = (current_date - last_date).days
    
    if days_gap <= 1:
        print(f"  ℹ Data is up to date (last date: {last_date.strftime('%Y-%m-%d')})")
        return
    
    print(f"  📅 Last available: {last_date.strftime('%Y-%m-%d')}")
    print(f"  📅 Fetching gap of {days_gap} days...")
    
    # Fetch new data from API
    start_fetch = last_date + timedelta(days=1)
    raw_data = fetch_interest_rate_from_api(country, start_fetch, current_date)
    time.sleep(1)  # Rate limiting
    
    if not raw_data:
        print(f"  ⚠ No new data available")
        return
    
    # Store in MongoDB
    inserted = 0
    updated = 0
    
    for record in raw_data:
        date_time_str = record.get('DateTime', '')
        value = record.get('Value')
        
        if not date_time_str or value is None:
            continue
        
        date_obj = parse_date_iso(date_time_str)
        
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
        
        result = await interest_rate_collection.update_one(
            {'country': country, 'date_time': date_time_str},
            {'$set': interest_doc},
            upsert=True
        )
        
        if result.upserted_id:
            inserted += 1
        elif result.modified_count > 0:
            updated += 1
    
    print(f"  ✓ Stored: {inserted} new, {updated} updated")
    
    # Update tracker
    total_records = await interest_rate_collection.count_documents({'country': country})
    latest = await interest_rate_collection.find_one(
        {'country': country},
        sort=[('date_obj', -1)]
    )
    
    if latest:
        await tracker_collection.update_one(
            {'country': country, 'data_type': 'interest_rate'},
            {'$set': {
                'country': country,
                'data_type': 'interest_rate',
                'last_fetch_date': current_date,
                'last_available_date': latest['date_obj'],
                'total_records': total_records,
                'last_updated': datetime.utcnow()
            }},
            upsert=True
        )
        print(f"  📊 Total records in DB: {total_records}")
        print(f"  📅 Latest date in DB: {latest['date_time'][:10]}")


async def main():
    """Main function to fetch all data incrementally"""
    print("\n" + "=" * 80)
    print("INCREMENTAL DATA FETCH - BOND YIELDS & INTEREST RATES")
    print("Fetching only new data from last available date to current date")
    print("=" * 80)
    
    try:
        # Connect to MongoDB
        await Database.connect_db()
        
        # Process each country
        for country in COUNTRIES.keys():
            # Fetch bond yields
            await fetch_and_store_bond_yields(country)
            
            # Fetch interest rates
            await fetch_and_store_interest_rates(country)
        
        print("\n" + "=" * 80)
        print("✅ ALL DATA FETCHED AND STORED SUCCESSFULLY!")
        print("=" * 80)
        
    except Exception as e:
        print(f"\n❌ Fetch failed: {str(e)}")
        import traceback
        traceback.print_exc()
        
    finally:
        # Close MongoDB connection
        await Database.close_db()


if __name__ == "__main__":
    asyncio.run(main())
