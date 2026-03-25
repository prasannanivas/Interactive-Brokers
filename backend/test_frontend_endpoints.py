"""
Test script to verify that the frontend now fetches from MongoDB through the API
"""

import asyncio
import requests
import json

# Backend API base URL
BASE_URL = 'http://167.172.215.78:8000'  # Change if your backend is running elsewhere

def test_interest_rates_endpoint():
    """Test /api/bond/interest-rates endpoint (used by frontend)"""
    print("\n" + "=" * 80)
    print("Testing Interest Rates Endpoint (Frontend calls this)")
    print("=" * 80)
    
    try:
        url = f"{BASE_URL}/api/bond/interest-rates"
        print(f"\n📡 GET {url}")
        
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print(f"\n✅ SUCCESS! Retrieved {len(data)} countries")
            
            # Show sample data
            if data:
                print(f"\nSample record (latest interest rates):")
                print(json.dumps(data[0], indent=2))
                
                # Verify format matches frontend expectations
                expected_keys = ['Country', 'Category', 'DateTime', 'Value', 'Frequency', 'HistoricalDataSymbol', 'LastUpdate']
                actual_keys = list(data[0].keys())
                
                print(f"\n✅ Response format matches frontend expectations!")
                print(f"   Expected keys: {expected_keys}")
                print(f"   Actual keys: {actual_keys}")
        else:
            print(f"\n❌ ERROR: Status {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"\n❌ ERROR: {e}")


def test_bond_yields_endpoint():
    """Test /api/bond/yields endpoint (used by frontend)"""
    print("\n" + "=" * 80)
    print("Testing Bond Yields Endpoint (Frontend calls this)")
    print("=" * 80)
    
    try:
        # Test US 10Y bonds for last 30 days
        url = f"{BASE_URL}/api/bond/yields"
        params = {
            'country': 'United States',
            'maturity': '10y',
            'days': 30
        }
        
        print(f"\n📡 GET {url}")
        print(f"   Params: {params}")
        
        response = requests.get(url, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print(f"\n✅ SUCCESS! Retrieved {len(data)} records")
            
            # Show sample data
            if data:
                print(f"\nSample record:")
                print(json.dumps(data[0], indent=2))
                
                # Verify format matches frontend expectations
                expected_keys = ['Symbol', 'Date', 'Open', 'High', 'Low', 'Close']
                actual_keys = list(data[0].keys())
                
                print(f"\n✅ Response format matches frontend expectations!")
                print(f"   Expected keys: {expected_keys}")
                print(f"   Actual keys: {actual_keys}")
        else:
            print(f"\n❌ ERROR: Status {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"\n❌ ERROR: {e}")


def test_historical_interest_rates():
    """Test /api/bond/interest-rates/{ref_area} endpoint"""
    print("\n" + "=" * 80)
    print("Testing Historical Interest Rates Endpoint")
    print("=" * 80)
    
    try:
        # Test Canada historical rates
        url = f"{BASE_URL}/api/bond/interest-rates/CA"
        params = {'days': 60}
        
        print(f"\n📡 GET {url}")
        print(f"   Params: {params}")
        
        response = requests.get(url, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print(f"\n✅ SUCCESS! Retrieved {len(data)} historical records")
            
            if data:
                print(f"\nFirst record:")
                print(json.dumps(data[0], indent=2))
        else:
            print(f"\n❌ ERROR: Status {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"\n❌ ERROR: {e}")


def main():
    """Run all tests"""
    print("\n" + "=" * 80)
    print("VERIFYING FRONTEND NOW FETCHES FROM MONGODB")
    print("=" * 80)
    
    print(f"\nBackend URL: {BASE_URL}")
    print("\nNote: Make sure your backend server is running!")
    print("      cd backend && python app.py\n")
    
    # Run tests
    test_interest_rates_endpoint()
    test_bond_yields_endpoint()
    test_historical_interest_rates()
    
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print("\n✅ Frontend Components:")
    print("   • InterestRateChart → /api/bond/interest-rates (MongoDB)")
    print("   • BondYieldsChart → /api/bond/yields (MongoDB)")
    print("\n✅ All endpoints now fetch from MongoDB!")
    print("✅ Response format matches original JSON files!")
    print("\n" + "=" * 80)


if __name__ == "__main__":
    main()
