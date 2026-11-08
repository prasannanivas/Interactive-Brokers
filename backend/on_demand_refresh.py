"""
On-demand refresh of bond yields and interest rates from Trading Economics.

There is no scheduled daily fetch (the Trading Economics plan allows ~500 requests a month, see
te_budget.py). Instead, when the dashboard asks for a series, stored data is topped up once and
served from MongoDB for everyone afterwards.

Bond yields (move every trading day):
- when a viewed series is missing the latest completed trading day, ALL stale series are topped up
  together in one request - about 1 request per trading day in total
- only complete daily bars are stored (never today's still-forming bar)
- at most one attempt per series every 6 hours, recorded even when the attempt fails

Interest rates (only change at central bank meetings):
- decision dates for every country come from one Trading Economics calendar request every
  DECISION_REFRESH_DAYS days (rate_decisions collection)
- a country is only fetched after one of its decisions (Hong Kong follows the Fed, Denmark the ECB),
  plus a safety check every RATE_FALLBACK_DAYS in case of an unscheduled move
- all countries that are due are fetched in one request
"""

import asyncio
import re
from datetime import datetime, timedelta
from typing import Iterable

from database import Database, get_bond_yields_collection, get_interest_rates_collection
from response_cache import cached, invalidate
from te_budget import BudgetExceeded, te_get
import fetch_incremental_bond_data as te

BOND_RETRY_SECONDS = 6 * 3600
BOND_BATCH = 40     # all 32 tickers verified to fit in one request with the key in the header
# Each top-up re-fetches this many recent days (same single request) and replaces them, so bars
# that were stored while still forming (the old 5 AM job did this) are corrected with final closes.
RECHECK_DAYS = 21

RATE_RETRY_SECONDS = 6 * 3600
DECISION_REFRESH_DAYS = 14
DECISION_SETTLE = timedelta(hours=1)        # give Trading Economics time to publish the new rate
DECISION_GIVE_UP = timedelta(hours=12)      # an unchanged rate may never get a new record
RATE_FALLBACK_DAYS = {'Singapore': 7}       # Singapore's series is a market overnight rate
DEFAULT_FALLBACK_DAYS = 30
FOLLOWS = {'Hong Kong': ['United States'], 'Denmark': ['Euro Area']}
DECISION_EVENT = re.compile(r'rate decision|loan prime rate|monetary policy statement|base rate|'
                            r'deposit facility|refinancing rate|cash rate', re.I)


def _last_complete_trading_day(now_utc: datetime):
    """Most recent weekday before today (UTC) - the newest daily bar that is complete."""
    d = now_utc.date() - timedelta(days=1)
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


def _recently_attempted(doc: dict, seconds: int) -> bool:
    attempt = doc.get('last_fetch_attempt')
    return bool(attempt) and (datetime.utcnow() - attempt).total_seconds() < seconds


# ── Bond yields ──────────────────────────────────────────────────────────────

BOND_FIELDS = {'country': 1, 'maturity': 1, 'last_available_date': 1, 'last_fetch_attempt': 1, 'complete_through': 1}


def _bond_is_stale(doc: dict, newest_complete) -> bool:
    if not doc or not doc.get('last_available_date'):
        return False  # no stored series to extend
    if not te.BOND_SYMBOLS.get(doc['country'], {}).get(doc['maturity']):
        return False
    # complete_through = last day verified with a final close (missing on series written by the old job)
    verified = doc.get('complete_through')
    if verified and verified.date() >= newest_complete:
        return False
    return not _recently_attempted(doc, BOND_RETRY_SECONDS)


async def _store_bond(doc: dict, records: list):
    coll = get_bond_yields_collection()
    key = {'country': doc['country'], 'maturity': doc['maturity']}
    # Replace the re-checked window with final values, then append
    first = min(r['date_obj'] for r in records)
    await coll.update_one(key, {'$pull': {'data': {'date_obj': {'$gte': first}}}})
    await coll.update_one(key, {
        '$push': {'data': {'$each': records}},
        '$set': {
            'symbol': te.BOND_SYMBOLS[doc['country']][doc['maturity']],
            'last_available_date': max(r['date_obj'] for r in records),
            'complete_through': max(r['date_obj'] for r in records),
            'last_updated': datetime.now(),
        },
    })
    counted = await coll.aggregate([{'$match': key}, {'$project': {'n': {'$size': '$data'}}}]).to_list(1)
    if counted:
        await coll.update_one(key, {'$set': {'record_count': counted[0]['n']}})


async def _refresh_all_bonds():
    coll = get_bond_yields_collection()
    newest_complete = _last_complete_trading_day(datetime.utcnow())
    docs = await coll.find({}, BOND_FIELDS).to_list(None)
    stale = [d for d in docs if _bond_is_stale(d, newest_complete)]
    if not stale:
        return
    await coll.update_many({'_id': {'$in': [d['_id'] for d in stale]}},
                           {'$set': {'last_fetch_attempt': datetime.utcnow()}})

    loop = asyncio.get_running_loop()
    updated = 0
    for i in range(0, len(stale), BOND_BATCH):
        chunk = stale[i:i + BOND_BATCH]
        symbols = [te.BOND_SYMBOLS[d['country']][d['maturity']] for d in chunk]
        since = min(d['last_available_date'] for d in chunk) - timedelta(days=RECHECK_DAYS)
        try:
            got = await loop.run_in_executor(None, te.fetch_bonds_batch, symbols, since, datetime.now())
        except BudgetExceeded as e:
            print(f"⏸ Bond refresh skipped: {e}")
            break
        except Exception as e:
            print(f"✗ Bond refresh failed for {', '.join(symbols)}: {e}")
            continue
        for doc, symbol in zip(chunk, symbols):
            own_since = doc['last_available_date'] - timedelta(days=RECHECK_DAYS)
            records = [r for r in got.get(symbol.upper(), [])
                       if own_since <= r['date_obj'] and r['date_obj'].date() <= newest_complete]
            if records:
                await _store_bond(doc, records)
                updated += 1
    if updated:
        invalidate('bond-yields')
        invalidate('bond-series')
    print(f"✓ On-demand bond refresh: {updated}/{len(stale)} series updated "
          f"in {(len(stale) + BOND_BATCH - 1) // BOND_BATCH} request(s)")


async def ensure_bond_fresh(country: str, maturity: str):
    """Top up bond series if the viewed one is behind. Never raises - serving stored data always wins."""
    try:
        doc = await get_bond_yields_collection().find_one({'country': country, 'maturity': maturity}, BOND_FIELDS)
        if _bond_is_stale(doc, _last_complete_trading_day(datetime.utcnow())):
            await cached(('bond-refresh-all',), 60, _refresh_all_bonds)
    except Exception as e:
        print(f"✗ On-demand bond refresh failed for {country} {maturity}: {e}")


# ── Interest rates ───────────────────────────────────────────────────────────

def _decisions_coll():
    return Database.get_db().rate_decisions


async def _refresh_decisions(countries: list):
    """Upcoming/recent rate decisions for all countries - one request every DECISION_REFRESH_DAYS."""
    coll = _decisions_coll()
    meta = await coll.find_one({'_id': '__meta__'}) or {}
    fetched = meta.get('fetched_at')
    if fetched and datetime.utcnow() - fetched < timedelta(days=DECISION_REFRESH_DAYS):
        return
    if meta.get('last_attempt') and datetime.utcnow() - meta['last_attempt'] < timedelta(hours=6):
        return
    await coll.update_one({'_id': '__meta__'}, {'$set': {'last_attempt': datetime.utcnow()}}, upsert=True)

    names = sorted(set(countries) | {f for c in countries for f in FOLLOWS.get(c, [])})
    start = (datetime.utcnow() - timedelta(days=10)).strftime('%Y-%m-%d')
    end = (datetime.utcnow() + timedelta(days=60)).strftime('%Y-%m-%d')
    url = f"{te.TE_BASE_URL}/calendar/country/{','.join(names)}/indicator/interest rate/{start}/{end}"
    loop = asyncio.get_running_loop()
    resp = await loop.run_in_executor(None, lambda: te_get('rate_decisions', url, {'c': te.TE_API_KEY, 'f': 'json'}, 45))
    if resp.status_code != 200:
        raise RuntimeError(f"Trading Economics {resp.status_code}: {resp.text[:200]}")
    kept = 0
    for ev in resp.json():
        name = ev.get('Event') or ''
        if not DECISION_EVENT.search(name) or 'projection' in name.lower():
            continue
        try:
            when = datetime.fromisoformat((ev.get('Date') or '').replace('Z', ''))
        except ValueError:
            continue
        await coll.update_one({'_id': f"{ev.get('Country')}|{name}|{when.date()}"},
                              {'$set': {'country': ev.get('Country'), 'event': name, 'date': when}}, upsert=True)
        kept += 1
    await coll.update_one({'_id': '__meta__'}, {'$set': {'fetched_at': datetime.utcnow()}})
    print(f"✓ Rate decision calendar: {kept} decisions for {len(names)} countries (1 request)")


async def _pending_decision(country: str, checked_through: datetime):
    """Latest decision for this country (or the bank it follows) announced since the last check."""
    now = datetime.utcnow()
    sources = [country] + FOLLOWS.get(country, [])
    return await _decisions_coll().find_one(
        {'country': {'$in': sources}, 'date': {'$gt': checked_through, '$lte': now - DECISION_SETTLE}},
        sort=[('date', -1)])


async def _refresh_due_rates():
    coll = get_interest_rates_collection()
    docs = await coll.find({}, {'country': 1, 'last_available_date': 1, 'last_fetch_attempt': 1,
                                'rates_checked_through': 1, 'last_updated': 1}).to_list(None)
    docs = [d for d in docs if d.get('last_available_date')]
    try:
        await _refresh_decisions([d['country'] for d in docs])
    except BudgetExceeded as e:
        print(f"⏸ Rate decision calendar skipped: {e}")
    except Exception as e:
        print(f"✗ Rate decision calendar failed: {e}")

    now = datetime.utcnow()
    due = []  # (doc, pending decision or None)
    for d in docs:
        if _recently_attempted(d, RATE_RETRY_SECONDS):
            continue
        checked = d.get('rates_checked_through') or d.get('last_updated') or d['last_available_date']
        decision = await _pending_decision(d['country'], checked)
        fallback = timedelta(days=RATE_FALLBACK_DAYS.get(d['country'], DEFAULT_FALLBACK_DAYS))
        if decision or now - checked >= fallback:
            due.append((d, decision))
    if not due:
        return

    await coll.update_many({'_id': {'$in': [d['_id'] for d, _ in due]}}, {'$set': {'last_fetch_attempt': now}})
    api_name = {d['country']: te.COUNTRIES.get(d['country'], {}).get('api_name', d['country']) for d, _ in due}
    start = min(d['last_available_date'] for d, _ in due) + timedelta(days=1)
    loop = asyncio.get_running_loop()
    try:
        got = await loop.run_in_executor(None, te.fetch_interest_rates_batch,
                                         sorted(set(api_name.values())), start, datetime.now())
    except BudgetExceeded as e:
        print(f"⏸ Interest-rate refresh skipped: {e}")
        return
    except Exception as e:
        print(f"✗ Interest-rate refresh failed: {e}")
        return

    added = 0
    for d, decision in due:
        records = [r for r in got.get(api_name[d['country']].lower(), []) if r['date_obj'] > d['last_available_date']]
        update = {}
        if records:
            update['$push'] = {'data': {'$each': records}}
            update['$inc'] = {'record_count': len(records)}
            update['$set'] = {'last_available_date': max(r['date_obj'] for r in records), 'last_updated': datetime.now()}
            added += len(records)
        # The decision is settled once its new rate arrived, or long enough after it (rate unchanged)
        settled = (not decision or any(r['date_obj'].date() >= decision['date'].date() for r in records)
                   or now - decision['date'] >= DECISION_GIVE_UP)
        if settled:
            update.setdefault('$set', {})['rates_checked_through'] = now
        if update:
            await coll.update_one({'_id': d['_id']}, update)
    if added:
        invalidate('interest-rates')
    print(f"✓ On-demand interest-rate refresh ({', '.join(sorted(api_name))}): +{added} record(s), 1 request")


async def ensure_interest_rates_fresh(countries: Iterable[str]):
    """Fetch interest rates only for countries with a central bank decision since the last check."""
    try:
        await cached(('rate-refresh-due',), 60, _refresh_due_rates)
    except Exception as e:
        print(f"✗ On-demand interest-rate refresh failed: {e}")


# ── Economic calendar ────────────────────────────────────────────────────────
# Fetched when the calendar is viewed instead of by a daily job:
# - near window (last few days + next two weeks): when events have been released since the last
#   fetch, at most every CALENDAR_REFRESH_HOURS - fills in actual values and picks up reschedules
# - far window (out to ~3.5 months): once a month, in 30-day requests (1,000-row cap per request)

CALENDAR_REFRESH_HOURS = 12
CALENDAR_NEAR_PAST_DAYS = 3
CALENDAR_NEAR_FUTURE_DAYS = 14
CALENDAR_FAR_DAYS = 30
CALENDAR_FAR_CHUNKS = 3


def _calendar_meta():
    return Database.get_db().fetch_meta


async def _refresh_calendar():
    import fetch_incremental_economic_calendar as cal
    from database import get_economic_calendar_collection
    meta_coll = _calendar_meta()
    meta = await meta_coll.find_one({'_id': 'calendar'}) or {}
    now = datetime.utcnow()
    today = datetime(now.year, now.month, now.day)
    loop = asyncio.get_running_loop()
    windows = []

    near_at = meta.get('near_at')
    if not near_at or now - near_at >= timedelta(hours=CALENDAR_REFRESH_HOURS):
        # only worth a request if something was released since the last fetch
        released = not near_at or await get_economic_calendar_collection().find_one(
            {'date': {'$gt': near_at, '$lte': now}}, {'_id': 1})
        if released:
            windows.append(('near_at', today - timedelta(days=CALENDAR_NEAR_PAST_DAYS),
                            today + timedelta(days=CALENDAR_NEAR_FUTURE_DAYS, hours=23, minutes=59)))
    far_at = meta.get('far_at')
    if not far_at or now - far_at >= timedelta(days=30):
        start = today + timedelta(days=CALENDAR_NEAR_FUTURE_DAYS + 1)
        for i in range(CALENDAR_FAR_CHUNKS):
            s = start + timedelta(days=i * CALENDAR_FAR_DAYS)
            windows.append(('far_at' if i == CALENDAR_FAR_CHUNKS - 1 else None, s,
                            s + timedelta(days=CALENDAR_FAR_DAYS - 1, hours=23, minutes=59)))
    if not windows:
        return

    changed = 0
    for field, start, end in windows:
        try:
            changed += await loop.run_in_executor(None, cal.refresh_window, start, end)
        except BudgetExceeded as e:
            print(f"⏸ Calendar refresh skipped: {e}")
            break
        except Exception as e:
            print(f"✗ Calendar refresh failed for {start.date()}..{end.date()}: {e}")
            break
        if field:
            await meta_coll.update_one({'_id': 'calendar'}, {'$set': {field: now}}, upsert=True)
    if changed:
        invalidate('economic-calendar')
    print(f"✓ On-demand calendar refresh: {changed} event(s) updated in {len(windows)} window(s)")


async def ensure_calendar_fresh():
    try:
        await cached(('calendar-refresh',), 60, _refresh_calendar)
    except Exception as e:
        print(f"✗ On-demand calendar refresh failed: {e}")
