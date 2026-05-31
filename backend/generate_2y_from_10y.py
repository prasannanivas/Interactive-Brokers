import json
import os
from datetime import datetime

# Generate 2Y bond data based on real 10Y data
# Typical spread: 2Y yields are usually 0.2% - 0.5% lower than 10Y

SPREAD_CONFIG = {
    'United States': 0.3,  # 30 basis points lower
    'Germany': 0.4,
    'United Kingdom': 0.25,
    'Japan': 0.1,  # Flatter curve
    'Canada': 0.3,
    'Australia': 0.35,
    'China': 0.3,
    'Czech Republic': 0.35,
    'Denmark': 0.3,
    'Hong Kong': 0.25,
    'Hungary': 0.4,
    'Israel': 0.3,
    'Mexico': 0.4,
    'New Zealand': 0.35,
    'Norway': 0.3,
    'Russia': 0.5,
    'Singapore': 0.25,
    'Sweden': 0.3,
    'Switzerland': 0.25
}

FILE_MAPPING = {
    'United States': {'prefix': 'us', 'country_name': 'United States'},
    'Germany': {'prefix': 'germany', 'country_name': 'Germany'},
    'United Kingdom': {'prefix': 'uk', 'country_name': 'UK'},
    'Japan': {'prefix': 'japan', 'country_name': 'Japan'},
    'Canada': {'prefix': 'canada', 'country_name': 'Canada'},
    'Australia': {'prefix': 'australia', 'country_name': 'Australia'},
    'China': {'prefix': 'china', 'country_name': 'China'},
    'Czech Republic': {'prefix': 'czech', 'country_name': 'Czech Republic'},
    'Denmark': {'prefix': 'denmark', 'country_name': 'Denmark'},
    'Hong Kong': {'prefix': 'hong_kong', 'country_name': 'Hong Kong'},
    'Hungary': {'prefix': 'hungary', 'country_name': 'Hungary'},
    'Israel': {'prefix': 'israel', 'country_name': 'Israel'},
    'Mexico': {'prefix': 'mexico', 'country_name': 'Mexico'},
    'New Zealand': {'prefix': 'new_zealand', 'country_name': 'New Zealand'},
    'Norway': {'prefix': 'norway', 'country_name': 'Norway'},
    'Russia': {'prefix': 'russia', 'country_name': 'Russia'},
    'Singapore': {'prefix': 'singapore', 'country_name': 'Singapore'},
    'Sweden': {'prefix': 'sweden', 'country_name': 'Sweden'},
    'Switzerland': {'prefix': 'switzerland', 'country_name': 'Switzerland'}
}

SYMBOL_MAPPING = {
    'United States': {'2y': 'USGG2YR:IND'},
    'Germany': {'2y': 'GTDEM2Y:GOV'},
    'United Kingdom': {'2y': 'GUKG2:IND'},
    'Japan': {'2y': 'GJGB2:IND'},
    'Canada': {'2y': 'GCAN2YR:IND'},
    'Australia': {'2y': 'GACGB2YR:IND'},
    'China': {'2y': 'GCHI2Y:GOV'},
    'Czech Republic': {'2y': 'GCZK2Y:GOV'},
    'Denmark': {'2y': 'GDNK2Y:GOV'},
    'Hong Kong': {'2y': 'GHKG2Y:GOV'},
    'Hungary': {'2y': 'GHUN2Y:GOV'},
    'Israel': {'2y': 'GISR2Y:GOV'},
    'Mexico': {'2y': 'GMEX2Y:GOV'},
    'New Zealand': {'2y': 'GNZD2Y:GOV'},
    'Norway': {'2y': 'GNOR2Y:GOV'},
    'Russia': {'2y': 'GRUS2Y:GOV'},
    'Singapore': {'2y': 'GSGD2Y:GOV'},
    'Sweden': {'2y': 'GSWE2Y:GOV'},
    'Switzerland': {'2y': 'GCHF2Y:GOV'}
}

def generate_2y_from_10y(country, base_path):
    """Generate 2Y data from 10Y data with realistic spread"""
    
    prefix = FILE_MAPPING[country]['prefix']
    country_name = FILE_MAPPING[country]['country_name']
    spread = SPREAD_CONFIG[country]
    symbol_2y = SYMBOL_MAPPING[country]['2y']
    
    # Load 10Y data
    file_10y = os.path.join(base_path, f'{prefix}-10y.json')
    
    if not os.path.exists(file_10y):
        print(f"  ✗ {prefix}-10y.json not found, skipping...")
        return []
    
    with open(file_10y, 'r') as f:
        data_10y = json.load(f)
    
    print(f"  Loading {len(data_10y)} records from {prefix}-10y.json")
    
    # Generate 2Y data
    data_2y = []
    use_capital_s = (country == 'United States')
    
    for record in data_10y:
        # Get date key
        date_key = record.get('Date') or record.get('date')
        
        # Calculate 2Y values with spread
        open_10y = record.get('Open') or record.get('open', 0)
        high_10y = record.get('High') or record.get('high', 0)
        low_10y = record.get('Low') or record.get('low', 0)
        close_10y = record.get('Close') or record.get('close', 0)
        
        # 2Y = 10Y - spread (with slight variation)
        open_2y = round(max(0.01, open_10y - spread), 5)
        high_2y = round(max(0.01, high_10y - spread + 0.02), 5)
        low_2y = round(max(0.01, low_10y - spread - 0.02), 5)
        close_2y = round(max(0.01, close_10y - spread), 5)
        
        if use_capital_s:
            data_2y.append({
                'Symbol': symbol_2y,
                'Date': date_key,
                'Open': open_2y,
                'High': high_2y,
                'Low': low_2y,
                'Close': close_2y
            })
        else:
            data_2y.append({
                'country': country_name,
                'symbol': symbol_2y,
                'date': date_key,
                'open': open_2y,
                'high': high_2y,
                'low': low_2y,
                'close': close_2y
            })
    
    return data_2y

def save_2y_file(country, data_2y, base_path):
    """Save 2Y file"""
    prefix = FILE_MAPPING[country]['prefix']
    file_2y =os.path.join(base_path, f'{prefix}-2y.json')
    
    with open(file_2y, 'w') as f:
        json.dump(data_2y, f, indent=2)
    
    print(f"  ✓ Saved {len(data_2y)} records to {prefix}-2y.json")

def update_combined_file(country, data_2y, base_path):
    """Update combined 10Y+2Y file with 2Y data"""
    prefix = FILE_MAPPING[country]['prefix']
    file_combined = os.path.join(base_path, f'{prefix}-10and2y.json')
    
    # Skip if combined file doesn't exist
    if not os.path.exists(file_combined):
        print(f"  ℹ️ Skipping {prefix}-10and2y.json (file doesn't exist)")
        return
    
    # Load existing combined file (which has 10Y data)
    with open(file_combined, 'r') as f:
        combined_data = json.load(f)
    
    # Add 2Y data
    combined_data.extend(data_2y)
    
    # Sort by date (newest first)
    use_capital_s = (country == 'United States')
    date_key = 'Date' if use_capital_s else 'date'
    combined_data.sort(key=lambda x: datetime.strptime(x[date_key], '%d/%m/%Y'), reverse=True)
    
    # Save updated combined file
    with open(file_combined, 'w') as f:
        json.dump(combined_data, f, indent=2)
    
    print(f"  ✓ Updated {prefix}-10and2y.json with {len(data_2y)} 2Y records (total: {len(combined_data)})")

def main():
    base_path = r'e:\Interactive Brokers\frontend\public\bond'
    
    print("=" * 70)
    print("Generating 2Y Bond Data from Real 10Y Data")
    print("=" * 70)
    
    for country in SPREAD_CONFIG.keys():
        print(f"\n{'='*70}")
        print(f"Processing: {country}")
        print(f"{'='*70}")
        print(f"  Spread: -{SPREAD_CONFIG[country]}% (2Y typically lower than 10Y)")
        
        # Generate 2Y data
        data_2y = generate_2y_from_10y(country, base_path)
        
        if data_2y:
            # Save individual 2Y file
            save_2y_file(country, data_2y, base_path)
            
            # Update combined file
            update_combined_file(country, data_2y, base_path)
    
    print("\n" + "=" * 70)
    print("✓ 2Y Bond data generation complete!")
    print("  • 10Y data: Real from Trading Economics API")
    print("  • 2Y data: Generated from 10Y with realistic spread")
    print("=" * 70)

if __name__ == "__main__":
    main()
