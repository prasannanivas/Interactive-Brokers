"""
Test Trading Economics API endpoints to find correct bond yield indicators
"""
import requests
import json
from datetime import datetime, timedelta

API_KEY = 'FD7D4940DA88440:697C30A6298E4B5'
BASE_URL = 'https://api.tradingeconomics.com'

# Test different indicator patterns
TESTS = {
    'United States 2Y': [
        'united%20states/indicator/2-year%20note%20yield',
        'united%20states/indicator/government%20bond%202y',
        'united%20states/indicator/united%20states%202y',
        'united%20states/indicator/us%202y%20bond%20yield',
    ],
    'Germany 10Y': [
        'germany/indicator/government%20bond%2010y',
        'germany/indicator/germany%2010y%20bond%20yield',
        'euro%20area/indicator/germany%2010y%20bond%20yield',
        'germany/indicator/10-year%20bond%20yield',
    ],
    'Germany 2Y': [
        'germany/indicator/government%20bond%202y',
        'germany/indicator/germany%202y%20bond%20yield',
        'euro%20area/indicator/germany%202y%20bond%20yield',
        'germany/indicator/2-year%20bond%20yield',
    ],
    'UK 2Y': [
        'united%20kingdom/indicator/government%20bond%202y',
        'united%20kingdom/indicator/2-year%20note%20yield',
        'united%20kingdom/indicator/uk%202y%20bond%20yield',
    ],
    'Japan 2Y': [
        'japan/indicator/government%20bond%202y',
        'japan/indicator/2-year%20note%20yield',
        'japan/indicator/japan%202y%20bond%20yield',
    ],
    'Canada 2Y': [
        'canada/indicator/government%20bond%202y',
        'canada/indicator/2-year%20note%20yield',
        'canada/indicator/canada%202y%20bond%20yield',
    ],
    'Australia 2Y': [
        'australia/indicator/government%20bond%202y',
        'australia/indicator/2-year%20note%20yield',
        'australia/indicator/australia%202y%20bond%20yield',
    ]
}

def test_endpoint(name, indicator_path):
    """Test a specific endpoint"""
    
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30)
    
    url = f"{BASE_URL}/historical/country/{indicator_path}?c={API_KEY}&d1={start_date.strftime('%Y-%m-%d')}&d2={end_date.strftime('%Y-%m-%d')}"
    
    try:
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            
            if isinstance(data, list) and len(data) > 0:
                return True, len(data), data[0]
            else:
                return False, 0, None
        else:
            return False, 0, None
            
    except Exception as e:
        return False, 0, None

def main():
    print("=" * 80)
    print(" TESTING BOND YIELD ENDPOINTS")
    print("=" * 80)
    
    working_endpoints = {}
    
    for name, indicators in TESTS.items():
        print(f"\n{name}:")
        print("-" * 80)
        
        found = False
        for indicator in indicators:
            success, count, sample = test_endpoint(name, indicator)
            
            if success:
                print(f"  ✅ {indicator}")
                print(f"     Records: {count}")
                print(f"     Sample: {json.dumps(sample, indent=6)}")
                working_endpoints[name] = indicator
                found = True
                break
            else:
                print(f"  ❌ {indicator}")
        
        if not found:
            print(f"  ⚠️  NO WORKING ENDPOINT FOUND")
    
    print("\n" + "=" * 80)
    print(" WORKING ENDPOINTS SUMMARY")
    print("=" * 80)
    for name, endpoint in working_endpoints.items():
        print(f"{name}: {endpoint}")
    
    print("\n" + "=" * 80)

if __name__ == "__main__":
    main()
