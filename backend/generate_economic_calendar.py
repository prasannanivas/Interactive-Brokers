import json
import os
from datetime import datetime, timedelta
import random

# Economic events configuration
ECONOMIC_EVENTS = {
    'United States': [
        {'name': 'FOMC Meeting', 'importance': 'High', 'frequency': 42, 'typical_day': 'Wednesday'},
        {'name': 'Non-Farm Payrolls', 'importance': 'High', 'frequency': 30, 'typical_day': 'Friday'},
        {'name': 'CPI (Consumer Price Index)', 'importance': 'High', 'frequency': 30, 'typical_day': 'Tuesday'},
        {'name': 'Interest Rate Decision', 'importance': 'High', 'frequency': 42, 'typical_day': 'Wednesday'},
        {'name': 'GDP Growth Rate', 'importance': 'High', 'frequency': 90, 'typical_day': 'Thursday'},
        {'name': 'Unemployment Rate', 'importance': 'High', 'frequency': 30, 'typical_day': 'Friday'},
        {'name': 'Retail Sales', 'importance': 'Medium', 'frequency': 30, 'typical_day': 'Thursday'},
        {'name': 'Industrial Production', 'importance': 'Medium', 'frequency': 30, 'typical_day': 'Wednesday'},
        {'name': 'Consumer Confidence', 'importance': 'Medium', 'frequency': 30, 'typical_day': 'Tuesday'},
        {'name': 'PMI Manufacturing', 'importance': 'Medium', 'frequency': 30, 'typical_day': 'Monday'},
    ],
    'Euro Area': [
        {'name': 'ECB Meeting', 'importance': 'High', 'frequency': 42, 'typical_day': 'Thursday'},
        {'name': 'Interest Rate Decision', 'importance': 'High', 'frequency': 42, 'typical_day': 'Thursday'},
        {'name': 'CPI (Inflation Rate)', 'importance': 'High', 'frequency': 30, 'typical_day': 'Wednesday'},
        {'name': 'GDP Growth Rate', 'importance': 'High', 'frequency': 90, 'typical_day': 'Friday'},
        {'name': 'Unemployment Rate', 'importance': 'Medium', 'frequency': 30, 'typical_day': 'Tuesday'},
        {'name': 'PMI Manufacturing', 'importance': 'Medium', 'frequency': 30, 'typical_day': 'Monday'},
        {'name': 'Retail Sales', 'importance': 'Medium', 'frequency': 30, 'typical_day': 'Thursday'},
    ],
    'United Kingdom': [
        {'name': 'BoE Meeting', 'importance': 'High', 'frequency': 42, 'typical_day': 'Thursday'},
        {'name': 'Interest Rate Decision', 'importance': 'High', 'frequency': 42, 'typical_day': 'Thursday'},
        {'name': 'CPI (Inflation)', 'importance': 'High', 'frequency': 30, 'typical_day': 'Wednesday'},
        {'name': 'GDP Growth Rate', 'importance': 'High', 'frequency': 90, 'typical_day': 'Friday'},
        {'name': 'Unemployment Rate', 'importance': 'High', 'frequency': 30, 'typical_day': 'Tuesday'},
        {'name': 'PMI Manufacturing', 'importance': 'Medium', 'frequency': 30, 'typical_day': 'Monday'},
        {'name': 'Retail Sales', 'importance': 'Medium', 'frequency': 30, 'typical_day': 'Thursday'},
    ],
    'Japan': [
        {'name': 'BoJ Meeting', 'importance': 'High', 'frequency': 42, 'typical_day': 'Friday'},
        {'name': 'Interest Rate Decision', 'importance': 'High', 'frequency': 42, 'typical_day': 'Friday'},
        {'name': 'CPI (Inflation)', 'importance': 'High', 'frequency': 30, 'typical_day': 'Friday'},
        {'name': 'GDP Growth Rate', 'importance': 'High', 'frequency': 90, 'typical_day': 'Monday'},
        {'name': 'Unemployment Rate', 'importance': 'Medium', 'frequency': 30, 'typical_day': 'Tuesday'},
        {'name': 'PMI Manufacturing', 'importance': 'Medium', 'frequency': 30, 'typical_day': 'Monday'},
        {'name': 'Retail Sales', 'importance': 'Medium', 'frequency': 30, 'typical_day': 'Thursday'},
    ],
    'Canada': [
        {'name': 'BoC Meeting', 'importance': 'High', 'frequency': 42, 'typical_day': 'Wednesday'},
        {'name': 'Interest Rate Decision', 'importance': 'High', 'frequency': 42, 'typical_day': 'Wednesday'},
        {'name': 'CPI (Inflation)', 'importance': 'High', 'frequency': 30, 'typical_day': 'Tuesday'},
        {'name': 'GDP Growth Rate', 'importance': 'High', 'frequency': 90, 'typical_day': 'Friday'},
        {'name': 'Unemployment Rate', 'importance': 'High', 'frequency': 30, 'typical_day': 'Friday'},
        {'name': 'PMI Manufacturing', 'importance': 'Medium', 'frequency': 30, 'typical_day': 'Monday'},
    ],
    'Australia': [
        {'name': 'RBA Meeting', 'importance': 'High', 'frequency': 30, 'typical_day': 'Tuesday'},
        {'name': 'Interest Rate Decision', 'importance': 'High', 'frequency': 30, 'typical_day': 'Tuesday'},
        {'name': 'CPI (Inflation)', 'importance': 'High', 'frequency': 90, 'typical_day': 'Wednesday'},
        {'name': 'GDP Growth Rate', 'importance': 'High', 'frequency': 90, 'typical_day': 'Wednesday'},
        {'name': 'Unemployment Rate', 'importance': 'High', 'frequency': 30, 'typical_day': 'Thursday'},
        {'name': 'Retail Sales', 'importance': 'Medium', 'frequency': 30, 'typical_day': 'Friday'},
    ],
}

DAY_MAP = {
    'Monday': 0,
    'Tuesday': 1,
    'Wednesday': 2,
    'Thursday': 3,
    'Friday': 4
}

def get_next_weekday(start_date, target_weekday):
    """Get the next occurrence of target weekday from start_date"""
    days_ahead = target_weekday - start_date.weekday()
    if days_ahead <= 0:
        days_ahead += 7
    return start_date + timedelta(days=days_ahead)

def generate_event_time():
    """Generate realistic event time in EST (usually morning hours)"""
    hours = random.choice([8, 9, 10, 12, 13, 14, 15])
    minutes = random.choice([0, 15, 30, 45])
    return f"{hours:02d}:{minutes:02d} EST"

def generate_calendar_events(start_date, end_date):
    """Generate economic calendar events for the date range"""
    events = []
    event_id = 1
    today = datetime.now().date()
    
    for country, event_list in ECONOMIC_EVENTS.items():
        for event_config in event_list:
            current_date = start_date
            
            # Find first occurrence
            target_weekday = DAY_MAP[event_config['typical_day']]
            current_date = get_next_weekday(current_date, target_weekday)
            
            # Generate recurring events
            while current_date <= end_date:
                # Skip some events randomly (not all data is always released on time)
                if random.random() > 0.05:  # 95% chance to include event
                    event_time = generate_event_time()
                    
                    # Check if event is in the future
                    is_future_event = current_date.date() > today
                    
                    # Generate realistic values based on event type
                    actual = None
                    forecast = None
                    previous = None
                    
                    if 'Interest Rate' in event_config['name'] or 'Meeting' in event_config['name']:
                        # Interest rates as percentages
                        base_rate = {
                            'United States': 5.25, 'Euro Area': 4.0, 'United Kingdom': 5.0,
                            'Japan': 0.25, 'Canada': 4.75, 'Australia': 4.35
                        }.get(country, 4.0)
                        
                        if is_future_event:
                            # Future events only have forecast and previous
                            forecast = round(base_rate + random.uniform(-0.25, 0.25), 2)
                            previous = round(base_rate + random.uniform(-0.5, 0.1), 2)
                        else:
                            actual = round(base_rate + random.uniform(-0.25, 0.25), 2)
                            forecast = round(actual + random.uniform(-0.25, 0.25), 2)
                            previous = round(actual + random.uniform(-0.5, 0.1), 2)
                        
                    elif 'CPI' in event_config['name'] or 'Inflation' in event_config['name']:
                        # CPI as year-over-year percentage
                        if is_future_event:
                            forecast = round(random.uniform(1.5, 4.5), 1)
                            previous = round(forecast + random.uniform(-0.8, 0.3), 1)
                        else:
                            actual = round(random.uniform(1.5, 4.5), 1)
                            forecast = round(actual + random.uniform(-0.5, 0.5), 1)
                            previous = round(actual + random.uniform(-0.8, 0.3), 1)
                        
                    elif 'GDP' in event_config['name']:
                        # GDP growth as percentage
                        if is_future_event:
                            forecast = round(random.uniform(1.0, 3.5), 1)
                            previous = round(forecast + random.uniform(-0.5, 0.5), 1)
                        else:
                            actual = round(random.uniform(1.0, 3.5), 1)
                            forecast = round(actual + random.uniform(-0.5, 0.5), 1)
                            previous = round(actual + random.uniform(-0.5, 0.5), 1)
                        
                    elif 'Unemployment' in event_config['name']:
                        # Unemployment as percentage
                        if is_future_event:
                            forecast = round(random.uniform(3.5, 5.5), 1)
                            previous = round(forecast + random.uniform(-0.3, 0.3), 1)
                        else:
                            actual = round(random.uniform(3.5, 5.5), 1)
                            forecast = round(actual + random.uniform(-0.2, 0.2), 1)
                            previous = round(actual + random.uniform(-0.3, 0.3), 1)
                        
                    elif 'Non-Farm' in event_config['name']:
                        # NFP in thousands
                        if is_future_event:
                            forecast = round(random.uniform(150, 350), 0)
                            previous = round(forecast + random.uniform(-80, 40), 0)
                        else:
                            actual = round(random.uniform(150, 350), 0)
                            forecast = round(actual + random.uniform(-50, 50), 0)
                            previous = round(actual + random.uniform(-80, 40), 0)
                        
                    elif 'Retail Sales' in event_config['name']:
                        # Retail sales as percentage change
                        if is_future_event:
                            forecast = round(random.uniform(-0.5, 2.5), 1)
                            previous = round(forecast + random.uniform(-0.8, 0.8), 1)
                        else:
                            actual = round(random.uniform(-0.5, 2.5), 1)
                            forecast = round(actual + random.uniform(-0.5, 0.5), 1)
                            previous = round(actual + random.uniform(-0.8, 0.8), 1)
                        
                    elif 'PMI' in event_config['name']:
                        # PMI index (50 is expansion/contraction threshold)
                        if is_future_event:
                            forecast = round(random.uniform(48, 54), 1)
                            previous = round(forecast + random.uniform(-1.5, 1.5), 1)
                        else:
                            actual = round(random.uniform(48, 54), 1)
                            forecast = round(actual + random.uniform(-1, 1), 1)
                            previous = round(actual + random.uniform(-1.5, 1.5), 1)
                    
                    event = {
                        'id': event_id,
                        'date': current_date.strftime('%Y-%m-%d'),
                        'time': event_time,
                        'country': country,
                        'event': event_config['name'],
                        'importance': event_config['importance'],
                        'actual': actual,
                        'forecast': forecast,
                        'previous': previous,
                        'currency': {
                            'United States': 'USD',
                            'Euro Area': 'EUR',
                            'United Kingdom': 'GBP',
                            'Japan': 'JPY',
                            'Canada': 'CAD',
                            'Australia': 'AUD'
                        }.get(country)
                    }
                    
                    events.append(event)
                    event_id += 1
                
                # Move to next occurrence
                current_date += timedelta(days=event_config['frequency'])
    
    # Sort by date (newest first)
    events.sort(key=lambda x: datetime.strptime(x['date'], '%Y-%m-%d'), reverse=True)
    
    return events

def main():
    # Generate data for last 1 year and next 6 months
    today = datetime.now()
    start_date = today - timedelta(days=365)  # 1 year back
    end_date = today + timedelta(days=180)    # 6 months forward
    
    print("Generating economic calendar data...")
    print(f"Date range: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
    print(f"Today: {today.strftime('%Y-%m-%d')}")
    print("=" * 60)
    
    events = generate_calendar_events(start_date, end_date)
    
    print(f"\nGenerated {len(events)} economic events")
    print(f"Countries: {', '.join(ECONOMIC_EVENTS.keys())}")
    
    # Count past vs future events
    today = datetime.now().date()
    past_events = sum(1 for e in events if datetime.strptime(e['date'], '%Y-%m-%d').date() <= today)
    future_events = sum(1 for e in events if datetime.strptime(e['date'], '%Y-%m-%d').date() > today)
    print(f"Past/Current events: {past_events}")
    print(f"Future events: {future_events}")
    
    # Save to public folder
    output_path = r'e:\Interactive Brokers\frontend\public\economic-calendar.json'
    
    with open(output_path, 'w') as f:
        json.dump(events, f, indent=2)
    
    print(f"\n✓ Saved calendar data to: {output_path}")
    
    # Print sample events
    print("\n" + "=" * 60)
    print("Sample events (5 most recent):")
    print("=" * 60)
    for event in events[:5]:
        print(f"{event['date']} {event['time']} | {event['country']:15} | {event['event']:25} | {event['importance']}")
    
    # Statistics
    print("\n" + "=" * 60)
    print("Statistics:")
    print("=" * 60)
    importance_counts = {}
    country_counts = {}
    
    for event in events:
        importance_counts[event['importance']] = importance_counts.get(event['importance'], 0) + 1
        country_counts[event['country']] = country_counts.get(event['country'], 0) + 1
    
    print("\nBy Importance:")
    for importance, count in sorted(importance_counts.items()):
        print(f"  {importance}: {count}")
    
    print("\nBy Country:")
    for country, count in sorted(country_counts.items()):
        print(f"  {country}: {count}")
    
    print("\n" + "=" * 60)
    print("Calendar generation complete!")
    print("=" * 60)

if __name__ == "__main__":
    main()
