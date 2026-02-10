import requests
import json
import os
from datetime import datetime, timedelta
import time

# Trading Economics API Configuration
API_KEY = 'FD7D4940DA88440:697C30A6298E4B5'
BASE_URL = 'https://api.tradingeconomics.com'

# Country to file mapping
COUNTRY_FILE_MAP = {
    'United States': 'united_states.json',
    'Canada': 'canada.json',
    'Japan': 'japan.json',
    'Euro Area': 'euro_area.json',
    'United Kingdom': 'united_kingdom.json',
    'Australia': 'australia.json'
}

def fetch_interest_rate_data(country, start_date, end_date):
    """Fetch interest rate data from Trading Economics API"""
    
    # Format dates for API
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')
    
    # Construct URL for interest rate historical data
    country_encoded = country.replace(' ', '%20')
    url = f"{BASE_URL}/historical/country/{country_encoded}/indicator/interest%20rate?c={API_KEY}&d1={start_str}&d2={end_str}"
    
    print(f"\n  Fetching {country} interest rates from {start_str} to {end_str}...")
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

def process_and_save_data(country, raw_data, output_path):
    """Process and save interest rate data"""
    
    if not raw_data:
        print(f"  ⚠ No data to save for {country}")
        return
    
    # Convert to expected format
    processed_data = []
    
    for record in raw_data:
        date_str = record.get('DateTime', '')
        value = record.get('Value')
        
        if date_str and value is not None:
            # Keep the original format but ensure consistency
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
    filename = COUNTRY_FILE_MAP[country]
    file_path = os.path.join(output_path, filename)
    
    with open(file_path, 'w') as f:
        json.dump(processed_data, f, indent=2)
    
    print(f"  ✓ Saved {len(processed_data)} records to {filename}")
    
    # Show date range
    if processed_data:
        first_date = processed_data[-1]['DateTime'].split('T')[0]
        last_date = processed_data[0]['DateTime'].split('T')[0]
        print(f"  📅 Date range: {first_date} to {last_date}")

def main():
    # Date range - 5 years
    end_date = datetime.now()
    start_date = end_date - timedelta(days=365*5)
    
    output_path = r'e:\Interactive Brokers\frontend\public\Interest rate'
    
    print("=" * 80)
    print("Fetching Interest Rate Data from Trading Economics API")
    print(f"Date range: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
    print("=" * 80)
    
    for country in COUNTRY_FILE_MAP.keys():
        print(f"\n{'='*80}")
        print(f"Processing: {country}")
        print(f"{'='*80}")
        
        # Fetch data
        raw_data = fetch_interest_rate_data(country, start_date, end_date)
        time.sleep(1)  # Rate limiting
        
        # Process and save
        if raw_data:
            process_and_save_data(country, raw_data, output_path)
        else:
            print(f"  ⚠ No data received for {country}")
    
    print("\n" + "=" * 80)
    print("✓ Interest rate data fetch complete!")
    print("=" * 80)

if __name__ == "__main__":
    main()
