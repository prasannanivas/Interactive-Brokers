"""
Offline regression tests for the signal engine (indicator_calculator.py).

No network / DB needed. Run from backend/:  python -m pytest
"""
import inspect
import math

import numpy as np
import pandas as pd
import pytest

from indicator_calculator import IndicatorCalculator as IC


# ---------------------------------------------------------------- helpers

def weekday_series(values, start="2025-01-06"):
    """Closes indexed on consecutive weekdays (Mon-Fri), like cleaned forex daily bars."""
    idx = pd.bdate_range(start=start, periods=len(values))
    return pd.Series(values, index=idx, dtype=float)


def calendar_frame(n_days, start="2025-01-01", seed=1):
    """Daily OHLC frame on every calendar day, incl. Sat/Sun (as the data feed returns)."""
    rng = np.random.default_rng(seed)
    idx = pd.date_range(start=start, periods=n_days, freq="D")
    close = 1.30 + np.cumsum(rng.normal(0, 0.003, n_days))
    return pd.DataFrame({"open": close, "high": close, "low": close, "close": close, "volume": 0}, index=idx)


def reference_wilder_rsi(closes, period):
    """Line-for-line port of frontend/src/utils/indicatorUtils.js calculateRSI (the chart)."""
    gains = losses = 0.0
    for i in range(1, period + 1):
        ch = closes[i] - closes[i - 1]
        if ch > 0:
            gains += ch
        else:
            losses -= ch
    ag, al = gains / period, losses / period
    out = [100 - 100 / (1 + ag / al)]
    for i in range(period + 1, len(closes)):
        ch = closes[i] - closes[i - 1]
        ag = (ag * (period - 1) + max(ch, 0)) / period
        al = (al * (period - 1) + max(-ch, 0)) / period
        out.append(100 - 100 / (1 + ag / al))
    return out


# ---------------------------------------------------------------- RSI

class TestRSI:
    def test_matches_dashboard_chart_formula(self):
        closes = list(1.35 + np.cumsum(np.random.default_rng(7).normal(0, 0.004, 300)))
        series = IC.calculate_rsi_series(weekday_series(closes), 9).dropna().tolist()
        ref = reference_wilder_rsi(closes, 9)
        assert len(series) == len(ref)
        assert series == pytest.approx(ref, abs=1e-9)

    def test_regression_late_rally_is_not_overbought_sell(self):
        """
        USDCAD 11-Nov-2026: long chop then a sharp rally. The old rolling-mean RSI
        printed 84 (SELL) while TradingView/the chart showed ~73 (NEUTRAL).
        A sharp burst after a downtrend must not trip the >80 SELL on Wilder's RSI
        just because the last 9 bars are mostly green.
        """
        down = list(np.linspace(1.42, 1.37, 40))
        rally = [1.37, 1.372, 1.371, 1.375, 1.378, 1.377, 1.381, 1.385, 1.388, 1.392]
        closes = weekday_series(down + rally)

        # Old formula for comparison - shows the bug existed for this shape
        d = closes.diff()
        old = 100 - 100 / (1 + d.clip(lower=0).rolling(9).mean() / (-d.clip(upper=0)).rolling(9).mean())
        assert old.iloc[-1] > 80

        result = IC.calculate_rsi(closes, 9)
        assert result["rsi_value"] < 80
        assert result["signal"] != "SELL"

    @pytest.mark.parametrize("closes,expected", [
        (list(np.linspace(1.0, 2.0, 30)), 100.0),   # only gains
        (list(np.linspace(2.0, 1.0, 30)), 0.0),     # only losses
        ([1.5] * 30, 50.0),                         # flat - no division blow-up
    ])
    def test_edge_cases(self, closes, expected):
        assert IC.calculate_rsi(weekday_series(closes), 9)["rsi_value"] == expected

    def test_bounds(self):
        closes = weekday_series(1 + np.cumsum(np.random.default_rng(3).normal(0, 0.01, 500)))
        rsi = IC.calculate_rsi_series(closes, 9).dropna()
        assert ((rsi >= 0) & (rsi <= 100)).all()

    def test_not_enough_data(self):
        assert IC.calculate_rsi(weekday_series([1.0] * 9), 9) is None

    @pytest.mark.parametrize("rsi_target,signal", [(85, "SELL"), (60, None), (30, "BUY")])
    def test_thresholds(self, monkeypatch, rsi_target, signal):
        # Trading Rules.xlsx: RSI(9) > 80 SELL, < 40 BUY, otherwise neutral
        fake = pd.Series([float(rsi_target)])
        monkeypatch.setattr(IC, "calculate_rsi_series", staticmethod(lambda p, n=9: fake))
        assert IC.calculate_rsi(weekday_series([1.0] * 20), 9)["signal"] == signal


# ---------------------------------------------------------------- EMA / EMA 200

class TestEMA:
    def test_sma_seed_then_recursive(self):
        closes = weekday_series(np.arange(1, 31, dtype=float))
        ema = IC.calculate_ema(closes, 10)
        assert ema.iloc[:9].isna().all()
        assert ema.iloc[9] == pytest.approx(np.mean(np.arange(1, 11)))
        k = 2 / 11
        expected = ema.iloc[9]
        for v in range(11, 31):
            expected = (v - expected) * k + expected
        assert ema.iloc[-1] == pytest.approx(expected)

    def test_ema200_needs_200_bars(self):
        assert IC.calculate_ema_indicator(weekday_series([1.0] * 199), 200, 1.0) is None
        assert IC.calculate_ema_indicator(weekday_series([1.0] * 200), 200, 1.0) is not None

    @pytest.mark.parametrize("price,signal", [(1.5, "BUY"), (0.5, "SELL")])
    def test_ema_signal_direction(self, price, signal):
        assert IC.calculate_ema_indicator(weekday_series([1.0] * 250), 200, price)["signal"] == signal

    def test_250_calendar_days_is_not_enough_for_ema200(self):
        """Why EMA 200 showed N/A: 250 calendar days -> ~178 weekday bars after dropping weekends."""
        ind = IC.calculate_all_daily_indicators(calendar_frame(250), 1.3)
        assert ind["ema_200"] is None

    def test_600_calendar_days_gives_ema200(self):
        ind = IC.calculate_all_daily_indicators(calendar_frame(600), 1.3)
        assert ind["ema_200"] is not None
        assert ind["ema_200"]["signal"] in ("BUY", "SELL")

    def test_monitor_fetches_enough_daily_history(self):
        """Guard against the fetch window being shrunk back below what EMA 200 needs."""
        from massive_monitor_v2 import MassiveMonitorV2
        days = inspect.signature(MassiveMonitorV2._fetch_daily_data).parameters["days"].default
        weekday_bars = days * 5 / 7 - 12  # minus ~holidays
        assert weekday_bars >= 260, f"{days} calendar days only gives ~{weekday_bars:.0f} bars"


# ---------------------------------------------------------------- Bollinger (20, 2, 0) - EMA

class TestBollinger:
    def test_ema_middle_population_std(self):
        closes = weekday_series(1.3 + np.cumsum(np.random.default_rng(9).normal(0, 0.004, 120)))
        r = IC.calculate_bollinger_bands(closes, 20, 2)
        mid = IC.calculate_ema(closes, 20).iloc[-1]
        std = float(np.std(closes.iloc[-20:].to_numpy()))  # numpy default ddof=0 = population
        assert r["middle_band"] == pytest.approx(mid, abs=1e-6)
        assert r["upper_band"] == pytest.approx(mid + 2 * std, abs=1e-6)
        assert r["lower_band"] == pytest.approx(mid - 2 * std, abs=1e-6)

    @pytest.mark.parametrize("spike,signal", [(1.0, "SELL"), (-1.0, "BUY"), (0.0, None)])
    def test_signal(self, spike, signal):
        base = list(1.3 + 0.001 * np.sin(np.arange(60)))
        base[-1] = base[-2] + spike * 0.05
        assert IC.calculate_bollinger_bands(weekday_series(base), 20, 2)["signal"] == signal

    def test_weekly_uses_bollinger(self):
        ind = IC.calculate_all_weekly_indicators(calendar_frame(300).iloc[::7], 1.3)
        assert set(ind) == {"bollinger_band", "ema_20"}


# ---------------------------------------------------------------- lookback windows

def test_monitor_windows_converge_every_ema():
    """Table, chart and history use the same windows, long enough for EMA 200 / weekly EMA 20 to converge."""
    import indicator_calculator as icm
    from massive_monitor_v2 import MassiveMonitorV2
    sig = lambda f: inspect.signature(f).parameters["days"].default
    assert sig(MassiveMonitorV2._fetch_daily_data) == icm.DAILY_LOOKBACK_DAYS
    assert sig(MassiveMonitorV2._fetch_hourly_data) == icm.HOURLY_LOOKBACK_DAYS
    assert sig(MassiveMonitorV2._fetch_weekly_data) == icm.WEEKLY_LOOKBACK_DAYS
    # seed weight left after N bars of EMA(p) = ((p-1)/(p+1))^(N-p); require < 0.1%
    left = lambda p, bars: ((p - 1) / (p + 1)) ** (bars - p)
    assert left(200, icm.DAILY_LOOKBACK_DAYS * 5 / 7 - 15) < 1e-3
    assert left(20, icm.WEEKLY_LOOKBACK_DAYS / 7) < 1e-3
    # thin pairs (e.g. EUR/ILS) print only ~10 hourly bars a day
    assert left(100, icm.HOURLY_LOOKBACK_DAYS * 10 * 5 / 7) < 1e-3


def test_ema_value_independent_of_window_start():
    df = calendar_frame(2400, start="2020-01-01")
    a = IC.calculate_all_daily_indicators(df.iloc[-1825:], 1.3)["ema_200"]["ema_value"]
    b = IC.calculate_all_daily_indicators(df.iloc[-2000:], 1.3)["ema_200"]["ema_value"]
    assert a == pytest.approx(b, rel=1e-5)


# ---------------------------------------------------------------- weekend handling

def test_weekend_bars_are_dropped():
    df = calendar_frame(600)
    df_with_spike = df.copy()
    sundays = df_with_spike.index.dayofweek == 6
    df_with_spike.loc[sundays, "close"] = 99.0   # junk Sunday bars must not leak in
    a = IC.calculate_all_daily_indicators(df, 1.3)
    b = IC.calculate_all_daily_indicators(df_with_spike, 1.3)
    for key in ("rsi_9", "ema_9", "ema_20", "ema_50", "ema_200", "macd"):
        assert a[key] == b[key] or {k: v for k, v in a[key].items() if k != "signal_timestamp"} == \
            {k: v for k, v in b[key].items() if k != "signal_timestamp"}, key


# ---------------------------------------------------------------- MA cross / MACD

class TestMACrossAndMACD:
    def test_ma_cross_detects_latest_cross(self):
        closes = weekday_series(list(np.linspace(2.0, 1.0, 60)) + list(np.linspace(1.0, 1.6, 30)))
        r = IC.calculate_ma_crossover(closes)
        assert r["signal"] == "BUY"
        assert r["last_cross_direction"] == "BUY"
        assert r["bars_since_cross"] is not None and r["bars_since_cross"] < 30

    def test_macd_uses_sma_seeded_emas(self):
        """Trading Rules: MACD 12,26,9 EMA - same SMA-seeded EMA as every other EMA (TradingView)."""
        closes = weekday_series(1.3 + np.cumsum(np.random.default_rng(5).normal(0, 0.004, 300)))
        r = IC.calculate_macd(closes)
        line = (IC.calculate_ema(closes, 12) - IC.calculate_ema(closes, 26)).dropna()
        sig = IC.calculate_ema(line, 9)
        assert r["macd_line"] == pytest.approx(line.iloc[-1], abs=1e-6)
        assert r["signal_line"] == pytest.approx(sig.iloc[-1], abs=1e-6)
        assert r["histogram"] == pytest.approx(line.iloc[-1] - sig.iloc[-1], abs=1e-6)

    def test_macd_sign_drives_signal(self):
        up = IC.calculate_macd(weekday_series(np.linspace(1.0, 2.0, 100)))
        down = IC.calculate_macd(weekday_series(np.linspace(2.0, 1.0, 100)))
        assert up["signal"] == "BUY" and up["macd_line"] > 0
        assert down["signal"] == "SELL" and down["macd_line"] < 0


# ---------------------------------------------------------------- signal aggregation

def test_extract_signals_counts():
    daily = {
        "rsi_9": {"signal": None},
        "ema_9": {"signal": "BUY"},
        "ema_20": {"signal": "SELL"},
        "ema_50": {"signal": "SELL"},
        "ema_200": None,                 # N/A must be neither buy nor sell
        "ma_crossover": {"signal": "BUY"},
        "macd": {"signal": "SELL"},
    }
    hourly = {"ema_100": {"signal": "BUY"}}
    weekly = {"bollinger_band": {"signal": None}, "ema_20": {"signal": "SELL"}}
    buy, sell = IC.extract_signals(daily, hourly, weekly)
    assert buy == ["EMA_100_Hourly", "EMA_9_Daily", "MA_Crossover_Daily"]
    assert sell == ["EMA_20_Daily", "EMA_50_Daily", "MACD_Daily", "EMA_20_Weekly"]
