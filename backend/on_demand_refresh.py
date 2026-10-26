"""
On-demand refresh of bond yields and interest rates from Trading Economics.

There is no scheduled daily fetch (the Trading Economics plan has a monthly request quota).
Instead, when the dashboard asks for a series, it is topped up once if it's missing the latest
completed trading day, saved to MongoDB, and served from there for everyone afterwards.

Safeguards against burning the quota:
- only series someone actually views are fetched
- only complete daily bars are stored (never today's still-forming bar)
- at most one attempt per bond series every 6 hours and per interest-rate country every 24 hours,
  recorded in MongoDB even when the attempt fails (quota exceeded, holiday with no new data, ...)
- concurrent requests for the same series share one fetch
"""

import asyncio
from datetime import datetime, timedelta
from typing import Iterable

from database import get_bond_yields_collection, get_interest_rates_collection
from response_cache import cached, invalidate
import fetch_incremental_bond_data as te

BOND_RETRY_SECONDS = 6 * 3600
RATE_RETRY_SECONDS = 24 * 3600
# Each top-up re-fetches this many recent days (same single request) and replaces them, so bars
# that were stored while still forming (the old 5 AM job did this) are corrected with final closes.
RECHECK_DAYS = 21


def _last_complete_trading_day(now_utc: datetime):
    """Most recent weekday before today (UTC) - the newest daily bar that is complete."""
    d = now_utc.date() - timedelta(days=1)
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


def _recently_attempted(doc: dict, seconds: int) -> bool:
    attempt = doc.get('last_fetch_attempt')
    return bool(attempt) and (datetime.utcnow() - attempt).total_seconds() < seconds


async def _refresh_bond(country: str, maturity: str):
    symbol = te.BOND_SYMBOLS.get(country, {}).get(maturity)
    if not symbol:
        return
    coll = get_bond_yields_collection()
    key = {'country': country, 'maturity': maturity}
    doc = await coll.find_one(key, {'last_available_date': 1, 'last_fetch_attempt': 1, 'complete_through': 1})
    if not doc or not doc.get('last_available_date'):
        return  # no stored series to extend
    newest_complete = _last_complete_trading_day(datetime.utcnow())
    # complete_through = last day verified with a final close (missing on series written by the old job)
    verified = doc.get('complete_through')
    if (verified and verified.date() >= newest_complete) or _recently_attempted(doc, BOND_RETRY_SECONDS):
        return

    await coll.update_one(key, {'$set': {'last_fetch_attempt': datetime.utcnow()}})
    since = doc['last_available_date'] - timedelta(days=RECHECK_DAYS)
    loop = asyncio.get_running_loop()
    records = await loop.run_in_executor(
        None, te.fetch_bond_data_from_te, country, symbol, maturity, since, datetime.now())
    records = [r for r in records if since <= r['date_obj'] and r['date_obj'].date() <= newest_complete]
    if not records:
        return

    # Replace the re-checked window with final values, then append
    first = min(r['date_obj'] for r in records)
    await coll.update_one(key, {'$pull': {'data': {'date_obj': {'$gte': first}}}})
    await coll.update_one(key, {
        '$push': {'data': {'$each': records}},
        '$set': {
            'symbol': symbol,
            'last_available_date': max(r['date_obj'] for r in records),
            'complete_through': max(r['date_obj'] for r in records),
            'last_updated': datetime.now(),
        },
    })
    counted = await coll.aggregate([{'$match': key}, {'$project': {'n': {'$size': '$data'}}}]).to_list(1)
    if counted:
        await coll.update_one(key, {'$set': {'record_count': counted[0]['n']}})
    invalidate('bond-yields')
    invalidate('bond-series')
    print(f"✓ On-demand refresh: {country} {maturity.upper()} re-checked {len(records)} day(s) from {first.date()}")


async def _refresh_interest_rate(country: str):
    coll = get_interest_rates_collection()
    doc = await coll.find_one({'country': country}, {'last_available_date': 1, 'last_fetch_attempt': 1})
    if not doc or not doc.get('last_available_date') or _recently_attempted(doc, RATE_RETRY_SECONDS):
        return

    await coll.update_one({'country': country}, {'$set': {'last_fetch_attempt': datetime.utcnow()}})
    last = doc['last_available_date']
    api_country = te.COUNTRIES.get(country, {}).get('api_name', country)
    loop = asyncio.get_running_loop()
    records = await loop.run_in_executor(
        None, te.fetch_interest_rate_from_te, country, api_country, last + timedelta(days=1), datetime.now())
    records = [r for r in records if r['date_obj'] > last]
    if not records:
        return
    await coll.update_one({'country': country}, {
        '$push': {'data': {'$each': records}},
        '$set': {'last_available_date': max(r['date_obj'] for r in records), 'last_updated': datetime.now()},
        '$inc': {'record_count': len(records)},
    })
    invalidate('interest-rates')
    print(f"✓ On-demand refresh: {country} interest rate +{len(records)} record(s)")


async def ensure_bond_fresh(country: str, maturity: str):
    """Top up one bond series if it's behind. Never raises - serving stored data always wins."""
    try:
        await cached(('bond-refresh', country, maturity), 60, lambda: _refresh_bond(country, maturity))
    except Exception as e:
        print(f"✗ On-demand bond refresh failed for {country} {maturity}: {e}")


async def ensure_interest_rates_fresh(countries: Iterable[str]):
    """Top up interest rates for the given countries if not checked in the last 24 hours."""
    async def one(country):
        try:
            await cached(('rate-refresh', country), 60, lambda: _refresh_interest_rate(country))
        except Exception as e:
            print(f"✗ On-demand interest-rate refresh failed for {country}: {e}")
    await asyncio.gather(*(one(c) for c in countries))
