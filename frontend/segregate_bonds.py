import json
import os

# Define the bond data files and their corresponding symbols
bond_files = {
    'us': {
        'file': 'public/bond/us-10and2y.json',
        '10y_symbol': 'USGG10YR:IND',
        '2y_symbol': 'USGG2YR:IND',
        'country': 'United States'
    },
    'uk': {
        'file': 'public/bond/uk-10and2y.json',
        '10y_symbol': 'GUKG10:IND',
        '2y_symbol': 'GUKG2:IND',
        'country': 'United Kingdom'
    },
    'japan': {
        'file': 'public/bond/japan-10and2y.json',
        '10y_symbol': 'GJGB10:IND',
        '2y_symbol': 'GJGB2Y:IND',
        'country': 'Japan'
    },
    'canada': {
        'file': 'public/bond/canada-10and2y.json',
        '10y_symbol': 'GCAN10YR:IND',
        '2y_symbol': 'GCAN2YR:IND',
        'country': 'Canada'
    },
    'germany': {
        'file': 'public/bond/germany-10and2y.json',
        '10y_symbol': 'GDBR10:IND',
        '2y_symbol': 'GDBR2:IND',
        'country': 'Germany'
    },
    'australia': {
        'file': 'public/bond/aus-10and2y.json',
        '10y_symbol': 'GACGB10:IND',
        '2y_symbol': 'GACGB2Y:IND',
        'country': 'Australia'
    }
}

def segregate_bonds():
    """Segregate bond data into separate 10Y and 2Y files for each country"""
    
    for country_code, info in bond_files.items():
        print(f"Processing {info['country']}...")
        
        # Read the combined file
        try:
            with open(info['file'], 'r') as f:
                data = json.load(f)
        except FileNotFoundError:
            print(f"  Warning: {info['file']} not found, skipping...")
            continue
        
        # Separate 10Y and 2Y data
        bond_10y = []
        bond_2y = []
        
        for record in data:
            if record['Symbol'] == info['10y_symbol']:
                bond_10y.append({
                    'country': info['country'],
                    'symbol': record['Symbol'],
                    'date': record['Date'],
                    'open': record['Open'],
                    'high': record['High'],
                    'low': record['Low'],
                    'close': record['Close']
                })
            elif record['Symbol'] == info['2y_symbol']:
                bond_2y.append({
                    'country': info['country'],
                    'symbol': record['Symbol'],
                    'date': record['Date'],
                    'open': record['Open'],
                    'high': record['High'],
                    'low': record['Low'],
                    'close': record['Close']
                })
        
        # Sort by date (most recent first)
        bond_10y.sort(key=lambda x: x['date'], reverse=True)
        bond_2y.sort(key=lambda x: x['date'], reverse=True)
        
        # Create output files
        output_10y = f'public/bond/{country_code}-10y.json'
        output_2y = f'public/bond/{country_code}-2y.json'
        
        # Write 10Y bond data
        with open(output_10y, 'w') as f:
            json.dump(bond_10y, f, indent=2)
        print(f"  ✓ Created {output_10y} with {len(bond_10y)} records")
        
        # Write 2Y bond data
        with open(output_2y, 'w') as f:
            json.dump(bond_2y, f, indent=2)
        print(f"  ✓ Created {output_2y} with {len(bond_2y)} records")
    
    print("\n✅ Bond segregation complete!")

if __name__ == '__main__':
    segregate_bonds()
