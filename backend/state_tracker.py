"""
State Tracker for Indicator and Position Changes
Tracks individual indicator states and overall position for backtesting
"""

from datetime import datetime
from typing import Dict, List, Tuple
from database import get_indicator_states_collection, get_position_changes_collection


INDICATOR_MAPPING = {
    # Daily Indicators (8)
    'Bollinger_Band_Daily': 'BB Daily',
    'RSI_9_Daily': 'RSI Daily',
    'EMA_9_Daily': 'EMA 9 Daily',
    'EMA_20_Daily': 'EMA 20 Daily',
    'EMA_50_Daily': 'EMA 50 Daily',
    'EMA_200_Daily': 'EMA 200 Daily',
    'MA_Crossover_Daily': 'MA Cross Daily',
    'MACD_Daily': 'MACD Daily',
    # Hourly Indicators (1)
    'EMA_100_Hourly': 'EMA 100 Hourly',
    # Weekly Indicators (1)
    'EMA_20_Weekly': 'EMA 20 Weekly'
}


def get_indicator_state(indicator_name: str, indicators_dict: dict) -> str:
    """
    Determine state of an indicator: BUY, SELL, or NEUTRAL
    """
    # Handle case where indicators_dict is not a dict (e.g., float, None)
    if not indicators_dict or not isinstance(indicators_dict, dict):
        return 'NEUTRAL'
    
    signal = indicators_dict.get('signal')
    if signal == 'BUY':
        return 'BUY'
    elif signal == 'SELL':
        return 'SELL'
    else:
        return 'NEUTRAL'


def extract_current_indicator_states(symbol_data: dict) -> Dict[str, str]:
    """
    Extract current state of all indicators for a symbol
    Returns: {indicator_name: 'BUY'/'SELL'/'NEUTRAL'}
    
    RULES (per Boss's document):
    - 1 Hourly: EMA 100
    - 8 Daily: BB, RSI 9, EMA 9, EMA 20, EMA 50, EMA 200, MA Crossover, MACD
    - 1 Weekly: EMA 20
    """
    states = {}
    daily = symbol_data.get('daily_indicators', {}) or {}
    hourly = symbol_data.get('hourly_indicators', {}) or {}
    weekly = symbol_data.get('weekly_indicators', {}) or {}
    
    # Ensure all timeframes are dicts
    if not isinstance(daily, dict):
        daily = {}
    if not isinstance(hourly, dict):
        hourly = {}
    if not isinstance(weekly, dict):
        weekly = {}
    
    # DAILY INDICATORS (8 total)
    # 1. Bollinger Band (20,2,0) - EMA
    bb = daily.get('bollinger_band', {})
    if isinstance(bb, dict):
        states['Bollinger_Band_Daily'] = get_indicator_state('BB', bb)
    
    # 2. RSI 9
    rsi = daily.get('rsi_9', {})
    if isinstance(rsi, dict):
        states['RSI_9_Daily'] = get_indicator_state('RSI', rsi)
    
    # 3. EMA 9
    ema9 = daily.get('ema_9', {})
    if isinstance(ema9, dict):
        states['EMA_9_Daily'] = get_indicator_state('EMA9', ema9)
    
    # 4. EMA 20
    ema20 = daily.get('ema_20', {})
    if isinstance(ema20, dict):
        states['EMA_20_Daily'] = get_indicator_state('EMA20', ema20)
    
    # 5. EMA 50
    ema50 = daily.get('ema_50', {})
    if isinstance(ema50, dict):
        states['EMA_50_Daily'] = get_indicator_state('EMA50', ema50)
    
    # 6. EMA 200
    ema200 = daily.get('ema_200', {})
    if isinstance(ema200, dict):
        states['EMA_200_Daily'] = get_indicator_state('EMA200', ema200)
    
    # 7. MA Crossover (9 day EMA, 21 day EMA)
    ma_cross = daily.get('ma_crossover', {})
    if isinstance(ma_cross, dict):
        states['MA_Crossover_Daily'] = get_indicator_state('MA_Cross', ma_cross)
    
    # 8. MACD (12,26,9 EMA)
    macd = daily.get('macd', {})
    if isinstance(macd, dict):
        states['MACD_Daily'] = get_indicator_state('MACD', macd)
    
    # HOURLY INDICATORS (1 total)
    # 1. EMA 100
    ema100 = hourly.get('ema_100', {})
    if isinstance(ema100, dict):
        states['EMA_100_Hourly'] = get_indicator_state('EMA100', ema100)
    
    # WEEKLY INDICATORS (1 total)
    # 1. EMA 20
    ema20_weekly = weekly.get('ema_20', {})
    if isinstance(ema20_weekly, dict):
        states['EMA_20_Weekly'] = get_indicator_state('EMA20', ema20_weekly)
    
    return states


def calculate_overall_position(buy_signals: List[str], sell_signals: List[str]) -> str:
    """
    Calculate overall position based on buy and sell signals
    - If only buy signals: BUY
    - If only sell signals: SELL
    - If both or neither: NEUTRAL
    """
    has_buy = len(buy_signals) > 0
    has_sell = len(sell_signals) > 0
    
    if has_buy and not has_sell:
        return 'BUY'
    elif has_sell and not has_buy:
        return 'SELL'
    else:
        return 'NEUTRAL'


async def track_and_detect_changes(
    symbol: str,
    symbol_data: dict,
    previous_indicator_states: Dict[str, str],
    previous_position: str
) -> Tuple[List[dict], str, bool]:
    """
    Track indicator changes and detect position changes
    
    Returns:
        - List of indicator changes [{indicator, from, to, timestamp}]
        - New overall position
        - Whether position changed
    """
    timestamp = datetime.now()
    current_indicator_states = extract_current_indicator_states(symbol_data)
    
    buy_signals = symbol_data.get('buy_signals', [])
    sell_signals = symbol_data.get('sell_signals', [])
    current_position = calculate_overall_position(buy_signals, sell_signals)
    
    # Detect indicator changes
    indicator_changes = []
    # NOTE: Disabled DB writes here - signal changes are now logged by massive_monitor_v2._log_signal_changes()
    # indicator_states_collection = get_indicator_states_collection()
    
    for indicator, current_state in current_indicator_states.items():
        prev_state = previous_indicator_states.get(indicator, 'NEUTRAL')
        
        if prev_state != current_state:
            # State changed!
            change_doc = {
                'symbol': symbol,
                'indicator': indicator,
                'from_state': prev_state,
                'to_state': current_state,
                'timestamp': timestamp.isoformat(),
                'price': symbol_data.get('last_price')
            }
            indicator_changes.append(change_doc)
            
            # NOTE: Disabled - signal changes are now tracked in massive_monitor_v2._log_signal_changes()
            # This was overwriting the proper change records with upsert=True
            # await indicator_states_collection.update_one(
            #     {'symbol': symbol, 'indicator': indicator},
            #     {'$set': {
            #         'state': current_state,
            #         'timestamp': timestamp.isoformat(),
            #         'price': symbol_data.get('last_price')
            #     }},
            #     upsert=True
            # )
    
    # Detect position change
    position_changed = (current_position != previous_position)
    
    if position_changed:
        # Save position change for backtesting
        position_changes_collection = get_position_changes_collection()
        await position_changes_collection.insert_one({
            'symbol': symbol,
            'from_position': previous_position,
            'to_position': current_position,
            'timestamp': timestamp.isoformat(),
            'price': symbol_data.get('last_price'),
            'buy_signals_count': len(buy_signals),
            'sell_signals_count': len(sell_signals),
            'buy_signals': buy_signals,
            'sell_signals': sell_signals
        })
    
    return indicator_changes, current_position, position_changed
