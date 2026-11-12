"""
Live data-feed checks against the Massive API, for every pair in watchlist.json.

Skipped unless MASSIVE_API_KEY is set. Run:  python -m pytest -m live
Catches the "EMA 200 = N/A" class of bug (provider returning too little history).
"""
import json
import os
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]

try:
    from dotenv import load_dotenv
    load_dotenv(BACKEND / ".env")
except ImportError:
    pass

API_KEY = os.getenv("MASSIVE_API_KEY")
pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(not API_KEY, reason="MASSIVE_API_KEY not set"),
]


DEFAULT_SYMBOLS = ["C:AUDGBP", "C:AUDUSD", "C:CADCHF", "C:CADGBP", "C:USDCAD", "C:EURUSD", "C:GBPUSD", "C:USDJPY"]


def _symbols():
    """LIVE_SYMBOLS=C:EURUSD,C:USDJPY to choose pairs; LIVE_SYMBOLS=all for every pair in watchlist2.json."""
    env = os.getenv("LIVE_SYMBOLS", "").strip()
    if env.lower() == "all":
        for name in ("watchlist2.json", "watchlist.json"):
            try:
                data = json.loads((BACKEND / name).read_text())
                if data:
                    return sorted(data.keys())
            except (OSError, ValueError):
                continue
    elif env:
        return [s.strip() for s in env.split(",") if s.strip()]
    return DEFAULT_SYMBOLS


@pytest.fixture
async def monitor():
    from massive_monitor_v2 import MassiveMonitorV2
    m = MassiveMonitorV2(api_key=API_KEY, use_db=False)
    await m.connect()
    return m


@pytest.mark.parametrize("symbol", _symbols())
async def test_daily_history_supports_all_indicators(monitor, symbol):
    from indicator_calculator import IndicatorCalculator as IC
    daily = await monitor._fetch_daily_data(symbol)
    assert daily is not None, f"{symbol}: no daily data"
    ind = IC.calculate_all_daily_indicators(daily, float(daily["close"].iloc[-1]))
    missing = [k for k, v in ind.items() if v is None]
    assert not missing, f"{symbol}: N/A for {missing} ({len(daily)} raw daily bars)"
