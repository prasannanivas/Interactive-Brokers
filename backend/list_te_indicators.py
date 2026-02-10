import requests
import json

API_KEY = 'FD7D4940DA88440:697C30A6298E4B5'

countries = ['United States', 'Germany', 'United Kingdom', 'Japan', 'Canada', 'Australia']

print("Searching for bond-related indicators...")
print("=" * 100)

for country in countries:
    print(f"\n{country}:")
    print("-" * 100)
    
    # Get all indicators for the country
    url = f"https://api.tradingeconomics.com/indicators/country/{country.replace(' ', '%20')}?c={API_KEY}"
    
    try:
        response = requests.get(url, timeout=15)
        if response.status_code == 200:
            data = response.json()
            
            # Filter for bond-related indicators
            bond_indicators = [
                ind for ind in data 
                if isinstance(ind, dict) and 
                any(keyword in str(ind).lower() for keyword in ['bond', 'yield', '2y', '2 year', '10y', '10 year'])
            ]
            
            if bond_indicators:
                for ind in bond_indicators[:20]:  # Show first 20
                    category = ind.get('Category', 'N/A')
                    title = ind.get('Title', 'N/A')
                    print(f"  • {category:40} | {title}")
            else:
                print("  No bond indicators found")
        else:
            print(f"  Error {response.status_code}: {response.text[:100]}")
            
    except Exception as e:
        print(f"  Error: {str(e)}")

print("\n" + "=" * 100)
