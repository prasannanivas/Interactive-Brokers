"""
State Tracker for Indicator and Position Changes
Tracks individual indicator states and overall position for backtesting
"""

from datetime import datetime
from typing import Dict, List, Tuple
from database import get_indicator_states_collection, get_position_changes_collection


INDICATOR_MAPPING = {
    'Bollinger_Band_Daily': 'BB',
    'RSI_9_Daily': 'RSI',
    'SMA_50_Daily': 'SMA50',
    'SMA_200_Daily': 'SMA200',
    'MA_Crossover_Daily': 'MA_Cross',
    'MACD_Daily': 'MACD',
    'EMA_100_Hourly': 'EMA100'
}


def get_indicator_state(indicator_name: str, indicators_dict: dict) -> str:
    """
    Determine state of an indicator: BUY, SELL, or NEUTRAL
    """
    if not indicators_dict:
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
    """
    states = {}
    daily = symbol_data.get('daily_indicators', {}) or {}
    hourly = symbol_data.get('hourly_indicators', {}) or {}
    
    # Daily indicators
    if daily.get('bollinger_band'):
        states['Bollinger_Band_Daily'] = get_indicator_state('BB', daily['bollinger_band'])
    if daily.get('rsi_9'):
        states['RSI_9_Daily'] = get_indicator_state('RSI', daily['rsi_9'])
    if daily.get('sma_50'):
        states['SMA_50_Daily'] = get_indicator_state('SMA50', daily['sma_50'])
    if daily.get('sma_200'):
        states['SMA_200_Daily'] = get_indicator_state('SMA200', daily.get('sma_200', {}))
    if daily.get('ma_crossover'):
        states['MA_Crossover_Daily'] = get_indicator_state('MA_Cross', daily['ma_crossover'])
    if daily.get('macd'):
        states['MACD_Daily'] = get_indicator_state('MACD', daily['macd'])
    
    # Hourly indicators
    if hourly.get('ema_100'):
        states['EMA_100_Hourly'] = get_indicator_state('EMA100', hourly['ema_100'])
    
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
    indicator_states_collection = get_indicator_states_collection()
    
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
            
            # Save to DB
            await indicator_states_collection.update_one(
                {'symbol': symbol, 'indicator': indicator},
                {'$set': {
                    'state': current_state,
                    'timestamp': timestamp.isoformat(),
                    'price': symbol_data.get('last_price')
                }},
                upsert=True
            )
    
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
