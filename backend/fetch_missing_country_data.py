import requests
import json
from datetime import datetime, timedelta
import os

# API Configuration
API_KEY = 'FD7D4940DA88440:697C30A6298E4B5'
BASE_URL = 'https://api.tradingeconomics.com'

# All countries from currency pairs
COUNTRIES = {
    'United States': {'interest_file': 'united_states.json', 'bond_prefix': 'us'},
    'Canada': {'interest_file': 'canada.json', 'bond_prefix': 'canada'},
    'Japan': {'interest_file': 'japan.json', 'bond_prefix': 'japan'},
    'Euro Area': {'interest_file': 'euro_area.json', 'bond_prefix': 'germany'},
    'United Kingdom': {'interest_file': 'united_kingdom.json', 'bond_prefix': 'uk'},
    'Australia': {'interest_file': 'australia.json', 'bond_prefix': 'australia'},
    'Switzerland': {'interest_file': 'switzerland.json', 'bond_prefix': 'switzerland'},
    'Norway': {'interest_file': 'norway.json', 'bond_prefix': 'norway'},
    'Sweden': {'interest_file': 'sweden.json', 'bond_prefix': 'sweden'},
    'Denmark': {'interest_file': 'denmark.json', 'bond_prefix': 'denmark'},
    'China': {'interest_file': 'china.json', 'bond_prefix': 'china'},
    'Czech Republic': {'interest_file': 'czech_republic.json', 'bond_prefix': 'czech'},
    'Hong Kong': {'interest_file': 'hong_kong.json', 'bond_prefix': 'hong_kong'},
    'Hungary': {'interest_file': 'hungary.json', 'bond_prefix': 'hungary'},
    'Israel': {'interest_file': 'israel.json', 'bond_prefix': 'israel'},
    'Mexico': {'interest_file': 'mexico.json', 'bond_prefix': 'mexico'},
    'New Zealand': {'interest_file': 'new_zealand.json', 'bond_prefix': 'new_zealand'},
    'Russia': {'interest_file': 'russia.json', 'bond_prefix': 'russia'},
    'Singapore': {'interest_file': 'singapore.json', 'bond_prefix': 'singapore'},
}

def fetch_interest_rates(country, start_date, end_date):
    """Fetch interest rate data"""
    country_encoded = country.replace(' ', '%20')
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')
    
    url = f"{BASE_URL}/historical/country/{country_encoded}/indicator/interest%20rate"
    params = {'c': API_KEY, 'd1': start_str, 'd2': end_str}
    
    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"  ✗ Error fetching interest rates: {e}")
        return []

def fetch_bond_yields_10y(country, start_date, end_date):
    """Fetch 10Y bond yield data"""
    country_encoded = country.replace(' ', '%20')
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')
    
    # Try different indicator names
    indicators = [
        'government%20bond%2010y',
        '10-year%20bond%20yield',
        'bond%20yield'
    ]
    
    for indicator in indicators:
        url = f"{BASE_URL}/historical/country/{country_encoded}/indicator/{indicator}"
        params = {'c': API_KEY, 'd1': start_str, 'd2': end_str}
        
        try:
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
            if data and len(data) > 0:
                return data
        except:
            continue
    
    return []

def convert_to_ohlc_format(data):
    """Convert Trading Economics data to OHLC format"""
    ohlc_data = []
    for item in data:
        try:
            date_obj = datetime.fromisoformat(item['DateTime'].replace('Z', '+00:00'))
            value = item.get('Value', item.get('Close', 0))
            
            ohlc_data.append({
                'date': date_obj.strftime('%d/%m/%Y'),
                'open': value,
                'high': value,
                'low': value,
                'close': value
            })
        except:
            continue
    
    return ohlc_data

def save_interest_rate_data(country, data, output_dir):
    """Save interest rate data"""
    if not data or len(data) == 0:
        return False
    
    filename = COUNTRIES[country]['interest_file']
    filepath = os.path.join(output_dir, filename)
    
    try:
        # Format data
        formatted_data = []
        for item in data:
            formatted_data.append({
                'DateTime': item.get('DateTime', ''),
                'Value': item.get('Value', 0)
            })
        
        # Sort by date (newest first)
        formatted_data.sort(key=lambda x: x['DateTime'], reverse=True)
        
        with open(filepath, 'w') as f:
            json.dump(formatted_data, f, indent=2)
        
        print(f"  ✓ Saved {len(formatted_data)} interest rate records")
        return True
    except Exception as e:
        print(f"  ✗ Error saving: {e}")
        return False

def save_bond_data(country, data, output_dir):
    """Save 10Y bond data"""
    if not data or len(data) == 0:
        return False
    
    prefix = COUNTRIES[country]['bond_prefix']
    filepath = os.path.join(output_dir, f'{prefix}-10y.json')
    
    try:
        ohlc_data = convert_to_ohlc_format(data)
        ohlc_data.sort(key=lambda x: datetime.strptime(x['date'], '%d/%m/%Y'))
        
        with open(filepath, 'w') as f:
            json.dump(ohlc_data, f, indent=2)
        
        print(f"  ✓ Saved {len(ohlc_data)} bond 10Y records")
        return True
    except Exception as e:
        print(f"  ✗ Error saving: {e}")
        return False

def main():
    # Date range
    end_date = datetime.now()
    start_date = end_date - timedelta(days=365 * 5)  # 5 years
    
    # Output directories
    interest_rate_dir = r'e:\Interactive Brokers\frontend\public\Interest rate'
    bond_dir = r'e:\Interactive Brokers\frontend\public\bond'
    
    os.makedirs(interest_rate_dir, exist_ok=True)
    os.makedirs(bond_dir, exist_ok=True)
    
    print("=" * 80)
    print("Fetching Missing Country Data from Trading Economics API")
    print(f"Date range: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
    print("=" * 80)
    
    # Track already existing data
    existing_countries = ['United States', 'Canada', 'Japan', 'Euro Area', 'United Kingdom', 'Australia']
    
    for country in COUNTRIES:
        if country in existing_countries:
            print(f"\n✓ {country}: Data already exists, skipping")
            continue
        
        print(f"\n{'=' * 80}")
        print(f"Processing: {country}")
        print(f"{'=' * 80}")
        
        # Fetch interest rates
        print(f"\n  📊 Fetching interest rates...")
        interest_data = fetch_interest_rates(country, start_date, end_date)
        if interest_data:
            save_interest_rate_data(country, interest_data, interest_rate_dir)
        else:
            print(f"  ⚠ No interest rate data available")
        
        # Fetch bond yields
        print(f"\n  📈 Fetching 10Y bond yields...")
        bond_data = fetch_bond_yields_10y(country, start_date, end_date)
        if bond_data:
            save_bond_data(country, bond_data, bond_dir)
        else:
            print(f"  ⚠ No bond yield data available")
    
    print("\n" + "=" * 80)
    print("✓ Data fetch complete!")
    print("=" * 80)

if __name__ == '__main__':
    main()
