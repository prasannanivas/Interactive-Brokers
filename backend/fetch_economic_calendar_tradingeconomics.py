import requests
import json
from datetime import datetime, timedelta

# API Configuration
API_KEY = 'FD7D4940DA88440:697C30A6298E4B5'
BASE_URL = 'https://api.tradingeconomics.com'

def fetch_calendar_events():
    """
    Fetch economic calendar events from Trading Economics API
    Returns events from 1 year ago to 6 months in the future
    """
    
    # Calculate date range - focus on future events
    end_date = datetime.now() + timedelta(days=180)  # 6 months future
    start_date = datetime.now() - timedelta(days=30)  # Only last 30 days to prioritize future
    
    # Format dates as YYYY-MM-DD
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')
    
    print("=" * 80)
    print("Fetching Economic Calendar from Trading Economics API")
    print(f"Date range: {start_str} to {end_str}")
    print("=" * 80)
    
    # Fetch calendar events
    # API endpoint: /calendar/country/{countries}/{start_date}/{end_date}
    countries = ['United States', 'Euro Area', 'United Kingdom', 'Japan', 'Canada', 'Australia']
    
    all_events = []
    
    for country in countries:
        print(f"\n📅 Fetching {country} events...")
        try:
            country_encoded = country.replace(' ', '%20')
            url = f"{BASE_URL}/calendar/country/{country_encoded}/{start_str}/{end_str}"
            
            print(f"  URL: {url}?c={API_KEY[:7]}...")
            
            response = requests.get(f"{url}?c={API_KEY}")
            response.raise_for_status()
            
            events = response.json()
            
            if events:
                print(f"  ✓ Fetched {len(events)} events")
                all_events.extend(events)
            else:
                print(f"  ⚠ No events returned")
                
        except Exception as e:
            print(f"  ✗ Error: {str(e)}")
    
    return all_events

def process_calendar_data(events):
    """
    Process and format calendar events for frontend
    """
    processed_events = []
    
    for event in events:
        try:
            # Parse the date
            date_str = event.get('Date', event.get('DateTime', ''))
            if not date_str:
                continue
            
            # Parse datetime
            event_date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            
            # Determine if it's a future event
            is_future = event_date > datetime.now()
            
            # Extract event details
            processed_event = {
                'country': event.get('Country', ''),
                'event': event.get('Event', event.get('Category', '')),
                'date': event_date.strftime('%Y-%m-%d'),
                'time': event_date.strftime('%H:%M EST'),
                'importance': event.get('Importance', 'Medium'),
                'actual': None if is_future else event.get('Actual'),
                'forecast': event.get('Forecast'),
                'previous': event.get('Previous'),
                'is_future_event': is_future
            }
            
            processed_events.append(processed_event)
            
        except Exception as e:
            print(f"  ⚠ Error processing event: {e}")
            continue
    
    return processed_events

def save_calendar(events, output_path):
    """
    Save calendar events to JSON file
    """
    try:
        # Sort by date
        events_sorted = sorted(events, key=lambda x: x['date'])
        
        # Save to file
        with open(output_path, 'w') as f:
            json.dump(events_sorted, f, indent=2)
        
        print(f"\n✓ Saved {len(events_sorted)} events to {output_path}")
        
        # Print statistics
        past_events = sum(1 for e in events_sorted if not e['is_future_event'])
        future_events = sum(1 for e in events_sorted if e['is_future_event'])
        
        print(f"  📊 Past events: {past_events}")
        print(f"  📊 Future events: {future_events}")
        
        if events_sorted:
            print(f"  📅 Date range: {events_sorted[0]['date']} to {events_sorted[-1]['date']}")
        
        return True
        
    except Exception as e:
        print(f"\n✗ Error saving calendar: {e}")
        return False

def main():
    # Fetch events from API
    events = fetch_calendar_events()
    
    if not events:
        print("\n⚠ No events fetched from API")
        return
    
    print(f"\n✓ Total events fetched: {len(events)}")
    
    # Process events
    processed_events = process_calendar_data(events)
    
    print(f"✓ Processed {len(processed_events)} events")
    
    # Save to output file
    output_path = r'e:\Interactive Brokers\frontend\public\economic-calendar.json'
    
    success = save_calendar(processed_events, output_path)
    
    if success:
        print("\n" + "=" * 80)
        print("✓ Economic calendar update complete!")
        print("=" * 80)

if __name__ == '__main__':
    main()
