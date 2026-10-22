"""
MA Cross backtest - find the best EMA fast/slow combination per currency pair.

Rules (match how the alerts are used):
- Daily candles, weekends dropped (same as the chart and the live MA Cross alerts).
- EMA with SMA seed (same formula as IndicatorCalculator.calculate_ema).
- Always in the market: long while EMA fast > EMA slow, short while EMA fast < EMA slow.
  The position is decided on a day's close and held over the next day.
- Every change of position pays cost_bps per side (a long->short flip pays twice).

Overfitting guard: combinations are ranked on the first part of the history (train) and
judged on the rest (test), which the ranking never saw. The ranking uses each combo's
neighbourhood-average train Sharpe, so a stable region of good settings wins over a lone spike.
"""

import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

FAST_RANGE = range(3, 21)      # 3..20
SLOW_RANGE = range(10, 61)     # 10..60
BASELINE = (9, 21)             # current live alert settings
TRADING_DAYS = 252
MIN_TRAIN_TRADES = 3           # ignore combos that barely trade in the train window
TOP_N = 10
EQUITY_POINTS = 400            # downsample equity curves for the chart


def fetch_daily_closes(client, symbol: str, years: int) -> pd.Series:
    """Daily closes from the market data API (blocking - run in an executor). Weekends dropped."""
    end = datetime.utcnow()
    start = end - timedelta(days=int(years * 365.25) + 120)  # + warm-up for the slowest EMA
    rows = []
    for agg in client.list_aggs(ticker=symbol, multiplier=1, timespan="day",
                                from_=start.strftime('%Y-%m-%d'), to=end.strftime('%Y-%m-%d'),
                                adjusted=True, sort="asc", limit=50000):
        rows.append((agg.timestamp, agg.close))
    if not rows:
        return pd.Series(dtype=float)
    s = pd.Series([r[1] for r in rows], index=pd.to_datetime([r[0] for r in rows], unit='ms'))
    s = s[~s.index.duplicated(keep='last')].sort_index()
    return s[s.index.dayofweek < 5].astype(float)


def _ema(closes: np.ndarray, period: int) -> np.ndarray:
    out = np.full(len(closes), np.nan)
    if len(closes) < period:
        return out
    out[period - 1] = closes[:period].mean()
    k = 2.0 / (period + 1)
    for i in range(period, len(closes)):
        out[i] = (closes[i] - out[i - 1]) * k + out[i - 1]
    return out


def _metrics(strat: np.ndarray, pos: np.ndarray) -> Dict:
    """Performance of one window. strat: daily strategy returns, pos: position held for each return."""
    n = len(strat)
    if n < 2:
        return {'total_return': None, 'cagr': None, 'sharpe': None, 'max_drawdown': None,
                'trades': 0, 'win_rate': None, 'days': n}
    equity = np.cumprod(1.0 + strat)
    total = equity[-1] - 1.0
    years = n / TRADING_DAYS
    cagr = (equity[-1] ** (1 / years) - 1.0) if equity[-1] > 0 and years > 0 else -1.0
    std = strat.std(ddof=1)
    sharpe = float(strat.mean() / std * math.sqrt(TRADING_DAYS)) if std > 0 else 0.0
    peak = np.maximum.accumulate(np.concatenate([[1.0], equity]))[1:]
    max_dd = float((equity / peak - 1.0).min())

    # Trades = runs of constant position; a trade wins if its compounded return is positive
    starts = np.flatnonzero(np.concatenate([[True], pos[1:] != pos[:-1]]))
    log_r = np.log1p(np.clip(strat, -0.999999, None))
    trade_r = np.add.reduceat(log_r, starts)
    wins = int((trade_r > 0).sum())
    return {
        'total_return': float(total),
        'cagr': float(cagr),
        'sharpe': sharpe,
        'max_drawdown': max_dd,
        'trades': int(len(starts)),
        'win_rate': wins / len(starts) if len(starts) else None,
        'days': n,
    }


def _downsample(idx: np.ndarray, n: int) -> np.ndarray:
    if len(idx) <= n:
        return idx
    pick = np.linspace(0, len(idx) - 1, n).round().astype(int)
    return idx[np.unique(pick)]


def run_backtest(symbol: str, closes: pd.Series, cost_bps: float = 1.0, test_fraction: float = 0.3) -> Dict:
    """Grid-search EMA fast/slow combos on one pair's daily closes."""
    max_slow = max(SLOW_RANGE)
    if len(closes) < max_slow + 120:
        raise ValueError(f"Not enough daily history for {symbol} ({len(closes)} bars)")

    c = closes.values
    dates = closes.index
    ret = np.zeros(len(c))
    ret[1:] = c[1:] / c[:-1] - 1.0
    cost = cost_bps / 10000.0

    emas = {p: _ema(c, p) for p in sorted(set(FAST_RANGE) | set(SLOW_RANGE))}

    # Common evaluation window so every combo is judged on the same days
    start = max_slow                      # first index where every EMA (up to 60) is defined
    end = len(c)                          # returns at t use the position decided at t-1
    split = start + int((end - start) * (1 - test_fraction))

    def simulate(fast: int, slow: int):
        diff = emas[fast] - emas[slow]
        side = np.sign(diff)
        # carry the previous side through exact ties / undefined values
        side = pd.Series(np.where(np.isnan(diff), np.nan, np.where(side == 0, np.nan, side))).ffill().fillna(0).values
        held = np.zeros(len(c))
        held[1:] = side[:-1]              # position decided at yesterday's close
        turnover = np.zeros(len(c))
        turnover[1:] = np.abs(held[1:] - held[:-1])
        strat = held * ret - turnover * cost
        return strat, held

    def window(strat, held, a, b):
        return _metrics(strat[a:b], held[a:b])

    fasts, slows = list(FAST_RANGE), list(SLOW_RANGE)
    train_grid = [[None] * len(slows) for _ in fasts]
    test_grid = [[None] * len(slows) for _ in fasts]
    combos = []
    for fi, f in enumerate(fasts):
        for si, s in enumerate(slows):
            if f >= s:
                continue
            strat, held = simulate(f, s)
            tr = window(strat, held, start + 1, split)
            te = window(strat, held, split, end)
            train_grid[fi][si] = round(tr['sharpe'], 3)
            test_grid[fi][si] = round(te['sharpe'], 3)
            combos.append({'fast': f, 'slow': s, 'train': tr, 'test': te})

    # Rank on the neighbourhood-average train Sharpe (fast +/-1, slow +/-2): a combo sitting on a
    # plateau of good settings generalises better than an isolated lucky spike.
    fi_of = {f: i for i, f in enumerate(fasts)}
    si_of = {s: i for i, s in enumerate(slows)}
    for x in combos:
        fi, si = fi_of[x['fast']], si_of[x['slow']]
        hood = [train_grid[a][b]
                for a in range(max(fi - 1, 0), min(fi + 2, len(fasts)))
                for b in range(max(si - 2, 0), min(si + 3, len(slows)))
                if train_grid[a][b] is not None]
        x['train']['sharpe_smoothed'] = float(np.mean(hood)) if hood else x['train']['sharpe']

    eligible = [x for x in combos if x['train']['trades'] >= MIN_TRAIN_TRADES] or combos
    ranked = sorted(eligible, key=lambda x: x['train']['sharpe_smoothed'], reverse=True)
    best = ranked[0]
    baseline = next(x for x in combos if (x['fast'], x['slow']) == BASELINE)

    def with_full(combo):
        strat, held = simulate(combo['fast'], combo['slow'])
        return {**combo, 'full': window(strat, held, start + 1, end)}

    best = with_full(best)
    baseline = with_full(baseline)

    # Equity curves (best vs baseline vs buy & hold), downsampled for the chart
    b_strat, _ = simulate(best['fast'], best['slow'])
    base_strat, _ = simulate(*BASELINE)
    seg = slice(start + 1, end)
    eq_best = np.cumprod(1 + b_strat[seg])
    eq_base = np.cumprod(1 + base_strat[seg])
    eq_hold = c[seg] / c[start]
    pick = _downsample(np.arange(len(eq_best)), EQUITY_POINTS)
    seg_dates = dates[seg]

    return {
        'symbol': symbol,
        'bars': int(len(c)),
        'start_date': dates[start + 1].strftime('%Y-%m-%d'),
        'split_date': dates[split].strftime('%Y-%m-%d'),
        'end_date': dates[-1].strftime('%Y-%m-%d'),
        'cost_bps': cost_bps,
        'test_fraction': test_fraction,
        'combos_tested': len(combos),
        'best': best,
        'baseline': baseline,
        'beats_baseline_out_of_sample': (best['test']['sharpe'] or 0) > (baseline['test']['sharpe'] or 0),
        'top': [{'fast': x['fast'], 'slow': x['slow'], 'train': x['train'], 'test': x['test']} for x in ranked[:TOP_N]],
        'heatmap': {'fast': fasts, 'slow': slows, 'train_sharpe': train_grid, 'test_sharpe': test_grid},
        'equity': {
            'dates': [seg_dates[i].strftime('%Y-%m-%d') for i in pick],
            'best': [round(float(eq_best[i]), 5) for i in pick],
            'baseline': [round(float(eq_base[i]), 5) for i in pick],
            'buy_hold': [round(float(eq_hold[i]), 5) for i in pick],
        },
    }
