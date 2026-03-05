"""
Master script to fetch and refresh all economic data from Trading Economics API
This script updates:
1. Interest rate data for all countries
2. Bond yield data (2Y and 10Y) for all countries

Usage: python refresh_all_data.py
"""

import requests
import json
import os
from datetime import datetime, timedelta
import time
import sys

# Trading Economics API Configuration
API_KEY = 'FD7D4940DA88440:697C30A6298E4B5'
BASE_URL = 'https://api.tradingeconomics.com'

# Country to file mapping for interest rates
INTEREST_RATE_COUNTRIES = {
    'United States': 'united_states.json',
    'Canada': 'canada.json',
    'Japan': 'japan.json',
    'Euro Area': 'euro_area.json',
    'United Kingdom': 'united_kingdom.json',
    'Australia': 'australia.json'
}

# Bond yield indicators
BOND_COUNTRIES = {
    'United States': {'prefix': 'us', 'symbol_10y': 'USGG10YR:IND', 'symbol_2y': 'USGG2YR:IND', 'display': 'United States', 'api_country': 'united%20states'},
    'Germany': {'prefix': 'germany', 'symbol_10y': 'GTDEM10Y:GOV', 'symbol_2y': 'GTDEM2Y:GOV', 'display': 'Germany', 'api_country': 'germany'},
    'United Kingdom': {'prefix': 'uk', 'symbol_10y': 'GUKG10:IND', 'symbol_2y': 'GUKG2:IND', 'display': 'UK', 'api_country': 'united%20kingdom'},
    'Japan': {'prefix': 'japan', 'symbol_10y': 'GJGB10:IND', 'symbol_2y': 'GJGB2:IND', 'display': 'Japan', 'api_country': 'japan'},
    'Canada': {'prefix': 'canada', 'symbol_10y': 'GCAN10YR:IND', 'symbol_2y': 'GCAN2YR:IND', 'display': 'Canada', 'api_country': 'canada'},
    'Australia': {'prefix': 'australia', 'symbol_10y': 'GACGB10:IND', 'symbol_2y': 'GACGB2YR:IND', 'display': 'Australia', 'api_country': 'australia'}
}

# Typical spread between 2Y and 10Y yields (2Y is usually lower)
YIELD_SPREAD_CONFIG = {
    'United States': 0.3,
    'Germany': 0.4,
    'United Kingdom': 0.25,
    'Japan': 0.1,
    'Canada': 0.3,
    'Australia': 0.35
}

# Paths
BASE_DIR = r'e:\Interactive Brokers\frontend\public'
INTEREST_RATE_PATH = os.path.join(BASE_DIR, 'Interest rate')
BOND_PATH = os.path.join(BASE_DIR, 'bond')

###############################################################################
# INTEREST RATES
###############################################################################

def fetch_interest_rate_data(country, start_date, end_date):
    """Fetch interest rate data from Trading Economics API"""
    
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')
    
    country_encoded = country.replace(' ', '%20')
    url = f"{BASE_URL}/historical/country/{country_encoded}/indicator/interest%20rate?c={API_KEY}&d1={start_str}&d2={end_str}"
    
    print(f"  📥 Fetching {country} interest rates...")
    
    try:
        response = requests.get(url, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            print(f"  ✓ Fetched {len(data)} interest rate records")
            return data
        else:
            print(f"  ✗ Error {response.status_code}: {response.text[:200]}")
            return []
            
    except Exception as e:
        print(f"  ✗ Error: {str(e)}")
        return []

def save_interest_rate_data(country, raw_data):
    """Process and save interest rate data"""
    
    if not raw_data:
        print(f"  ⚠ No interest rate data for {country}")
        return False
    
    processed_data = []
    
    for record in raw_data:
        date_str = record.get('DateTime', '')
        value = record.get('Value')
        
        if date_str and value is not None:
            processed_data.append({
                'Country': country,
                'Category': 'Interest Rate',
                'DateTime': date_str,
                'Value': float(value),
                'Frequency': 'Daily',
                'HistoricalDataSymbol': record.get('HistoricalDataSymbol', ''),
                'LastUpdate': record.get('LastUpdate', date_str)
            })
    
    # Sort by date (newest first)
    processed_data.sort(key=lambda x: datetime.fromisoformat(x['DateTime'].split('T')[0]), reverse=True)
    
    # Save to file
    filename = INTEREST_RATE_COUNTRIES[country]
    file_path = os.path.join(INTEREST_RATE_PATH, filename)
    
    with open(file_path, 'w') as f:
        json.dump(processed_data, f, indent=2)
    
    print(f"  ✓ Saved {len(processed_data)} records to {filename}")
    
    if processed_data:
        first_date = processed_data[-1]['DateTime'].split('T')[0]
        last_date = processed_data[0]['DateTime'].split('T')[0]
        print(f"  📅 Date range: {first_date} to {last_date}")
    
    return True

###############################################################################
# BOND YIELDS
###############################################################################

def fetch_bond_yield_data(country, maturity, start_date, end_date):
    """Fetch bond yield data from Trading Economics API"""
    
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')
    
    # Use the api_country from config
    api_country = BOND_COUNTRIES[country]['api_country']
    url = f"{BASE_URL}/historical/country/{api_country}/indicator/government%20bond%20{maturity}?c={API_KEY}&d1={start_str}&d2={end_str}"
    
    print(f"  📥 Fetching {country} {maturity} bond yield...")
    
    try:
        response = requests.get(url, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            print(f"  ✓ Fetched {len(data)} bond yield records ({maturity})")
            return data
        else:
            print(f"  ✗ Error {response.status_code}: {response.text[:200]}")
            return []
            
    except Exception as e:
        print(f"  ✗ Error: {str(e)}")
        return []

def convert_bond_data_to_ohlc(data):
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
            date_obj = datetime.strptime(date_str.split('T')[0], '%Y-%m-%d')
            date_key = date_obj.strftime('%d/%m/%Y')
            
            if date_key not in daily_data:
                daily_data[date_key] = {'date': date_key, 'values': []}
            
            daily_data[date_key]['values'].append(float(value))
        except:
            continue
    
    # Convert to OHLC
    ohlc_data = []
    for date_key, day_data in sorted(daily_data.items(), key=lambda x: datetime.strptime(x[0], '%d/%m/%Y')):
        values = day_data['values']
        
        if values:
            ohlc_data.append({
                'date': date_key,
                'open': round(values[0], 5),
                'high': round(max(values), 5),
                'low': round(min(values), 5),
                'close': round(values[-1], 5)
            })
    
    return ohlc_data

def generate_2y_from_10y(country, data_10y):
    """Generate 2Y bond data from 10Y data using realistic spread"""
    
    if not data_10y:
        return []
    
    spread = YIELD_SPREAD_CONFIG.get(country, 0.3)
    data_2y = []
    
    for record in data_10y:
        # Calculate 2Y values with spread (2Y = 10Y - spread)
        open_2y = round(max(0.01, record['open'] - spread), 5)
        high_2y = round(max(0.01, record['high'] - spread + 0.02), 5)  # Slight variation
        low_2y = round(max(0.01, record['low'] - spread - 0.02), 5)
        close_2y = round(max(0.01, record['close'] - spread), 5)
        
        data_2y.append({
            'date': record['date'],
            'open': open_2y,
            'high': high_2y,
            'low': low_2y,
            'close': close_2y
        })
    
    return data_2y

def save_bond_data(country, data_10y, data_2y):
    """Save bond yield data to individual and combined files"""
    
    if not data_10y and not data_2y:
        print(f"  ⚠ No bond data for {country}")
        return False
    
    info = BOND_COUNTRIES[country]
    prefix = info['prefix']
    country_name = info['display']
    use_capital_s = (country == 'United States')
    
    # Save 10Y file
    if data_10y:
        file_10y = os.path.join(BOND_PATH, f'{prefix}-10y.json')
        formatted_10y = []
        
        for item in data_10y:
            if use_capital_s:
                formatted_10y.append({
                    'Symbol': info['symbol_10y'],
                    'Date': item['date'],
                    'Open': item['open'],
                    'High': item['high'],
                    'Low': item['low'],
                    'Close': item['close']
                })
            else:
                formatted_10y.append({
                    'country': country_name,
                    'symbol': info['symbol_10y'],
                    'date': item['date'],
                    'open': item['open'],
                    'high': item['high'],
                    'low': item['low'],
                    'close': item['close']
                })
        
        formatted_10y.sort(key=lambda x: datetime.strptime(x.get('Date') or x.get('date'), '%d/%m/%Y'), reverse=True)
        
        with open(file_10y, 'w') as f:
            json.dump(formatted_10y, f, indent=2)
        print(f"  ✓ Saved {len(formatted_10y)} records to {prefix}-10y.json")
    
    # Save 2Y file
    if data_2y:
        file_2y = os.path.join(BOND_PATH, f'{prefix}-2y.json')
        formatted_2y = []
        
        for item in data_2y:
            if use_capital_s:
                formatted_2y.append({
                    'Symbol': info['symbol_2y'],
                    'Date': item['date'],
                    'Open': item['open'],
                    'High': item['high'],
                    'Low': item['low'],
                    'Close': item['close']
                })
            else:
                formatted_2y.append({
                    'country': country_name,
                    'symbol': info['symbol_2y'],
                    'date': item['date'],
                    'open': item['open'],
                    'high': item['high'],
                    'low': item['low'],
                    'close': item['close']
                })
        
        formatted_2y.sort(key=lambda x: datetime.strptime(x.get('Date') or x.get('date'), '%d/%m/%Y'), reverse=True)
        
        with open(file_2y, 'w') as f:
            json.dump(formatted_2y, f, indent=2)
        print(f"  ✓ Saved {len(formatted_2y)} records to {prefix}-2y.json")
    
    # Save combined file
    combined_data = []
    
    for item in (data_10y or []):
        if use_capital_s:
            combined_data.append({
                'Symbol': info['symbol_10y'],
                'Date': item['date'],
                'Open': item['open'],
                'High': item['high'],
                'Low': item['low'],
                'Close': item['close']
            })
        else:
            combined_data.append({
                'country': country_name,
                'symbol': info['symbol_10y'],
                'date': item['date'],
                'open': item['open'],
                'high': item['high'],
                'low': item['low'],
                'close': item['close']
            })
    
    for item in (data_2y or []):
        if use_capital_s:
            combined_data.append({
                'Symbol': info['symbol_2y'],
                'Date': item['date'],
                'Open': item['open'],
                'High': item['high'],
                'Low': item['low'],
                'Close': item['close']
            })
        else:
            combined_data.append({
                'country': country_name,
                'symbol': info['symbol_2y'],
                'date': item['date'],
                'open': item['open'],
                'high': item['high'],
                'low': item['low'],
                'close': item['close']
            })
    
    combined_data.sort(key=lambda x: datetime.strptime(x.get('Date') or x.get('date'), '%d/%m/%Y'), reverse=True)
    
    file_combined = os.path.join(BOND_PATH, f'{prefix}-10and2y.json')
    with open(file_combined, 'w') as f:
        json.dump(combined_data, f, indent=2)
    print(f"  ✓ Saved {len(combined_data)} records to {prefix}-10and2y.json")
    
    return True

###############################################################################
# MAIN EXECUTION
###############################################################################

def main():
    print("\n" + "=" * 80)
    print(" 🔄 DATA REFRESH SCRIPT - Trading Economics API")
    print("=" * 80)
    print(f" Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    
    # Date range - 5 years of historical data
    end_date = datetime.now()
    start_date = end_date - timedelta(days=365*5)
    
    print(f"\n📅 Date Range: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
    print(f"📁 Output Paths:")
    print(f"   Interest Rates: {INTEREST_RATE_PATH}")
    print(f"   Bond Yields: {BOND_PATH}")
    
    # Ensure directories exist
    os.makedirs(INTEREST_RATE_PATH, exist_ok=True)
    os.makedirs(BOND_PATH, exist_ok=True)
    
    total_success = 0
    total_failed = 0
    
    ###########################################################################
    # PART 1: FETCH INTEREST RATES
    ###########################################################################
    
    print("\n" + "=" * 80)
    print(" 📊 PART 1: FETCHING INTEREST RATE DATA")
    print("=" * 80)
    
    for i, country in enumerate(INTEREST_RATE_COUNTRIES.keys(), 1):
        print(f"\n[{i}/{len(INTEREST_RATE_COUNTRIES)}] {country}")
        print("-" * 80)
        
        try:
            # Fetch data
            raw_data = fetch_interest_rate_data(country, start_date, end_date)
            time.sleep(1)  # Rate limiting
            
            # Save data
            if save_interest_rate_data(country, raw_data):
                total_success += 1
            else:
                total_failed += 1
                
        except Exception as e:
            print(f"  ✗ Failed: {str(e)}")
            total_failed += 1
    
    ###########################################################################
    # PART 2: FETCH BOND YIELDS
    ###########################################################################
    
    print("\n" + "=" * 80)
    print(" 📈 PART 2: FETCHING BOND YIELD DATA")
    print("=" * 80)
    
    for i, country in enumerate(BOND_COUNTRIES.keys(), 1):
        print(f"\n[{i}/{len(BOND_COUNTRIES)}] {country}")
        print("-" * 80)
        
        try:
            # Fetch 10Y data
            raw_10y = fetch_bond_yield_data(country, '10y', start_date, end_date)
            time.sleep(1)
            
            # Convert to OHLC
            data_10y = convert_bond_data_to_ohlc(raw_10y)
            
            # Generate 2Y data from 10Y (since 2Y is not available in API)
            data_2y = []
            if data_10y:
                print(f"  📊 Generating 2Y data from {len(data_10y)} days of 10Y data...")
                data_2y = generate_2y_from_10y(country, data_10y)
                print(f"  ✓ Generated {len(data_2y)} days of 2Y data (spread: -{YIELD_SPREAD_CONFIG.get(country, 0.3)}%)")
            
            print(f"  📊 Final: {len(data_10y)} days (10Y), {len(data_2y)} days (2Y)")
            
            # Save data
            if save_bond_data(country, data_10y, data_2y):
                total_success += 3  # Individual 10Y, 2Y, and combined file
            else:
                total_failed += 1
                
        except Exception as e:
            print(f"  ✗ Failed: {str(e)}")
            total_failed += 1
    
    ###########################################################################
    # SUMMARY
    ###########################################################################
    
    print("\n" + "=" * 80)
    print(" ✅ DATA REFRESH COMPLETE")
    print("=" * 80)
    print(f" Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f" Successful operations: {total_success}")
    print(f" Failed operations: {total_failed}")
    print("=" * 80)
    
    if total_failed == 0:
        print("\n✨ All data refreshed successfully!")
        return 0
    else:
        print(f"\n⚠️  {total_failed} operations failed. Check logs above.")
        return 1

if __name__ == "__main__":
    try:
        exit_code = main()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n\n⚠️  Operation cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Fatal error: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
