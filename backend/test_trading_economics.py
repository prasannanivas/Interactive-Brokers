import requests
import json

# Test Trading Economics API with guest credentials
urls = {
    'US': 'https://api.tradingeconomics.com/historical/country/united%20states/indicator/interest%20rate?c=guest:guest',
    'Euro Area': 'https://api.tradingeconomics.com/historical/country/euro%20area/indicator/interest%20rate?c=guest:guest',
    'UK': 'https://api.tradingeconomics.com/historical/country/united%20kingdom/indicator/interest%20rate?c=guest:guest',
    'Japan': 'https://api.tradingeconomics.com/historical/country/japan/indicator/interest%20rate?c=guest:guest',
    'Canada': 'https://api.tradingeconomics.com/historical/country/canada/indicator/interest%20rate?c=guest:guest',
    'Australia': 'https://api.tradingeconomics.com/historical/country/australia/indicator/interest%20rate?c=guest:guest'
}

for country, url in urls.items():
    print(f'\n{"="*60}')
    print(f'{country} - Interest Rate Historical Data')
    print(f'{"="*60}')
    
    try:
        response = requests.get(url, timeout=10)
        print(f'Status Code: {response.status_code}')
        
        if response.status_code == 200:
            data = response.json()
            print(f'Total Data Points: {len(data)}')
            
            if len(data) > 0:
                # Show first 3 and last 3 records
                print(f'\nFirst Record:')
                print(json.dumps(data[0], indent=2))
                
                print(f'\nLatest Record:')
                print(json.dumps(data[-1], indent=2))
                
                if len(data) > 5:
                    print(f'\n5 Most Recent Values:')
                    for record in data[-5:]:
                        print(f"  {record.get('DateTime', 'N/A')}: {record.get('Close', 'N/A')}%")
        else:
            print(f'Error Response: {response.text[:300]}')
            
    except Exception as e:
        print(f'Error: {str(e)}')

print(f'\n{"="*60}')
print('Test Complete')
print(f'{"="*60}')
