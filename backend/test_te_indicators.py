import requests
import json

API_KEY = 'FD7D4940DA88440:697C30A6298E4B5'

# Test different indicator names for 2Y bonds
test_cases = [
    # United States
    ('United States', '2 year bond yield'),
    ('United States', 'government bond 2y'),
    ('United States', 'us 2 year bond yield'),
    
    # Germany (for Euro Area)
    ('Germany', '2 year bond yield'),
    ('Germany', 'government bond 2y'),
    
    # UK
    ('United Kingdom', '2 year bond yield'),
    ('United Kingdom', 'government bond 2y'),
    
    # Japan
    ('Japan', '2 year bond yield'),
    ('Japan', 'government bond 2y'),
    
    # Canada
    ('Canada', '2 year bond yield'),
    ('Canada', 'government bond 2y'),
    
    # Australia
    ('Australia', '2 year bond yield'),
    ('Australia', 'government bond 2y'),
]

print("Testing 2Y Bond Indicator Names...")
print("=" * 80)

for country, indicator in test_cases:
    url = f"https://api.tradingeconomics.com/historical/country/{country.replace(' ', '%20')}/indicator/{indicator.replace(' ', '%20')}?c={API_KEY}"
    
    try:
        response = requests.get(url, timeout=10)
        count = 0
        if response.status_code == 200:
            data = response.json()
            count = len(data) if isinstance(data, list) else 0
        
        status = "✓" if count > 0 else "✗"
        print(f"{status} {country:20} | {indicator:30} | {count:6} records")
        
    except Exception as e:
        print(f"✗ {country:20} | {indicator:30} | Error: {str(e)[:40]}")

print("=" * 80)
