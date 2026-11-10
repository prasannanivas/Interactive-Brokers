// Signal change history rebuilt from closed candles, using exactly the same formulas,
// windows and Trading Rules thresholds as backend/indicator_calculator.py (the engine
// behind the dashboard badges). One entry per actual change at a daily close, instead of
// the live log's intraday flip-flops. Keep in sync with indicator_calculator.py.

// Lookback the live monitor fetches (massive_monitor_v2.py): daily 600 calendar days, weekly 30 weeks.
export const DAILY_LOOKBACK_DAYS = 600
export const WEEKLY_LOOKBACK_DAYS = 210

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

const mean = (arr, from, to) => {
  let s = 0
  for (let i = from; i < to; i++) s += arr[i]
  return s / (to - from)
}

// IndicatorCalculator.calculate_ema: SMA seed, then recursive; value for the last bar
const emaLast = (p, period) => {
  if (p.length < period) return null
  let ema = mean(p, 0, period)
  const k = 2 / (period + 1)
  for (let i = period; i < p.length; i++) ema = (p[i] - ema) * k + ema
  return ema
}

// pandas ewm(span, adjust=False): seeded with the first value
const ewmLast = (p, span) => {
  const a = 2 / (span + 1)
  let y = p[0]
  for (let i = 1; i < p.length; i++) y = (1 - a) * y + a * p[i]
  return y
}

const side = (value, ref) => (value > ref ? 'BUY' : value < ref ? 'SELL' : null)

// Rolling-mean RSI as in calculate_rsi (not Wilder)
const rsiLast = (p, period) => {
  if (p.length < period + 1) return null
  let gain = 0, loss = 0
  for (let i = p.length - period; i < p.length; i++) {
    const d = p[i] - p[i - 1]
    if (d > 0) gain += d
    else if (d < 0) loss -= d
  }
  gain /= period
  loss /= period
  return 100 - 100 / (1 + gain / loss)
}

export const dailyStates = (closes) => {
  const price = closes[closes.length - 1]
  const out = {}
  const rsi = rsiLast(closes, 9)
  if (rsi !== null) out['RSI 9|Daily'] = rsi > 80 ? 'SELL' : rsi < 40 ? 'BUY' : null
  for (const n of [9, 20, 50, 200]) {
    const e = emaLast(closes, n)
    if (e !== null) out[`EMA ${n}|Daily`] = side(price, e)
  }
  if (closes.length >= 22) out['MA Crossover|Daily'] = side(emaLast(closes, 9), emaLast(closes, 21))
  if (closes.length >= 26) out['MACD|Daily'] = side(ewmLast(closes, 12) - ewmLast(closes, 26), 0)
  return out
}

export const weeklyStates = (closes, price) => {
  const out = {}
  if (closes.length < 20) return out
  const mid = emaLast(closes, 20)
  out['EMA 20|Weekly'] = side(price, mid)
  const m = mean(closes, closes.length - 20, closes.length)
  let ss = 0
  for (let i = closes.length - 20; i < closes.length; i++) ss += (closes[i] - m) ** 2
  const std = Math.sqrt(ss / 19)
  const last = closes[closes.length - 1]
  out['Bollinger Band|Weekly'] = last > mid + 2 * std ? 'SELL' : last < mid - 2 * std ? 'BUY' : null
  return out
}

const addDays = (dateKey, days) => {
  const d = new Date(dateKey + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const isWeekday = (dateKey) => {
  const wd = new Date(dateKey + 'T00:00:00Z').getUTCDay()
  return wd !== 0 && wd !== 6
}

/**
 * Build the signal-change list from daily + weekly candles ({time: 'YYYY-MM-DD', close}).
 * Only closed daily candles are used (today's forming candle is skipped), so each
 * indicator changes at most once per day. Returns newest first, in the same shape
 * as /api/signals/changes entries.
 */
export const buildSignalHistory = (dailyCandles, weeklyCandles, { historyDays = 180, today } = {}) => {
  const todayKey = today || new Date().toISOString().slice(0, 10)
  const daily = [...dailyCandles].sort((a, b) => (a.time > b.time ? 1 : -1))
  const weekly = [...(weeklyCandles || [])].sort((a, b) => (a.time > b.time ? 1 : -1))
  const firstDay = addDays(todayKey, -historyDays)

  const changes = []
  let prev = null
  for (let i = 0; i < daily.length; i++) {
    const day = daily[i].time
    if (day < firstDay || day >= todayKey || !isWeekday(day)) continue

    // Same window the live monitor would have fetched on that day
    const dFrom = addDays(day, -DAILY_LOOKBACK_DAYS)
    const closes = []
    for (let j = 0; j <= i; j++) {
      if (daily[j].time >= dFrom && isWeekday(daily[j].time)) closes.push(daily[j].close)
    }
    const price = daily[i].close
    const states = dailyStates(closes)

    // Weekly bars as of that day: the forming week's close is that day's close
    const wFrom = addDays(day, -WEEKLY_LOOKBACK_DAYS)
    const wCloses = weekly.filter(w => w.time >= wFrom && w.time <= day).map(w => w.close)
    if (wCloses.length) {
      wCloses[wCloses.length - 1] = price
      Object.assign(states, weeklyStates(wCloses, price))
    }

    if (prev) {
      for (const key of Object.keys(states)) {
        if (!(key in prev) || prev[key] === states[key]) continue
        const [indicator, timeframe] = key.split('|')
        changes.push({
          indicator,
          timeframe,
          old_signal: prev[key],
          new_signal: states[key],
          timestamp: `${day}T23:59:59Z`,
          price,
          source: 'candles',
        })
      }
    }
    prev = states
  }
  return changes.reverse()
}
