"""
Bond yield series with selectable period (1D ... All) and candle size (1m ... 1 Month).

Daily, weekly and monthly candles come from the stored daily history (bond_yields) - no API calls.

Intraday (1m / 5m / 15m / 1h) is offered for the 1D period only. It comes from Trading Economics
/markets/intraday, fetched on view, and never more than the last day:
- all series on the chart in one combined request (1 day x 4 tickers stays well under TE's 10,000
  one-minute-record cap); falls back to one request per ticker if TE doesn't support combined (verified at runtime)
- stored at 1-minute resolution in MongoDB (bond_intraday, last 3 days kept) and aggregated to 5m / 15m / 1h
  locally, so switching candle size costs nothing
- refreshed at most every INTRADAY_REFRESH_MINUTES (default 360) per series, attempts recorded even
  when they fail, concurrent viewers share one fetch
"""

import asyncio
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

import pandas as pd
import requests
from pymongo import UpdateOne

from database import get_bond_yields_collection, Database
from response_cache import cached, invalidate
import fetch_incremental_bond_data as te

RANGES = {  # calendar days back from the latest data point
    '1D': 1, '1W': 7, '1M': 31, '3M': 92, '6M': 183, '1Y': 366,
    '5Y': 1827, '10Y': 3653, '25Y': 9132, '50Y': 18263, 'ALL': None,
}
INTRADAY_MINUTES = {'1m': 1, '5m': 5, '15m': 15, '1h': 60}
DAILY_RULES = {'1d': None, '1w': 'W-FRI', '1M': 'ME'}

# Candle sizes offered per period (keeps every chart to a few thousand points at most)
# Intraday candles are only for 1D; every longer period uses stored daily history (no API calls)
ALLOWED = {
    '1D': ['1m', '5m', '15m', '1h'],
    '1W': ['1d'],
    '1M': ['1d', '1w'],
    '3M': ['1d', '1w'],
    '6M': ['1d', '1w', '1M'],
    '1Y': ['1d', '1w', '1M'],
    '5Y': ['1d', '1w', '1M'],
    '10Y': ['1d', '1w', '1M'],
    '25Y': ['1w', '1M'],
    '50Y': ['1w', '1M'],
    'ALL': ['1w', '1M'],
}

INTRADAY_REFRESH_MINUTES = int(os.getenv('INTRADAY_REFRESH_MINUTES', '360'))
INTRADAY_RETENTION_DAYS = int(os.getenv('INTRADAY_RETENTION_DAYS', '3'))


def _intraday_window_start(now: datetime) -> datetime:
    """Never fetch more than the last day of intraday data (1D view only). Over a weekend,
    step back to the same time on Friday so the last session is covered."""
    since = now - timedelta(days=1)
    while since.weekday() >= 5:
        since -= timedelta(days=1)
    return since


def _intraday_coll():
    return Database.get_db().bond_intraday


def _intraday_meta_coll():
    return Database.get_db().bond_intraday_meta


async def ensure_intraday_indexes():
    await _intraday_coll().create_index([('country', 1), ('maturity', 1), ('ts', 1)], unique=True)
    await _intraday_coll().create_index([('ts', 1)])
    await _intraday_meta_coll().create_index([('country', 1), ('maturity', 1)], unique=True)


def _resample(df: pd.DataFrame, rule: Optional[str]) -> pd.DataFrame:
    """OHLC resample. Intraday buckets are labelled by their start; weekly / monthly by their last trading day."""
    if rule is None or df.empty:
        return df
    intraday = rule.endswith('min')
    agg = {'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last'}
    if not intraday:
        df = df.assign(_last=df.index)
        agg['_last'] = 'last'
    try:
        out = df.resample(rule, label='left' if intraday else 'right', closed='left' if intraday else 'right').agg(agg)
    except ValueError:
        if rule != 'ME':
            raise
        out = df.resample('M', label='right', closed='right').agg(agg)  # pandas < 2.2
    out = out.dropna(subset=['close'])
    if not intraday:
        # label weekly / monthly candles with their last actual trading day (not a future period end)
        out = out.set_index('_last')
        out.index.name = None
    return out


def _to_points(df: pd.DataFrame, intraday: bool) -> List[Dict]:
    fmt = '%Y-%m-%dT%H:%M:%SZ' if intraday else '%Y-%m-%d'
    return [{'t': ts.strftime(fmt), 'o': round(float(r.open), 5), 'h': round(float(r.high), 5),
             'l': round(float(r.low), 5), 'c': round(float(r.close), 5)}
            for ts, r in df.iterrows()]


# ── Daily / weekly / monthly (stored history, no API calls) ──────────────────

async def _daily_frame(country: str, maturity: str, days: Optional[int]) -> pd.DataFrame:
    coll = get_bond_yields_collection()
    key = {'country': country, 'maturity': maturity}
    doc = await coll.find_one(key, {'last_available_date': 1})
    if not doc:
        return pd.DataFrame(columns=['open', 'high', 'low', 'close'])
    proj = {'data': 1}
    if days is not None and doc.get('last_available_date'):
        cutoff = doc['last_available_date'] - timedelta(days=days)
        proj = {'data': {'$filter': {'input': '$data', 'as': 'p', 'cond': {'$gte': ['$$p.date_obj', cutoff]}}}}
    rows = []
    async for d in coll.aggregate([{'$match': key}, {'$project': proj}]):
        rows = d.get('data') or []
    if not rows:
        return pd.DataFrame(columns=['open', 'high', 'low', 'close'])
    df = pd.DataFrame([{'ts': r['date_obj'], 'open': r.get('open', r['close']), 'high': r.get('high', r['close']),
                        'low': r.get('low', r['close']), 'close': r['close']} for r in rows if r.get('date_obj')])
    df = df.drop_duplicates('ts', keep='last').set_index('ts').sort_index()
    return df[df.index.dayofweek < 5]


# ── Intraday (Trading Economics, on view, stored at 1-minute resolution) ─────

def _parse_te_time(value: str) -> Optional[datetime]:
    if not value:
        return None
    for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M:%S.%f', '%Y-%m-%d %H:%M:%S', '%d/%m/%Y %H:%M:%S', '%d/%m/%Y %H:%M'):
        try:
            return datetime.strptime(value.replace('Z', '').split('+')[0], fmt)
        except ValueError:
            continue
    return None


# Trading Economics /markets/intraday limits (docs.tradingeconomics.com/markets/intraday):
# - at most 10,000 underlying 1-minute records per request (aggregation doesn't raise this)
# - at most 30 days per date-range request, at most 5 tickers per request
# - comma-separated tickers are documented for the "latest" form; with d1 only single tickers are
#   shown, so combined requests are tried for small top-ups and verified (see _refresh_intraday)
TE_MAX_RECORDS = 10000
TE_MAX_DAYS = 30
TE_MAX_SYMBOLS = 5
COMBINED_MAX_MINUTES = 8000     # stay under the record cap with margin when combining tickers
GLOBAL_META = {'country': '__intraday__', 'maturity': '__settings__'}


def _weekday_minutes(start: datetime, end: datetime) -> float:
    """Minutes between start and end that fall on Monday-Friday (no bars at weekends)."""
    total, cur = 0.0, start
    while cur < end:
        nxt = min(datetime(cur.year, cur.month, cur.day) + timedelta(days=1), end)
        if cur.weekday() < 5:
            total += (nxt - cur).total_seconds() / 60
        cur = nxt
    return total


def _fetch_te_intraday(symbols: List[str], since: datetime) -> Tuple[List[Dict], Optional[str]]:
    """One request (1-minute bars since `since`). Returns (rows, error). Blocking - run in an executor."""
    url = f"{te.TE_BASE_URL}/markets/intraday/{','.join(symbols)}"
    params = {'c': te.TE_API_KEY, 'd1': since.strftime('%Y-%m-%d %H:%M'), 'agr': '1m', 'f': 'json'}
    try:
        resp = requests.get(url, params=params, timeout=45)
    except Exception as e:
        return [], f"Could not reach Trading Economics: {e}"
    if resp.status_code != 200:
        return [], f"Trading Economics {resp.status_code}: {resp.text[:200]}"
    try:
        data = resp.json()
    except ValueError:
        return [], f"Trading Economics: {resp.text[:200]}"  # e.g. plan/quota message returned as text
    if not isinstance(data, list):
        return [], f"Trading Economics: {str(data)[:200]}"
    return data, None


def _fetch_symbol_paged(symbol: str, since: datetime, max_pages: int = 4) -> Tuple[List[Dict], Optional[str]]:
    """Single-ticker fetch that continues from the last bar when a response hits the record cap."""
    rows_all, cursor = [], since
    for _ in range(max_pages):
        rows, error = _fetch_te_intraday([symbol], cursor)
        if error:
            return rows_all, error
        rows_all += rows
        if len(rows) < TE_MAX_RECORDS - 10:
            break
        last = max((_parse_te_time(r.get('Date') or r.get('DateTime')) for r in rows), default=None)
        if not last or last <= cursor:
            break
        cursor = last + timedelta(minutes=1)
    return rows_all, None


async def _refresh_intraday(series: Tuple[Tuple[str, str], ...]):
    meta = _intraday_meta_coll()
    now = datetime.utcnow()
    oldest_allowed = _intraday_window_start(now)   # hard cap: last day only
    stale = []  # (country, maturity, symbol, since)
    for country, maturity in series:
        symbol = te.BOND_SYMBOLS.get(country, {}).get(maturity)
        if not symbol:
            continue
        m = await meta.find_one({'country': country, 'maturity': maturity}) or {}
        attempt = m.get('last_fetch_attempt')
        if attempt and (now - attempt).total_seconds() < INTRADAY_REFRESH_MINUTES * 60:
            continue
        since = m.get('last_ts')
        since = max(since + timedelta(minutes=1), oldest_allowed) if since else oldest_allowed
        stale.append((country, maturity, symbol, since))
    if not stale:
        return

    for country, maturity, symbol, _ in stale:
        await meta.update_one({'country': country, 'maturity': maturity},
                              {'$set': {'last_fetch_attempt': now, 'symbol': symbol}}, upsert=True)

    settings = await meta.find_one(GLOBAL_META) or {}
    combined_ok = settings.get('combined_supported')      # None = not yet known
    by_symbol = {symbol: (country, maturity) for country, maturity, symbol, _ in stale}
    since_of = {symbol: since for _, _, symbol, since in stale}
    loop = asyncio.get_running_loop()
    rows, errors = [], {}

    # Small top-ups for several tickers: one combined request (if not known to be unsupported)
    # upper bound on 1-minute records a combined request could return (weekday minutes only)
    minutes = sum(_weekday_minutes(since_of[s], now) for s in by_symbol)
    singles = list(by_symbol)
    if len(by_symbol) > 1 and combined_ok is not False and minutes <= COMBINED_MAX_MINUTES:
        group = list(by_symbol)[:TE_MAX_SYMBOLS]
        got, error = await loop.run_in_executor(None, _fetch_te_intraday, group, min(since_of[s] for s in group))
        returned = {(r.get('Symbol') or '').upper() for r in got}
        if error:
            errors.update({s: error for s in group})
            singles = []                      # don't retry individually on a quota / plan error
        else:
            rows += got
            if len(returned) >= 2:
                if combined_ok is not True:
                    await meta.update_one(GLOBAL_META, {'$set': {'combined_supported': True}}, upsert=True)
                singles = [s for s in by_symbol if s not in group]
            elif len(returned) == 1:
                # Only the first ticker came back: multi-ticker with a start date isn't supported
                await meta.update_one(GLOBAL_META, {'$set': {'combined_supported': False}}, upsert=True)
                singles = [s for s in by_symbol if s.upper() not in returned]
            else:
                singles = [s for s in by_symbol if s not in group]  # nothing yet (e.g. weekend) - inconclusive

    # First load of a series, or larger gaps: one ticker per request (fits the 10,000-record cap)
    for symbol in singles:
        got, error = await loop.run_in_executor(None, _fetch_symbol_paged, symbol, since_of[symbol])
        rows += got
        if error:
            errors[symbol] = error
            if 'exceeded' in error.lower() or 'subscription' in error.lower():
                # quota / plan problem - stop, it won't succeed for the rest either
                errors.update({s: error for s in singles if s not in errors})
                break

    ops, newest = [], {}
    upper = {k.upper(): v for k, v in by_symbol.items()}
    for row in rows:
        target = upper.get((row.get('Symbol') or '').upper())
        ts = _parse_te_time(row.get('Date') or row.get('DateTime'))
        close = row.get('Close')
        if not target or ts is None or close is None:
            continue
        country, maturity = target
        bar = {'open': row.get('Open', close), 'high': row.get('High', close), 'low': row.get('Low', close), 'close': close}
        ops.append(UpdateOne({'country': country, 'maturity': maturity, 'ts': ts},
                             {'$set': {**{k: float(v) for k, v in bar.items()}, 'symbol': row.get('Symbol')}},
                             upsert=True))
        newest[target] = max(newest.get(target, ts), ts)

    if ops:
        await _intraday_coll().bulk_write(ops, ordered=False)
        await _intraday_coll().delete_many({'ts': {'$lt': now - timedelta(days=INTRADAY_RETENTION_DAYS)}})
        invalidate('bond-series')
    for (country, maturity), ts in newest.items():
        await meta.update_one({'country': country, 'maturity': maturity}, {'$set': {'last_ts': ts}})
    for country, maturity, symbol, _ in stale:
        err = None if (country, maturity) in newest else (errors.get(symbol) or 'No intraday data returned')
        await meta.update_one({'country': country, 'maturity': maturity}, {'$set': {'last_error': err}})
    summary = '; '.join(sorted(set(errors.values())))[:200]
    print(f"{'✓' if ops else '✗'} Intraday refresh ({', '.join(by_symbol)}): {len(ops)} bars{' - ' + summary if summary else ''}")


async def ensure_intraday_fresh(series: List[Tuple[str, str]]):
    key = tuple(sorted(series))
    try:
        await cached(('intraday-refresh', key), 60, lambda: _refresh_intraday(key))
    except Exception as e:
        print(f"✗ Intraday refresh failed: {e}")


async def _intraday_frame(country: str, maturity: str, days: int) -> pd.DataFrame:
    coll = _intraday_coll()
    latest = await coll.find_one({'country': country, 'maturity': maturity}, sort=[('ts', -1)])
    if not latest:
        return pd.DataFrame(columns=['open', 'high', 'low', 'close'])
    cutoff = latest['ts'] - timedelta(days=days)
    rows = await coll.find({'country': country, 'maturity': maturity, 'ts': {'$gte': cutoff}},
                           {'_id': 0, 'ts': 1, 'open': 1, 'high': 1, 'low': 1, 'close': 1}).sort('ts', 1).to_list(None)
    df = pd.DataFrame(rows)
    return df.set_index('ts') if not df.empty else pd.DataFrame(columns=['open', 'high', 'low', 'close'])


# ── Public entry point ───────────────────────────────────────────────────────

async def get_bond_series(series: List[Tuple[str, str]], range_key: str, interval: str) -> Dict:
    range_key = range_key.upper()
    if range_key not in RANGES:
        raise ValueError(f"Unknown period {range_key}")
    if interval not in ALLOWED[range_key]:
        raise ValueError(f"{interval} candles aren't offered for {range_key}. Choose one of: {', '.join(ALLOWED[range_key])}")
    intraday = interval in INTRADAY_MINUTES
    days = RANGES[range_key]

    if intraday:
        await ensure_intraday_fresh(series)
    else:
        from on_demand_refresh import ensure_bond_fresh
        await asyncio.gather(*(ensure_bond_fresh(c, m) for c, m in series))

    async def build():
        out, notes = {}, {}
        for country, maturity in series:
            if intraday:
                df = await _intraday_frame(country, maturity, days)
                df = _resample(df, None if interval == '1m' else f"{INTRADAY_MINUTES[interval]}min")
                m = await _intraday_meta_coll().find_one({'country': country, 'maturity': maturity}) or {}
                first = await _intraday_coll().find_one({'country': country, 'maturity': maturity}, sort=[('ts', 1)])
                notes[f"{country}:{maturity}"] = {
                    'intraday_since': first['ts'].strftime('%Y-%m-%dT%H:%M:%SZ') if first else None,
                    'last_error': m.get('last_error'),
                    'has_ticker': bool(te.BOND_SYMBOLS.get(country, {}).get(maturity)),
                }
            else:
                df = _resample(await _daily_frame(country, maturity, days), DAILY_RULES[interval])
            out[f"{country}:{maturity}"] = _to_points(df, intraday)
        return {'range': range_key, 'interval': interval, 'intraday': intraday, 'series': out, 'notes': notes}

    ttl = 60 if intraday else 600
    return await cached(('bond-series', tuple(sorted(series)), range_key, interval), ttl, build)
