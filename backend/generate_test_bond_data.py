import json
import os
from datetime import datetime, timedelta
import random

# Define bond data configuration
bond_configs = {
    'us-10and2y.json': {
        'bonds': [
            {'symbol': 'USGG10YR:IND', 'base_yield': 4.2, 'variation': 0.3},
            {'symbol': 'USGG2YR:IND', 'base_yield': 3.8, 'variation': 0.25}
        ],
        'format': 'Symbol'  # Capital S
    },
    'australia-10y.json': {
        'bonds': [
            {'symbol': 'GACGB10:IND', 'country': 'Australia', 'base_yield': 4.3, 'variation': 0.3}
        ],
        'format': 'symbol'  # Lowercase s
    },
    'australia-2y.json': {
        'bonds': [
            {'symbol': 'GACGB2YR:IND', 'country': 'Australia', 'base_yield': 3.9, 'variation': 0.25}
        ],
        'format': 'symbol'
    },
    'canada-10y.json': {
        'bonds': [
            {'symbol': 'GCAN10YR:IND', 'country': 'Canada', 'base_yield': 3.4, 'variation': 0.3}
        ],
        'format': 'symbol'
    },
    'canada-2y.json': {
        'bonds': [
            {'symbol': 'GCAN2YR:IND', 'country': 'Canada', 'base_yield': 3.2, 'variation': 0.25}
        ],
        'format': 'symbol'
    },
    'germany-10y.json': {
        'bonds': [
            {'symbol': 'GTDEM10Y:GOV', 'country': 'Germany', 'base_yield': 2.4, 'variation': 0.3}
        ],
        'format': 'symbol'
    },
    'germany-2y.json': {
        'bonds': [
            {'symbol': 'GTDEM2Y:GOV', 'country': 'Germany', 'base_yield': 2.6, 'variation': 0.25}
        ],
        'format': 'symbol'
    },
    'japan-10y.json': {
        'bonds': [
            {'symbol': 'GJGB10:IND', 'country': 'Japan', 'base_yield': 0.8, 'variation': 0.2}
        ],
        'format': 'symbol'
    },
    'japan-2y.json': {
        'bonds': [
            {'symbol': 'GJGB2:IND', 'country': 'Japan', 'base_yield': 0.3, 'variation': 0.15}
        ],
        'format': 'symbol'
    },
    'uk-10y.json': {
        'bonds': [
            {'symbol': 'GUKG10:IND', 'country': 'UK', 'base_yield': 4.5, 'variation': 0.3}
        ],
        'format': 'symbol'
    },
    'uk-2y.json': {
        'bonds': [
            {'symbol': 'GUKG2:IND', 'country': 'UK', 'base_yield': 4.3, 'variation': 0.25}
        ],
        'format': 'symbol'
    }
}

def generate_daily_data(start_date, end_date, base_yield, variation):
    """Generate daily OHLC data for bond yields"""
    data = []
    current_date = start_date
    current_yield = base_yield
    
    while current_date <= end_date:
        # Skip weekends
        if current_date.weekday() < 5:  # Monday = 0, Friday = 4
            # Add some random walk
            current_yield += random.uniform(-variation/10, variation/10)
            current_yield = max(0.1, min(current_yield, base_yield + variation))
            
            # Generate OHLC
            daily_var = variation / 20
            open_price = round(current_yield + random.uniform(-daily_var, daily_var), 5)
            close_price = round(current_yield + random.uniform(-daily_var, daily_var), 5)
            high_price = round(max(open_price, close_price) + random.uniform(0, daily_var), 5)
            low_price = round(min(open_price, close_price) - random.uniform(0, daily_var), 5)
            
            data.append({
                'date': current_date.strftime('%d/%m/%Y'),
                'open': open_price,
                'high': high_price,
                'low': low_price,
                'close': close_price
            })
        
        current_date += timedelta(days=1)
    
    return data

def load_existing_data(file_path):
    """Load existing data from JSON file"""
    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return []

def get_existing_dates(data, format_type):
    """Extract existing dates from data"""
    dates = set()
    for item in data:
        date_key = 'Date' if format_type == 'Symbol' else 'date'
        if date_key in item:
            dates.add(item[date_key])
    return dates

def merge_and_sort_data(existing_data, new_data, config):
    """Merge new data with existing and sort by date"""
    format_type = config['format']
    
    # Get existing dates to avoid duplicates
    existing_dates = get_existing_dates(existing_data, format_type)
    
    # Process each bond in the config
    for bond_config in config['bonds']:
        symbol = bond_config['symbol']
        
        # Filter new data for dates that don't exist
        for item in new_data:
            date_str = item['date']
            if date_str not in existing_dates:
                # Create entry based on format
                if format_type == 'Symbol':
                    entry = {
                        'Symbol': symbol,
                        'Date': date_str,
                        'Open': item['open'],
                        'High': item['high'],
                        'Low': item['low'],
                        'Close': item['close']
                    }
                else:
                    entry = {
                        'country': bond_config['country'],
                        'symbol': symbol,
                        'date': date_str,
                        'open': item['open'],
                        'high': item['high'],
                        'low': item['low'],
                        'close': item['close']
                    }
                existing_data.append(entry)
    
    # Sort by date (newest first)
    date_key = 'Date' if format_type == 'Symbol' else 'date'
    existing_data.sort(key=lambda x: datetime.strptime(x[date_key], '%d/%m/%Y'), reverse=True)
    
    return existing_data

def main():
    # Define date range for test data generation
    start_date = datetime(2024, 1, 1)
    end_date = datetime(2025, 10, 30)
    
    base_path = r'e:\Interactive Brokers\frontend\public\bond'
    
    print("Generating test bond data from Jan 2024 to Oct 2025...")
    print("=" * 60)
    
    for filename, config in bond_configs.items():
        file_path = os.path.join(base_path, filename)
        
        print(f"\nProcessing: {filename}")
        
        # Load existing data
        existing_data = load_existing_data(file_path)
        print(f"  Existing records: {len(existing_data)}")
        
        # Generate new data for each bond
        for bond_config in config['bonds']:
            print(f"  Generating data for {bond_config['symbol']}...")
            new_data = generate_daily_data(
                start_date, 
                end_date, 
                bond_config['base_yield'],
                bond_config['variation']
            )
            print(f"  Generated {len(new_data)} new data points")
            
            # Merge and sort
            existing_data = merge_and_sort_data(existing_data, new_data, config)
        
        # Save updated data
        with open(file_path, 'w') as f:
            json.dump(existing_data, f, indent=2)
        
        print(f"  ✓ Saved {len(existing_data)} total records to {filename}")
    
    print("\n" + "=" * 60)
    print("Test data generation complete!")
    print("=" * 60)

if __name__ == "__main__":
    main()
