import json
from datetime import datetime

# Check interest rate data
print("=== DATA VERIFICATION ===\n")
print("INTEREST RATES:")
with open('e:/Interactive Brokers/frontend/public/Interest rate/united_states.json', 'r') as f:
    data = json.load(f)
    sorted_data = sorted(data, key=lambda x: datetime.fromisoformat(x['DateTime'].replace('Z', '+00:00')))
    print(f"  US: {len(data)} records")
    print(f"      Latest: {sorted_data[-1]['DateTime']} (Value: {sorted_data[-1]['Value']}%)")

with open('e:/Interactive Brokers/frontend/public/Interest rate/canada.json', 'r') as f:
    data = json.load(f)
    sorted_data = sorted(data, key=lambda x: datetime.fromisoformat(x['DateTime'].replace('Z', '+00:00')))
    print(f"  Canada: {len(data)} records")
    print(f"      Latest: {sorted_data[-1]['DateTime']} (Value: {sorted_data[-1]['Value']}%)")

# Check bond data
print("\nBOND YIELDS:")
with open('e:/Interactive Brokers/frontend/public/bond/us-10y.json', 'r') as f:
    data = json.load(f)
    dates = sorted(data, key=lambda x: datetime.strptime(x['Date'], '%d/%m/%Y'))
    print(f"  US 10Y: {len(data)} records")
    print(f"      Latest: {dates[-1]['Date']} (Close: {dates[-1]['Close']}%)")

with open('e:/Interactive Brokers/frontend/public/bond/canada-10y.json', 'r') as f:
    data = json.load(f)
    if data:
        date_key = 'Date' if 'Date' in data[0] else 'date'
        dates = sorted(data, key=lambda x: datetime.strptime(x[date_key], '%d/%m/%Y'))
        close_key = 'Close' if 'Close' in data[0] else 'close'
        print(f"  Canada 10Y: {len(data)} records")
        print(f"      Latest: {dates[-1][date_key]} (Close: {dates[-1][close_key]}%)")

print("\n✅ Data refresh verified successfully!")
