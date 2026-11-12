// Exact JavaScript port of backend/indicator_calculator.py (the engine behind the
// dashboard table) - Trading Rules.xlsx, TradingView-standard formulas. Used by the
// history popup, signal calendar, matrix delta and the /test audit page.
// Keep in sync with indicator_calculator.py.

// Lookback windows (calendar days) - same as indicator_calculator.py *_LOOKBACK_DAYS.
// The chart fetches the same windows, so every view computes from identical candles.
export const DAILY_WINDOW_DAYS = 1825
export const HOURLY_WINDOW_DAYS = 120 // thin pairs (ILS) only print ~10 hourly bars a day
export const WEEKLY_WINDOW_DAYS = 1825

export const TRADING_RULES = { RSI_SELL_ABOVE: 80, RSI_BUY_BELOW: 40 }

const mean = (arr, from, to) => {
  let s = 0
  for (let i = from; i < to; i++) s += arr[i]
  return s / (to - from)
}

// pandas ewm(span, adjust=False): seeded with the first value
export const ewmSeries = (p, span) => {
  const a = 2 / (span + 1)
  const out = new Array(p.length)
  let y = p[0]
  out[0] = y
  for (let i = 1; i < p.length; i++) {
    y = (1 - a) * y + a * p[i]
    out[i] = y
  }
  return out
}

// IndicatorCalculator.calculate_ema: SMA seed, NaN for the first period-1 bars
export const emaSeries = (p, period) => {
  if (p.length < period) return ewmSeries(p, period)
  const out = new Array(p.length).fill(NaN)
  let ema = mean(p, 0, period)
  out[period - 1] = ema
  const k = 2 / (period + 1)
  for (let i = period; i < p.length; i++) {
    ema = (p[i] - ema) * k + ema
    out[i] = ema
  }
  return out
}

// IndicatorCalculator.calculate_rsi_series: Wilder's RSI, NaN until index `period`
export const rsiSeries = (p, period = 9) => {
  if (p.length < period + 1) return null
  const out = new Array(p.length).fill(NaN)
  const rsi = (g, l) => (l === 0 ? (g > 0 ? 100 : 50) : 100 - 100 / (1 + g / l))
  let g = 0, l = 0
  for (let i = 1; i <= period; i++) {
    const d = p[i] - p[i - 1]
    if (d > 0) g += d
    else if (d < 0) l -= d
  }
  g /= period
  l /= period
  out[period] = rsi(g, l)
  for (let i = period + 1; i < p.length; i++) {
    const d = p[i] - p[i - 1]
    g = (g * (period - 1) + (d > 0 ? d : 0)) / period
    l = (l * (period - 1) + (d < 0 ? -d : 0)) / period
    out[i] = rsi(g, l)
  }
  return out
}

const side = (value, ref) => (value > ref ? 'BUY' : value < ref ? 'SELL' : null)
const last = (a) => a[a.length - 1]

export const rsiIndicator = (closes, period = 9) => {
  const s = rsiSeries(closes, period)
  if (!s) return null
  const v = last(s)
  return {
    rsi_value: v,
    signal: v > TRADING_RULES.RSI_SELL_ABOVE ? 'SELL' : v < TRADING_RULES.RSI_BUY_BELOW ? 'BUY' : null,
  }
}

export const emaIndicator = (closes, period, price) => {
  if (closes.length < period) return null
  const v = last(emaSeries(closes, period))
  return { ema_value: v, current_price: price, signal: side(price, v) }
}

export const maCrossover = (closes, dates) => {
  if (closes.length < 22) return null
  const fast = emaSeries(closes, 9)
  const slow = emaSeries(closes, 21)
  const f = last(fast), s = last(slow)
  // walk back to the most recent flip of the EMA9/EMA21 relation
  const sides = []
  for (let i = 0; i < closes.length; i++) {
    if (Number.isNaN(fast[i]) || Number.isNaN(slow[i])) continue
    const d = fast[i] - slow[i]
    sides.push({ i, side: d > 0 ? 1 : d < 0 ? -1 : 0 })
  }
  let dir = null, date = null, bars = null
  for (let j = sides.length - 1; j > 0; j--) {
    if (sides[j].side !== 0 && sides[j - 1].side !== sides[j].side) {
      dir = sides[j].side > 0 ? 'BUY' : 'SELL'
      date = dates ? dates[sides[j].i] : null
      bars = sides.length - 1 - j
      break
    }
  }
  return {
    fast_ema: f, slow_ema: s, signal: side(f, s),
    last_cross_direction: dir, last_cross_date: date, bars_since_cross: bars,
  }
}

// MACD (12, 26, 9 EMA): SMA-seeded EMAs, signal line = EMA 9 of the MACD line
export const macdIndicator = (closes) => {
  if (closes.length < 26) return null
  const e12 = emaSeries(closes, 12)
  const e26 = emaSeries(closes, 26)
  const line = []
  for (let i = 25; i < closes.length; i++) line.push(e12[i] - e26[i])
  const sig = emaSeries(line, 9)
  const m = last(line), s = last(sig)
  return { macd_line: m, signal_line: s, histogram: m - s, signal: side(m, 0) }
}

// Bollinger (20, 2, 0) - EMA: EMA middle, population std dev (TradingView ta.stdev)
export const bollingerIndicator = (closes, period = 20, k = 2) => {
  if (closes.length < period) return null
  const mid = last(emaSeries(closes, period))
  const m = mean(closes, closes.length - period, closes.length)
  let ss = 0
  for (let i = closes.length - period; i < closes.length; i++) ss += (closes[i] - m) ** 2
  const std = Math.sqrt(ss / period)
  const price = last(closes)               // the current (forming) bar
  const upper = mid + k * std, lower = mid - k * std
  return {
    upper_band: upper, middle_band: mid, lower_band: lower, current_price: price,
    signal: price > upper ? 'SELL' : price < lower ? 'BUY' : null,
  }
}

const dateKey = (t) => (typeof t === 'string' ? t.slice(0, 10) : new Date(t * 1000).toISOString().slice(0, 10))
export const isWeekdayKey = (key) => {
  const wd = new Date(key + 'T00:00:00Z').getUTCDay()
  return wd !== 0 && wd !== 6
}

/** calculate_all_daily_indicators. candles: [{time, close}] ascending. */
export const dailyIndicators = (candles, price) => {
  const bars = candles.filter(c => isWeekdayKey(dateKey(c.time)))
  if (!bars.length) return null
  const closes = bars.map(c => c.close)
  const dates = bars.map(c => dateKey(c.time))
  return {
    rsi_9: rsiIndicator(closes, 9),
    ema_9: emaIndicator(closes, 9, price),
    ema_20: emaIndicator(closes, 20, price),
    ema_50: emaIndicator(closes, 50, price),
    ema_200: emaIndicator(closes, 200, price),
    ma_crossover: maCrossover(closes, dates),
    macd: macdIndicator(closes),
  }
}

export const hourlyIndicators = (candles, price) => {
  if (!candles.length) return null
  return { ema_100: emaIndicator(candles.map(c => c.close), 100, price) }
}

export const weeklyIndicators = (candles, price) => {
  if (!candles.length) return null
  const closes = candles.map(c => c.close)
  return { bollinger_band: bollingerIndicator(closes, 20, 2), ema_20: emaIndicator(closes, 20, price) }
}

// extract_signals: order matters (it is what the table's badge lists contain)
export const SIGNAL_SLOTS = [
  ['hourly', 'ema_100', 'EMA_100_Hourly'],
  ['daily', 'rsi_9', 'RSI_9_Daily'],
  ['daily', 'ema_9', 'EMA_9_Daily'],
  ['daily', 'ema_20', 'EMA_20_Daily'],
  ['daily', 'ema_50', 'EMA_50_Daily'],
  ['daily', 'ema_200', 'EMA_200_Daily'],
  ['daily', 'ma_crossover', 'MA_Crossover_Daily'],
  ['daily', 'macd', 'MACD_Daily'],
  ['weekly', 'bollinger_band', 'Bollinger_Band_Weekly'],
  ['weekly', 'ema_20', 'EMA_20_Weekly'],
]

export const extractSignals = ({ daily, hourly, weekly }) => {
  const groups = { daily, hourly, weekly }
  const buy = [], sell = []
  for (const [tf, key, name] of SIGNAL_SLOTS) {
    const sig = groups[tf]?.[key]?.signal
    if (sig === 'BUY') buy.push(name)
    else if (sig === 'SELL') sell.push(name)
  }
  return { buy, sell }
}

// ---------------------------------------------------------------- close snapshots
//
// THE canonical "what did the 10 rules say at each daily close". Every view that shows
// signals for a past day (signal calendar, matrix Δ vs 7 days, chart volume bars, history
// popup) is built from this one function, so they cannot disagree with each other. The
// latest (forming) daily bar gives the live state, which must equal the dashboard table.
//
// Day = UTC calendar day of the daily candle (that is how the data feed dates bars).
// Hourly EMA 100 is evaluated on the last hourly bar of that day; weekly rules on the
// week containing that day, with the week's close = that day's close (as the live monitor
// sees it). Series run over the whole fetched history; with the lookback windows above
// every EMA has converged, so this equals the backend's windowed value (the /test page
// verifies that on sampled days).

// Extra days of history fetched beyond the lookback window (calendar range ~15 months)
export const CLOSE_EXTRA_DAYS = 460
// Hourly history fetched for snapshots: calendar range + EMA 100 warm-up
export const CLOSE_HOURLY_DAYS = CLOSE_EXTRA_DAYS + HOURLY_WINDOW_DAYS
export const SNAPSHOT_FETCH = {
  daily: DAILY_WINDOW_DAYS + CLOSE_EXTRA_DAYS,
  weekly: WEEKLY_WINDOW_DAYS + CLOSE_EXTRA_DAYS,
  hourly: CLOSE_HOURLY_DAYS,
}
export const TOTAL_RULES = SIGNAL_SLOTS.length // 10
export const SLOT_NAMES = SIGNAL_SLOTS.map(s => s[2])

const DAY_MS = 86400000
const hourSec = (t) => (typeof t === 'number' ? t : Date.parse(t) / 1000)

// Bars needed after an EMA's SMA seed until the seed's weight is < 0.01%. Before that the
// value still depends on where the fetched history starts, so the rule is reported as
// missing instead of showing a value that could differ from the backend's.
const warm = (n) => Math.ceil(Math.log(1e-4) / Math.log((n - 1) / (n + 1)))
const WILDER_WARM = Math.ceil(Math.log(1e-4) / Math.log(8 / 9)) // RSI 9
export const CONVERGED_FROM = {
  RSI_9_Daily: 9 + WILDER_WARM,
  EMA_9_Daily: 8 + warm(9),
  EMA_20_Daily: 19 + warm(20),
  EMA_50_Daily: 49 + warm(50),
  EMA_200_Daily: 199 + warm(200),
  MA_Crossover_Daily: 20 + warm(21),
  MACD_Daily: 25 + warm(26),
  EMA_20_Weekly: 19 + warm(20),        // weekly bar index
  Bollinger_Band_Weekly: 19 + warm(20),
  EMA_100_Hourly: 99 + warm(100),      // hourly bar index
}

/**
 * @returns Map dateKey -> { date, price, states: {slotName: 'BUY'|'SELL'|null}, buy: [], sell: [], missing: [] }
 *          in ascending date order. `missing` lists rules with not enough data that day.
 */
export const buildCloseSnapshots = ({ daily = [], weekly = [], hourly = [] }) => {
  const dBars = [...daily].sort((a, b) => (dateKey(a.time) > dateKey(b.time) ? 1 : -1)).filter(c => isWeekdayKey(dateKey(c.time)))
  const wBars = [...weekly].sort((a, b) => (dateKey(a.time) > dateKey(b.time) ? 1 : -1))
  const hBars = [...hourly].sort((a, b) => hourSec(a.time) - hourSec(b.time))

  const closes = dBars.map(c => c.close)
  const rsi = rsiSeries(closes, 9) || []
  const ema = { 9: emaSeries(closes, 9), 20: emaSeries(closes, 20), 50: emaSeries(closes, 50), 200: emaSeries(closes, 200) }
  const ema21 = emaSeries(closes, 21)
  const ema12 = emaSeries(closes, 12), ema26 = emaSeries(closes, 26)

  const wCloses = wBars.map(w => w.close)
  const wEma20 = emaSeries(wCloses, 20)
  const wKeys = wBars.map(w => dateKey(w.time))

  const hCloses = hBars.map(h => h.close)
  const hEma100 = emaSeries(hCloses, 100)
  const hTimes = hBars.map(h => hourSec(h.time))

  const out = new Map()
  let wi = -1, hi = -1
  for (let i = 0; i < dBars.length; i++) {
    const day = dateKey(dBars[i].time)
    const p = closes[i]
    const st = {}

    // Daily rules (same validity thresholds as the backend)
    const C = CONVERGED_FROM
    if (i >= C.RSI_9_Daily && Number.isFinite(rsi[i])) st.RSI_9_Daily = rsi[i] > TRADING_RULES.RSI_SELL_ABOVE ? 'SELL' : rsi[i] < TRADING_RULES.RSI_BUY_BELOW ? 'BUY' : null
    for (const n of [9, 20, 50, 200]) if (i >= C[`EMA_${n}_Daily`]) st[`EMA_${n}_Daily`] = side(p, ema[n][i])
    if (i >= C.MA_Crossover_Daily) st.MA_Crossover_Daily = side(ema[9][i], ema21[i])
    if (i >= C.MACD_Daily) st.MACD_Daily = side(ema12[i] - ema26[i], 0)

    // Weekly rules: the week containing `day`, its close replaced by this day's close
    while (wi + 1 < wKeys.length && wKeys[wi + 1] <= day) wi++
    if (wi >= 0 && Date.parse(day + 'T00:00:00Z') - Date.parse(wKeys[wi] + 'T00:00:00Z') < 7 * DAY_MS) {
      const n = wi + 1
      if (wi >= CONVERGED_FROM.EMA_20_Weekly) {
        const k = 2 / 21
        let mid
        if (n === 20) {
          let s = p
          for (let j = 0; j < 19; j++) s += wCloses[j]
          mid = s / 20
        } else {
          mid = (p - wEma20[wi - 1]) * k + wEma20[wi - 1]
        }
        st.EMA_20_Weekly = side(p, mid)
        let m = p
        for (let j = wi - 19; j < wi; j++) m += wCloses[j]
        m /= 20
        let ss = (p - m) ** 2
        for (let j = wi - 19; j < wi; j++) ss += (wCloses[j] - m) ** 2
        const sd = Math.sqrt(ss / 20)
        st.Bollinger_Band_Weekly = p > mid + 2 * sd ? 'SELL' : p < mid - 2 * sd ? 'BUY' : null
      }
    }

    // Hourly EMA 100 on the last hourly bar of this day
    const dayEnd = Date.parse(day + 'T00:00:00Z') / 1000 + 86400
    while (hi + 1 < hTimes.length && hTimes[hi + 1] < dayEnd) hi++
    if (hi >= CONVERGED_FROM.EMA_100_Hourly && hTimes[hi] >= dayEnd - 86400) st.EMA_100_Hourly = side(hCloses[hi], hEma100[hi])

    const buy = [], sell = [], missing = []
    for (const name of SLOT_NAMES) {
      if (!(name in st)) missing.push(name)
      else if (st[name] === 'BUY') buy.push(name)
      else if (st[name] === 'SELL') sell.push(name)
    }
    out.set(day, { date: day, price: p, states: st, buy, sell, missing })
  }
  return out
}

/** Snapshot at the last daily close on or before `key`. */
export const snapshotOnOrBefore = (snaps, key) => {
  let found = null
  for (const [d, s] of snaps) {
    if (d > key) break
    found = s
  }
  return found
}
