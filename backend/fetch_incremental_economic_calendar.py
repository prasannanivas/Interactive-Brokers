"""
Incremental Economic Calendar Fetcher
Fetches economic calendar events from Trading Economics API.
- On first run: fetches last 30 days + 6 months future
- On subsequent runs: finds the latest event date in MongoDB and fetches only new/upcoming events
Stores all events in MongoDB 'economic_calendar' collection.
"""

import os
import hashlib
from datetime import datetime, timedelta
from pymongo import MongoClient, UpdateOne
from dotenv import load_dotenv
import requests

load_dotenv()

MONGODB_URL = os.getenv('MONGODB_URL', 'mongodb://localhost:27017')
MONGODB_DB_NAME = os.getenv('MONGODB_DB_NAME', 'trading_monitor')
TE_API_KEY = os.getenv('TRADING_ECONOMICS_API_KEY', 'FD7D4940DA88440:697C30A6298E4B5')
TE_BASE_URL = 'https://api.tradingeconomics.com'

COUNTRIES = [
    'United States',
    'Euro Area',
    'United Kingdom',
    'Japan',
    'Canada',
    'Australia',
]


def _event_id(country: str, event_name: str, date_str: str) -> str:
    """Generate a stable unique ID for an event based on country+event+date."""
    raw = f"{country}|{event_name}|{date_str}"
    return hashlib.md5(raw.encode()).hexdigest()


def get_last_stored_date(collection) -> datetime | None:
    """Return the latest event date stored in MongoDB, or None if collection is empty."""
    latest = collection.find_one({}, sort=[('date', -1)])
    if latest and latest.get('date'):
        return latest['date']
    return None


def fetch_calendar_for_range(start_date: datetime, end_date: datetime) -> list:
    """
    Fetch raw events from Trading Economics API for all countries in the given date range.
    Returns a list of processed event dicts ready for MongoDB upsert.
    """
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')

    print(f"\n  Date range: {start_str}  →  {end_str}")

    all_events = []

    for country in COUNTRIES:
        print(f"  📅 Fetching {country}...")
        try:
            country_encoded = country.replace(' ', '%20')
            url = f"{TE_BASE_URL}/calendar/country/{country_encoded}/{start_str}/{end_str}?c={TE_API_KEY}"
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            events = response.json()

            if not events:
                print(f"     ⚠ No events returned")
                continue

            print(f"     ✓ {len(events)} events")

            for event in events:
                date_raw = event.get('Date', event.get('DateTime', ''))
                if not date_raw:
                    continue

                try:
                    event_dt = datetime.fromisoformat(date_raw.replace('Z', '+00:00')).replace(tzinfo=None)
                except Exception:
                    continue

                event_name = event.get('Event', event.get('Category', ''))
                event_country = event.get('Country', country)
                date_only_str = event_dt.strftime('%Y-%m-%d')

                uid = _event_id(event_country, event_name, date_only_str)

                processed = {
                    '_id': uid,
                    'country': event_country,
                    'event': event_name,
                    'date': event_dt,
                    'date_str': date_only_str,
                    'time': event_dt.strftime('%H:%M'),
                    'importance': event.get('Importance', 'Medium'),
                    'actual': event.get('Actual'),
                    'forecast': event.get('Forecast'),
                    'previous': event.get('Previous'),
                    'is_future_event': event_dt > datetime.utcnow(),
                    'updated_at': datetime.utcnow(),
                }
                all_events.append(processed)

        except Exception as e:
            print(f"     ✗ Error fetching {country}: {e}")

    return all_events


def upsert_events(collection, events: list) -> int:
    """Bulk upsert events into MongoDB. Returns number of records inserted/modified."""
    if not events:
        return 0

    ops = [
        UpdateOne(
            {'_id': ev['_id']},
            {'$set': ev},
            upsert=True
        )
        for ev in events
    ]

    result = collection.bulk_write(ops, ordered=False)
    return result.upserted_count + result.modified_count


def run():
    print("=" * 60)
    print("📅 Incremental Economic Calendar Fetch")
    print(f"   {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    client = MongoClient(MONGODB_URL, serverSelectionTimeoutMS=30000)
    db = client[MONGODB_DB_NAME]
    collection = db['economic_calendar']

    # Ensure indexes exist
    collection.create_index([('date', -1)])
    collection.create_index([('country', 1), ('date', -1)])
    collection.create_index([('is_future_event', 1), ('date', 1)])

    last_date = get_last_stored_date(collection)

    if last_date:
        # Incremental: start from the day AFTER the last stored event date
        start_date = last_date + timedelta(days=1)
        print(f"\n✅ Last stored event date: {last_date.strftime('%Y-%m-%d')}")
        print(f"   Fetching from {start_date.strftime('%Y-%m-%d')} onward...")
    else:
        # First run: fetch last 30 days of history
        start_date = datetime.utcnow() - timedelta(days=30)
        print(f"\n📦 No existing data — fetching from scratch ({start_date.strftime('%Y-%m-%d')} onward)...")

    # Always fetch up to 6 months into the future
    end_date = datetime.utcnow() + timedelta(days=180)

    if start_date > end_date:
        print("\n✅ Data is already up to date — nothing to fetch.")
        client.close()
        return True, 0

    events = fetch_calendar_for_range(start_date, end_date)

    if not events:
        print("\n⚠ No events fetched from API.")
        client.close()
        return True, 0

    print(f"\n📦 Total events fetched: {len(events)}")

    affected = upsert_events(collection, events)

    total_stored = collection.count_documents({})
    future_stored = collection.count_documents({'is_future_event': True})

    print(f"\n✓ Upsert complete!")
    print(f"  • Records inserted/updated: {affected}")
    print(f"  • Total in collection: {total_stored}")
    print(f"  • Future events: {future_stored}")
    print("=" * 60)

    client.close()
    return True, affected


if __name__ == '__main__':
    success, count = run()
    if not success:
        exit(1)
