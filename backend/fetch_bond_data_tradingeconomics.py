import requests
import json
import os
from datetime import datetime, timedelta
import time

# Trading Economics API Configuration
API_KEY = 'FD7D4940DA88440:697C30A6298E4B5'
BASE_URL = 'https://api.tradingeconomics.com'

# Bond yield indicators for each country
# Format: {country: {maturity: indicator_name}}
BOND_INDICATORS = {
    'United States': {
        '10y': 'united states/government bond yield',
        '2y': 'united states/government bond 2y'
    },
    'Euro Area': {
        '10y': 'euro area/germany 10y bond yield',
        '2y': 'euro area/germany 2y bond yield'
    },
    'United Kingdom': {
        '10y': 'united kingdom/government bond 10y',
        '2y': 'united kingdom/government bond 2y'
    },
    'Japan': {
        '10y': 'japan/government bond 10y',
        '2y': 'japan/government bond 2y'
    },
    'Canada': {
        '10y': 'canada/government bond 10y',
        '2y': 'canada/government bond 2y'
    },
    'Australia': {
        '10y': 'australia/government bond 10y',
        '2y': 'australia/government bond 2y'
    }
}

# Symbol mappings for output files
SYMBOL_MAPPING = {
    'United States': {
        '10y': 'USGG10YR:IND',
        '2y': 'USGG2YR:IND'
    },
    'Euro Area': {
        '10y': 'GTDEM10Y:GOV',
        '2y': 'GTDEM2Y:GOV'
    },
    'United Kingdom': {
        '10y': 'GUKG10:IND',
        '2y': 'GUKG2:IND'
    },
    'Japan': {
        '10y': 'GJGB10:IND',
        '2y': 'GJGB2:IND'
    },
    'Canada': {
        '10y': 'GCAN10YR:IND',
        '2y': 'GCAN2YR:IND'
    },
    'Australia': {
        '10y': 'GACGB10:IND',
        '2y': 'GACGB2YR:IND'
    }
}

# File name mappings
FILE_MAPPING = {
    'United States': {'prefix': 'us', 'country_name': 'United States'},
    'Euro Area': {'prefix': 'germany', 'country_name': 'Germany'},
    'United Kingdom': {'prefix': 'uk', 'country_name': 'UK'},
    'Japan': {'prefix': 'japan', 'country_name': 'Japan'},
    'Canada': {'prefix': 'canada', 'country_name': 'Canada'},
    'Australia': {'prefix': 'australia', 'country_name': 'Australia'}
}

def fetch_bond_data(country, maturity, start_date, end_date):
    """Fetch bond yield data from Trading Economics API"""
    
    indicator_path = BOND_INDICATORS[country][maturity]
    
    # Format dates for API
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')
    
    # Construct URL - using historical data endpoint
    url = f"{BASE_URL}/historical/country/{country.replace(' ', '%20')}/indicator/government%20bond%20{maturity}?c={API_KEY}&d1={start_str}&d2={end_str}"
    
    print(f"  Fetching {country} {maturity} from {start_str} to {end_str}...")
    print(f"  URL: {url[:100]}...")
    
    try:
        response = requests.get(url, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            print(f"  ✓ Fetched {len(data)} records")
            return data
        else:
            print(f"  ✗ Error {response.status_code}: {response.text[:200]}")
            return []
            
    except Exception as e:
        print(f"  ✗ Error: {str(e)}")
        return []

def convert_to_ohlc_format(data, country, maturity):
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
        
        # Parse date (format: 2021-02-10T00:00:00)
        try:
            date_obj = datetime.strptime(date_str.split('T')[0], '%Y-%m-%d')
            date_key = date_obj.strftime('%d/%m/%Y')
            
            if date_key not in daily_data:
                daily_data[date_key] = {
                    'date': date_key,
                    'values': []
                }
            
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

def save_individual_files(country, data_10y, data_2y, base_path):
    """Save individual 10Y and 2Y files"""
    
    prefix = FILE_MAPPING[country]['prefix']
    country_name = FILE_MAPPING[country]['country_name']
    symbol_10y = SYMBOL_MAPPING[country]['10y']
    symbol_2y = SYMBOL_MAPPING[country]['2y']
    
    # Format for US (Symbol) vs others (symbol)
    use_capital_s = (country == 'United States')
    
    # Save 10Y file
    if data_10y:
        file_10y = os.path.join(base_path, f'{prefix}-10y.json')
        formatted_10y = []
        
        for item in data_10y:
            if use_capital_s:
                formatted_10y.append({
                    'Symbol': symbol_10y,
                    'Date': item['date'],
                    'Open': item['open'],
                    'High': item['high'],
                    'Low': item['low'],
                    'Close': item['close']
                })
            else:
                formatted_10y.append({
                    'country': country_name,
                    'symbol': symbol_10y,
                    'date': item['date'],
                    'open': item['open'],
                    'high': item['high'],
                    'low': item['low'],
                    'close': item['close']
                })
        
        # Sort newest first
        formatted_10y.sort(key=lambda x: datetime.strptime(x.get('Date') or x.get('date'), '%d/%m/%Y'), reverse=True)
        
        with open(file_10y, 'w') as f:
            json.dump(formatted_10y, f, indent=2)
        print(f"  ✓ Saved {len(formatted_10y)} records to {prefix}-10y.json")
    
    # Save 2Y file
    if data_2y:
        file_2y = os.path.join(base_path, f'{prefix}-2y.json')
        formatted_2y = []
        
        for item in data_2y:
            if use_capital_s:
                formatted_2y.append({
                    'Symbol': symbol_2y,
                    'Date': item['date'],
                    'Open': item['open'],
                    'High': item['high'],
                    'Low': item['low'],
                    'Close': item['close']
                })
            else:
                formatted_2y.append({
                    'country': country_name,
                    'symbol': symbol_2y,
                    'date': item['date'],
                    'open': item['open'],
                    'high': item['high'],
                    'low': item['low'],
                    'close': item['close']
                })
        
        # Sort newest first
        formatted_2y.sort(key=lambda x: datetime.strptime(x.get('Date') or x.get('date'), '%d/%m/%Y'), reverse=True)
        
        with open(file_2y, 'w') as f:
            json.dump(formatted_2y, f, indent=2)
        print(f"  ✓ Saved {len(formatted_2y)} records to {prefix}-2y.json")

def save_combined_file(country, data_10y, data_2y, base_path):
    """Save combined 10Y+2Y file"""
    
    prefix = FILE_MAPPING[country]['prefix']
    country_name = FILE_MAPPING[country]['country_name']
    symbol_10y = SYMBOL_MAPPING[country]['10y']
    symbol_2y = SYMBOL_MAPPING[country]['2y']
    
    use_capital_s = (country == 'United States')
    
    combined_data = []
    
    # Add 10Y data
    for item in data_10y:
        if use_capital_s:
            combined_data.append({
                'Symbol': symbol_10y,
                'Date': item['date'],
                'Open': item['open'],
                'High': item['high'],
                'Low': item['low'],
                'Close': item['close']
            })
        else:
            combined_data.append({
                'country': country_name,
                'symbol': symbol_10y,
                'date': item['date'],
                'open': item['open'],
                'high': item['high'],
                'low': item['low'],
                'close': item['close']
            })
    
    # Add 2Y data
    for item in data_2y:
        if use_capital_s:
            combined_data.append({
                'Symbol': symbol_2y,
                'Date': item['date'],
                'Open': item['open'],
                'High': item['high'],
                'Low': item['low'],
                'Close': item['close']
            })
        else:
            combined_data.append({
                'country': country_name,
                'symbol': symbol_2y,
                'date': item['date'],
                'open': item['open'],
                'high': item['high'],
                'low': item['low'],
                'close': item['close']
            })
    
    # Sort newest first
    combined_data.sort(key=lambda x: datetime.strptime(x.get('Date') or x.get('date'), '%d/%m/%Y'), reverse=True)
    
    # Save combined file
    file_combined = os.path.join(base_path, f'{prefix}-10and2y.json')
    with open(file_combined, 'w') as f:
        json.dump(combined_data, f, indent=2)
    print(f"  ✓ Saved {len(combined_data)} records to {prefix}-10and2y.json")

def main():
    # Date range - 5 years
    end_date = datetime.now()
    start_date = end_date - timedelta(days=365*5)
    
    base_path = r'e:\Interactive Brokers\frontend\public\bond'
    
    print("=" * 70)
    print("Fetching Bond Yield Data from Trading Economics API")
    print(f"Date range: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
    print("=" * 70)
    
    for country in BOND_INDICATORS.keys():
        print(f"\n{'='*70}")
        print(f"Processing: {country}")
        print(f"{'='*70}")
        
        # Fetch 10Y data
        raw_10y = fetch_bond_data(country, '10y', start_date, end_date)
        time.sleep(1)  # Rate limiting
        
        # Fetch 2Y data
        raw_2y = fetch_bond_data(country, '2y', start_date, end_date)
        time.sleep(1)  # Rate limiting
        
        # Convert to OHLC format
        data_10y = convert_to_ohlc_format(raw_10y, country, '10y')
        data_2y = convert_to_ohlc_format(raw_2y, country, '2y')
        
        print(f"\n  Converted to OHLC:")
        print(f"    10Y: {len(data_10y)} days")
        print(f"    2Y: {len(data_2y)} days")
        
        # Save files
        print(f"\n  Saving files...")
        save_individual_files(country, data_10y, data_2y, base_path)
        save_combined_file(country, data_10y, data_2y, base_path)
    
    print("\n" + "=" * 70)
    print("✓ Bond yield data fetch complete!")
    print("=" * 70)

if __name__ == "__main__":
    main()
