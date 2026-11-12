// Signal change history rebuilt from daily closes (close snapshots, signalEngine.js), using
// exactly the same formulas and Trading Rules thresholds as backend/indicator_calculator.py.
// One entry per actual change at a daily close, instead of the live log's intraday flips.

import {
  DAILY_WINDOW_DAYS, WEEKLY_WINDOW_DAYS,
  rsiIndicator, emaIndicator, maCrossover, macdIndicator, bollingerIndicator, buildCloseSnapshots,
} from './signalEngine'

// Lookback the live monitor fetches (massive_monitor_v2.py): daily 600 calendar days, weekly 30 weeks.
export const DAILY_LOOKBACK_DAYS = DAILY_WINDOW_DAYS
export const WEEKLY_LOOKBACK_DAYS = WEEKLY_WINDOW_DAYS

// Popup filter label -> indicator key
export const HISTORY_INDICATOR_KEYS = {
  'RSI (9)': 'RSI 9|Daily',
  'EMA 9': 'EMA 9|Daily',
  'EMA 20': 'EMA 20|Daily',
  'EMA 50': 'EMA 50|Daily',
  'EMA 200': 'EMA 200|Daily',
  'MA Crossover': 'MA Crossover|Daily',
  'MACD': 'MACD|Daily',
  'Bollinger Bands Weekly': 'Bollinger Band|Weekly',
  'EMA 20 Weekly': 'EMA 20|Weekly',
}

// States per indicator key, computed by the shared engine (exact port of the backend)
export const dailyStates = (closes) => {
  const price = closes[closes.length - 1]
  const out = {}
  const rsi = rsiIndicator(closes, 9)
  if (rsi) out['RSI 9|Daily'] = rsi.signal
  for (const n of [9, 20, 50, 200]) {
    const e = emaIndicator(closes, n, price)
    if (e) out[`EMA ${n}|Daily`] = e.signal
  }
  const mac = maCrossover(closes)
  if (mac) out['MA Crossover|Daily'] = mac.signal
  const macd = macdIndicator(closes)
  if (macd) out['MACD|Daily'] = macd.signal
  return out
}

export const weeklyStates = (closes, price) => {
  const out = {}
  const e = emaIndicator(closes, 20, price)
  if (e) out['EMA 20|Weekly'] = e.signal
  const bb = bollingerIndicator(closes, 20, 2)
  if (bb) out['Bollinger Band|Weekly'] = bb.signal
  return out
}

// Snapshot slot name -> [indicator, timeframe] as used by /api/signals/changes
export const SLOT_TO_LOG = {
  EMA_100_Hourly: ['EMA 100', 'Hourly'],
  RSI_9_Daily: ['RSI 9', 'Daily'],
  EMA_9_Daily: ['EMA 9', 'Daily'],
  EMA_20_Daily: ['EMA 20', 'Daily'],
  EMA_50_Daily: ['EMA 50', 'Daily'],
  EMA_200_Daily: ['EMA 200', 'Daily'],
  MA_Crossover_Daily: ['MA Crossover', 'Daily'],
  MACD_Daily: ['MACD', 'Daily'],
  Bollinger_Band_Weekly: ['Bollinger Band', 'Weekly'],
  EMA_20_Weekly: ['EMA 20', 'Weekly'],
}

/**
 * Daily/weekly signal changes between consecutive daily closes, from close snapshots
 * (the same snapshots behind the signal calendar and the chart volume bars, so every
 * change here is exactly a day-to-day difference those views show). The live
 * (forming) day is skipped: a change is recorded only once the day has closed.
 * Hourly EMA 100 is left to the live change log. Newest first, /api/signals/changes shape.
 */
export const historyFromSnapshots = (snaps, { historyDays = 180, today } = {}) => {
  const todayKey = today || new Date().toISOString().slice(0, 10)
  const firstDay = new Date(Date.parse(todayKey + 'T00:00:00Z') - historyDays * 86400000).toISOString().slice(0, 10)
  // The latest daily bar is the live day even when the feed has not printed today's bar
  // yet (thin pairs) - the calendar and volume bars show the table for it, so it is not
  // a closed day here either.
  let liveKey = null
  for (const k of snaps.keys()) liveKey = k
  const changes = []
  let prev = null
  for (const [day, snap] of snaps) {
    if (day >= todayKey || day === liveKey) break
    if (prev && day >= firstDay) {
      for (const [slot, [indicator, timeframe]] of Object.entries(SLOT_TO_LOG)) {
        if (timeframe === 'Hourly') continue
        if (!(slot in prev.states) || !(slot in snap.states)) continue
        if (prev.states[slot] === snap.states[slot]) continue
        changes.push({
          indicator, timeframe,
          old_signal: prev.states[slot], new_signal: snap.states[slot],
          timestamp: `${day}T23:59:59Z`, price: snap.price, source: 'candles',
        })
      }
    }
    prev = snap
  }
  return changes.reverse()
}

/** Same as historyFromSnapshots, from raw daily + weekly candles. */
export const buildSignalHistory = (dailyCandles, weeklyCandles, opts = {}) =>
  historyFromSnapshots(buildCloseSnapshots({ daily: dailyCandles, weekly: weeklyCandles }), opts)
