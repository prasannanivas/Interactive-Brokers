"""
Test Trading Economics API to check if data has gaps or is continuous
"""
import requests
from datetime import datetime, timedelta
import json

API_KEY = 'FD7D4940DA88440:697C30A6298E4B5'
BASE_URL = 'https://api.tradingeconomics.com'

# Test recent 60 days
end_date = datetime.now()
start_date = end_date - timedelta(days=60)

print("=" * 80)
print("TESTING API DATA GAPS")
print("=" * 80)
print(f"Date range: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
print()

# Test 1: Interest Rate (policy rate)
print("\n" + "=" * 80)
print("TEST 1: US Interest Rate (Federal Funds Rate)")
print("=" * 80)

url = f"{BASE_URL}/historical/country/united%20states/indicator/interest%20rate?c={API_KEY}&d1={start_date.strftime('%Y-%m-%d')}&d2={end_date.strftime('%Y-%m-%d')}"
print(f"URL: {url[:120]}...")

try:
    response = requests.get(url, timeout=30)
    if response.status_code == 200:
        data = response.json()
        print(f"\nOK Received {len(data)} records")
        
        if data:
            print("\nAll records:")
            for i, record in enumerate(data):
                date = record.get('DateTime', '').split('T')[0]
                value = record.get('Value')
                print(f"  {i+1}. {date}: {value}%")
            
            # Calculate gaps
            if len(data) > 1:
                print("\nGaps between records:")
                dates = [datetime.strptime(r['DateTime'].split('T')[0], '%Y-%m-%d') for r in data]
                dates.sort()
                
                for i in range(len(dates)-1):
                    gap = (dates[i+1] - dates[i]).days
                    print(f"  {dates[i].strftime('%Y-%m-%d')} to {dates[i+1].strftime('%Y-%m-%d')}: {gap} days")
    else:
        print(f"ERROR Error {response.status_code}: {response.text[:200]}")
except Exception as e:
    print(f"ERROR: {str(e)}")

# Test 2: Bond Yield (market rate - should be daily)
print("\n" + "=" * 80)
print("TEST 2: US 10Y Bond Yield (Market Rate)")
print("=" * 80)

url = f"{BASE_URL}/historical/country/united%20states/indicator/government%20bond%2010y?c={API_KEY}&d1={start_date.strftime('%Y-%m-%d')}&d2={end_date.strftime('%Y-%m-%d')}"
print(f"URL: {url[:120]}...")

try:
    response = requests.get(url, timeout=30)
    if response.status_code == 200:
        data = response.json()
        print(f"\nOK Received {len(data)} records")
        
        if data:
            print("\nFirst 10 records:")
            for i, record in enumerate(data[:10]):
                date = record.get('DateTime', '').split('T')[0]
                value = record.get('Value')
                print(f"  {i+1}. {date}: {value}%")
            
            print(f"\nLast 5 records:")
            for i, record in enumerate(data[-5:]):
                date = record.get('DateTime', '').split('T')[0]
                value = record.get('Value')
                print(f"  {date}: {value}%")
            
            # Check for missing days
            dates = [datetime.strptime(r['DateTime'].split('T')[0], '%Y-%m-%d') for r in data]
            dates.sort()
            
            missing_days = []
            for i in range(len(dates)-1):
                gap = (dates[i+1] - dates[i]).days
                if gap > 1:
                    # Check if it's just weekends
                    if gap > 3:  # More than weekend
                        missing_days.append((dates[i], dates[i+1], gap))
            
            if missing_days:
                print(f"\nGaps > 3 days found:")
                for d1, d2, gap in missing_days[:10]:
                    print(f"  {d1.strftime('%Y-%m-%d')} to {d2.strftime('%Y-%m-%d')}: {gap} days")
            else:
                print("\nOK No unusual gaps (weekends are normal)")
    else:
        print(f"ERROR Error {response.status_code}: {response.text[:200]}")
except Exception as e:
    print(f"ERROR: {str(e)}")

print("\n" + "=" * 80)
print("CONCLUSION:")
print("=" * 80)
print("- Interest Rates: Only change at central bank meetings (gaps are normal)")
print("- Bond Yields: Updated daily except weekends/holidays (should be continuous)")
print("=" * 80)
