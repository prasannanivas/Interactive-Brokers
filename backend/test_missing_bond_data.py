"""
Test Trading Economics API for missing 2Y Bond Data
This script tests various endpoint patterns to find the correct API URLs for missing data
"""
import requests
import json
from datetime import datetime, timedelta

# Trading Economics API Configuration
API_KEY = 'FD7D4940DA88440:697C30A6298E4B5'
BASE_URL = 'https://api.tradingeconomics.com'

# Test configurations for missing data
TEST_CONFIGS = {
    'UK 2Y': [
        'united%20kingdom/indicator/government%20bond%202y',
        'united%20kingdom/indicator/2-year-note-yield',
        'united%20kingdom/indicator/uk%202y',
        'united%20kingdom/indicator/government%20bond%202-year',
    ],
    'Canada 2Y': [
        'canada/indicator/government%20bond%202y',
        'canada/indicator/2-year-note-yield',
        'canada/indicator/canada%202y',
        'canada/indicator/government%20bond%202-year',
    ],
    'Germany 2Y': [
        'germany/indicator/government%20bond%202y',
        'germany/indicator/2-year-note-yield',
        'germany/indicator/germany%202y',
        'euro%20area/indicator/germany%202y%20bond%20yield',
    ]
}

def test_endpoint(country, endpoint_path, verbose=True):
    """Test a specific endpoint pattern"""
    
    # Get data for last 3 months
    end_date = datetime.now()
    start_date = end_date - timedelta(days=90)
    
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')
    
    url = f"{BASE_URL}/historical/country/{endpoint_path}?c={API_KEY}&d1={start_str}&d2={end_str}"
    
    if verbose:
        print(f"\n{'='*80}")
        print(f"Testing: {country}")
        print(f"Endpoint: {endpoint_path}")
        print(f"URL: {url}")
        print(f"{'='*80}")
    
    try:
        response = requests.get(url, timeout=15)
        
        if response.status_code == 200:
            data = response.json()
            
            if isinstance(data, list) and len(data) > 0:
                print(f"✅ SUCCESS! Found {len(data)} records")
                print(f"\nSample data:")
                print(json.dumps(data[0], indent=2))
                if len(data) > 1:
                    print(f"...\nLatest data:")
                    print(json.dumps(data[-1], indent=2))
                return True, data
            else:
                print(f"⚠️  Empty response")
                return False, []
        else:
            print(f"❌ Error {response.status_code}")
            if verbose:
                print(f"Response: {response.text[:300]}")
            return False, []
            
    except Exception as e:
        print(f"❌ Exception: {str(e)}")
        return False, []

def main():
    print("="*80)
    print("TESTING TRADING ECONOMICS API FOR MISSING 2Y BOND DATA")
    print("="*80)
    print(f"API Key: {API_KEY}")
    print(f"Testing period: Last 90 days")
    print("="*80)
    
    results = {}
    
    for country, endpoints in TEST_CONFIGS.items():
        print(f"\n\n{'#'*80}")
        print(f"# {country}")
        print(f"{'#'*80}")
        
        success = False
        working_endpoint = None
        
        for endpoint in endpoints:
            is_success, data = test_endpoint(country, endpoint, verbose=True)
            
            if is_success:
                success = True
                working_endpoint = endpoint
                results[country] = {
                    'status': 'SUCCESS',
                    'endpoint': endpoint,
                    'url': f"{BASE_URL}/historical/country/{endpoint}",
                    'records': len(data)
                }
                print(f"\n🎉 FOUND WORKING ENDPOINT FOR {country}!")
                print(f"   Use: {endpoint}")
                break
        
        if not success:
            results[country] = {
                'status': 'FAILED',
                'endpoint': None,
                'message': 'No working endpoint found'
            }
            print(f"\n⚠️  NO WORKING ENDPOINT FOUND FOR {country}")
    
    # Print summary
    print("\n\n" + "="*80)
    print("SUMMARY REPORT")
    print("="*80)
    
    for country, result in results.items():
        print(f"\n{country}:")
        if result['status'] == 'SUCCESS':
            print(f"  ✅ Status: {result['status']}")
            print(f"  📊 Records: {result['records']}")
            print(f"  🔗 Endpoint: {result['endpoint']}")
        else:
            print(f"  ❌ Status: {result['status']}")
            print(f"  💬 Message: {result['message']}")
    
    # Save results
    with open('bond_test_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\n\n📄 Results saved to: bond_test_results.json")
    print("="*80)

if __name__ == "__main__":
    main()
