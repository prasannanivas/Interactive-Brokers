"""
Rebuild stored signal history from price candles with the current rules.

Recomputes, per watchlist symbol, using IndicatorCalculator (same engine as the live monitor):
  - daily_signal_snapshots: one snapshot per day (weekdays + any existing dates), as of that
    day's daily close, using the same lookback windows the live monitor fetches
  - indicator_states (change log):
      * Daily/Weekly indicators: one entry per change at a daily close
      * Hourly EMA 100: one entry per change at an hourly close
    Existing log entries from --start onward (created before the run) are replaced.

Dry run by default; pass --write to modify the database. Back up first, e.g.
  db.daily_signal_snapshots.aggregate([{$out: 'daily_signal_snapshots_backup_YYYYMMDD'}])

Usage:
  python rebuild_signal_history.py [--start 2025-01-01] [--end YYYY-MM-DD] [--write]
"""
import argparse
import os
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timedelta, timezone

import pandas as pd
import pytz
from bson import ObjectId
from dotenv import load_dotenv
from polygon import RESTClient
from pymongo import MongoClient, InsertOne

from indicator_calculator import IndicatorCalculator as IC

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))

# Lookbacks the live monitor fetches (massive_monitor_v2.py)
DAILY_DAYS, HOURLY_DAYS, WEEKLY_DAYS = 600, 30, 210
EST = pytz.timezone('US/Eastern')

DAILY_NAMES = {'rsi_9': 'RSI 9', 'ema_9': 'EMA 9', 'ema_20': 'EMA 20', 'ema_50': 'EMA 50',
               'ema_200': 'EMA 200', 'ma_crossover': 'MA Crossover', 'macd': 'MACD'}
WEEKLY_NAMES = {'ema_20': 'EMA 20', 'bollinger_band': 'Bollinger Band'}


def _bars(client, symbol, timespan, start, end):
    rows = [{'t': a.timestamp, 'close': a.close} for a in client.list_aggs(
        ticker=symbol, multiplier=1, timespan=timespan, from_=start.strftime('%Y-%m-%d'),
        to=end.strftime('%Y-%m-%d'), adjusted=True, sort='asc', limit=50000)]
    if not rows:
        return pd.Series(dtype=float)
    s = pd.Series([r['close'] for r in rows], index=pd.to_datetime([r['t'] for r in rows], unit='ms'))
    return s[~s.index.duplicated(keep='last')]


def _signal(ind):
    return (ind or {}).get('signal')


def compute_symbol(symbol, start, end, api_key):
    """Per-day indicator results, daily/weekly change entries and hourly EMA 100 change entries."""
    client = RESTClient(api_key)
    daily = _bars(client, symbol, 'day', start - timedelta(days=DAILY_DAYS + 30), end)
    weekly = _bars(client, symbol, 'week', start - timedelta(days=WEEKLY_DAYS + 60), end)
    hourly = _bars(client, symbol, 'hour', start - timedelta(days=60), end + timedelta(days=1))
    daily = daily[(daily.index.dayofweek < 5) & (daily.index <= pd.Timestamp(end))]
    if daily.empty:
        return symbol, {}, [], []

    per_day, changes, prev = {}, [], None
    for bar_day in daily.index[daily.index >= pd.Timestamp(start) - pd.Timedelta(days=14)]:
        price = float(daily[bar_day])
        win = daily[daily.index >= bar_day - pd.Timedelta(days=DAILY_DAYS)]
        win = win[win.index <= bar_day].to_frame('close')
        di = IC.calculate_all_daily_indicators(win, price) or {}

        h = hourly[(hourly.index >= bar_day - pd.Timedelta(days=HOURLY_DAYS)) &
                   (hourly.index < bar_day + pd.Timedelta(days=1))]
        hi = IC.calculate_all_hourly_indicators(h.to_frame('close'), price) if len(h) else None

        # Weekly bars are stamped at week start; the forming week's close is this day's close
        wk = weekly[(weekly.index >= bar_day - pd.Timedelta(days=WEEKLY_DAYS)) & (weekly.index <= bar_day)].copy()
        wi = None
        if len(wk):
            wk.iloc[-1] = price
            wi = IC.calculate_all_weekly_indicators(wk.to_frame('close'), price)

        buy, sell = IC.extract_signals(di, hi, wi)
        strength = len(buy) - len(sell)
        per_day[bar_day.date()] = {
            'symbol': symbol,
            'last_price': price,
            'signal_type': 'BULLISH' if strength > 0 else 'BEARISH' if strength < 0 else 'NEUTRAL',
            'signal_strength': strength,
            'buy_signals': buy,
            'sell_signals': sell,
            'daily_indicators': di or None,
            'hourly_indicators': hi,
            'weekly_indicators': wi,
        }

        states = {(n, 'Daily'): _signal(di.get(k)) for k, n in DAILY_NAMES.items() if di.get(k)}
        for k, n in WEEKLY_NAMES.items():
            if wi and wi.get(k):
                states[(n, 'Weekly')] = _signal(wi[k])
        if prev is not None and bar_day >= pd.Timestamp(start):
            for key, sig in states.items():
                if key in prev and prev[key] != sig:
                    changes.append({'symbol': symbol, 'indicator': key[0], 'timeframe': key[1],
                                    'old_signal': prev[key], 'new_signal': sig,
                                    'timestamp': bar_day.to_pydatetime() + timedelta(hours=23, minutes=59, seconds=59),
                                    'price': price, 'source': 'candles_rebuild'})
        prev = states

    # Hourly EMA 100 (SMA-seeded, as IndicatorCalculator.calculate_ema) vs each closed hourly bar
    hourly_changes = []
    closes = hourly.tolist()
    if len(closes) > 100:
        k = 2 / 101
        ema = sum(closes[:100]) / 100
        prev_sig = 'BUY' if closes[99] > ema else 'SELL' if closes[99] < ema else None
        for i in range(100, len(closes)):
            ema = (closes[i] - ema) * k + ema
            sig = 'BUY' if closes[i] > ema else 'SELL' if closes[i] < ema else None
            bar_close = hourly.index[i].to_pydatetime() + timedelta(hours=1)
            if sig != prev_sig and pd.Timestamp(start) <= hourly.index[i] and bar_close <= datetime.utcnow():
                hourly_changes.append({'symbol': symbol, 'indicator': 'EMA 100', 'timeframe': 'Hourly',
                                       'old_signal': prev_sig, 'new_signal': sig, 'timestamp': bar_close,
                                       'price': float(closes[i]), 'source': 'candles_rebuild'})
            prev_sig = sig

    return symbol, per_day, changes, hourly_changes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--start', default='2025-01-01')
    ap.add_argument('--end', help='last daily close to include (default: last completed UTC day)')
    ap.add_argument('--write', action='store_true')
    args = ap.parse_args()

    run_started = datetime.now(timezone.utc)
    start = datetime.strptime(args.start, '%Y-%m-%d')
    end = (datetime.strptime(args.end, '%Y-%m-%d') if args.end
           else datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1))

    db = MongoClient(os.getenv('MONGODB_URL'))[os.getenv('MONGODB_DB_NAME')]
    symbols = [d['symbol'] for d in db.watchlist.find({}, {'symbol': 1})]
    print(f'Rebuilding {start.date()} .. {end.date()} for {len(symbols)} symbols ({"WRITE" if args.write else "dry run"})')

    results = {}
    with ProcessPoolExecutor(max_workers=min(8, os.cpu_count() or 4)) as pool:
        futures = [pool.submit(compute_symbol, s, start, end, os.getenv('MASSIVE_API_KEY')) for s in symbols]
        for f in futures:
            sym, per_day, changes, hourly_changes = f.result()
            results[sym] = (per_day, changes, hourly_changes)
            print(f'  {sym:10} days={len(per_day):4} daily/weekly changes={len(changes):5} hourly changes={len(hourly_changes):5}')

    # Snapshot dates: every weekday in range plus any existing snapshot dates (e.g. weekend captures)
    snap_dates = set()
    d = start
    while d <= end:
        if d.weekday() < 5:
            snap_dates.add(d.date())
        d += timedelta(days=1)
    for doc in db.daily_signal_snapshots.find({}, {'snapshot_date': 1}):
        local = doc['snapshot_date'].replace(tzinfo=timezone.utc).astimezone(EST).date()
        if start.date() <= local <= end.date():
            snap_dates.add(local)

    snapshots = []
    for day in sorted(snap_dates):
        signals = []
        for sym in symbols:
            per_day = results[sym][0]
            available = [k for k in per_day if k <= day]
            if available:
                signals.append(per_day[max(available)])
        if not signals:
            continue
        snap_utc = EST.localize(datetime(day.year, day.month, day.day, 17)).astimezone(timezone.utc)
        snapshots.append({
            'snapshot_date': snap_utc,
            'capture_timestamp': run_started,
            'total_symbols': len(signals),
            'bullish_count': sum(s['signal_type'] == 'BULLISH' for s in signals),
            'bearish_count': sum(s['signal_type'] == 'BEARISH' for s in signals),
            'neutral_count': sum(s['signal_type'] == 'NEUTRAL' for s in signals),
            'signals': signals,
            'rebuilt_from_candles': True,
        })

    replace_filter = {'_id': {'$lt': ObjectId.from_datetime(run_started)}, 'timestamp': {'$gte': start}}
    log_entries = [e for (_, ch, hch) in results.values() for e in ch + hch]
    print(f'\nSnapshots to upsert: {len(snapshots)} | change-log entries to insert: {len(log_entries)} '
          f'(replacing {db.indicator_states.count_documents(replace_filter)})')

    if not args.write:
        print('Dry run - nothing written.')
        return

    for snap in snapshots:
        db.daily_signal_snapshots.update_one({'snapshot_date': snap['snapshot_date']}, {'$set': snap}, upsert=True)
    print(f'✓ Upserted {len(snapshots)} snapshots')

    deleted = db.indicator_states.delete_many(replace_filter).deleted_count
    for i in range(0, len(log_entries), 5000):
        db.indicator_states.bulk_write([InsertOne(e) for e in log_entries[i:i + 5000]], ordered=False)
    print(f'✓ Replaced {deleted} change-log entries with {len(log_entries)} rebuilt entries')


if __name__ == '__main__':
    main()
