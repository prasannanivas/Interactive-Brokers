// Signal audit: verifies, for every watchlist pair, that
//   1. the dashboard table (backend, MongoDB)            == an independent recompute (signalEngine.js)
//   2. the dashboard table                                == what the chart computes (chartIndicators.js)
//   3. the badge counts                                   == the individual column signals
//   4. the signal history (candle rebuild + live log)     == the table / the engine / the chart
// Pure logic (no React) so it can also run from Node. Used by pages/SignalTestPage.jsx (/test).

import * as E from './signalEngine'
import { computeChartIndicators, calculateRSI, calculateEMA, calculateBollingerBands, calculateMACD } from './chartIndicators'
import { historyFromSnapshots, dailyStates, weeklyStates, SLOT_TO_LOG } from './signalHistory'
import {
  fetchCloseSnapshots, calendarMonthSignals, matrixBaseSnapshot, volumeBarsFromSnapshots, liveDayKey,
  tableCounts, snapshotCounts, maCrossAlertCounts, MATRIX_HOURLY_DAYS,
} from './signalViews'

// Windows the chart (ChartModal.jsx) and the history popup (Dashboard.jsx) fetch
export const CHART_WINDOW_DAYS = { daily: E.DAILY_WINDOW_DAYS, hourly: E.HOURLY_WINDOW_DAYS, weekly: E.WEEKLY_WINDOW_DAYS }
export const HISTORY_DAYS = 180
const CHART_HISTORY_COMPARE_DAYS = 60
const TOTAL_INDICATORS = E.TOTAL_RULES
const CALENDAR_RANGE_DAYS = 450        // how far back the signal calendar is checked
const RECOMPUTE_RECENT_DAYS = 30       // every close in this range is recomputed independently
const RECOMPUTE_SAMPLE_EVERY = 15      // plus every Nth close back to the calendar range

export const STATUS = { PASS: 'pass', WARN: 'warn', FAIL: 'fail', INFO: 'info' }

// ---------------------------------------------------------------- helpers

const DAY_MS = 86400000
const dayKey = (t) => (typeof t === 'string' ? t.slice(0, 10) : new Date(t * 1000).toISOString().slice(0, 10))
const addDays = (key, n) => new Date(Date.parse(key + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10)
const sortCandles = (c) => [...(c || [])].sort((a, b) =>
  typeof a.time === 'string' ? a.time.localeCompare(b.time) : a.time - b.time)
const fromKey = (candles, key) => candles.filter(c =>
  typeof c.time === 'string' ? c.time >= key : c.time >= Date.parse(key + 'T00:00:00Z') / 1000)
// The data API returns the whole week that contains the start date (bar time = week start)
const weeksFromKey = (candles, key) => candles.filter(c => dayKey(c.time) > addDays(key, -7))
const last = (a) => (a && a.length ? a[a.length - 1] : undefined)
const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const sig = (s) => (s ? String(s).toUpperCase() : 'NEUTRAL')
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12)

// Naive ISO strings from the backend are server time (UTC on the droplet)
const parseServerTime = (s) => {
  if (!s) return null
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z'
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

// FX is closed Fri 22:00 UTC -> Sun 22:00 UTC (approx.)
export const isFxMarketOpen = (now) => {
  const d = now.getUTCDay(), h = now.getUTCHours()
  if (d === 6) return false
  if (d === 5 && h >= 22) return false
  if (d === 0 && h < 22) return false
  return true
}

// ChartModal: sort, drop weekend candles on daily only
const chartCandles = (candles, timeframe) => {
  const sorted = sortCandles(candles)
  if (timeframe !== 'daily') return sorted
  return sorted.filter(c => {
    const d = typeof c.time === 'string' ? new Date(c.time + 'T00:00:00Z') : new Date(c.time * 1000)
    const wd = d.getUTCDay()
    return wd !== 0 && wd !== 6
  })
}

// Chart output -> same shape as backend indicator dicts
const chartAsBackendShape = (daily, hourly, weekly) => {
  const out = { daily: null, hourly: null, weekly: null }
  if (daily) {
    const p = daily.price
    const ema = (x) => { const v = fin(last(x?.data)); return v == null ? null : { ema_value: v, current_price: p, signal: sig(x.signal) } }
    const rsiV = fin(last(daily.rsi?.data))
    const m = daily.macd?.data
    const mc = daily.maCross?.data
    out.daily = {
      rsi_9: rsiV == null ? null : { rsi_value: rsiV, signal: sig(daily.rsi.signal) },
      ema_9: ema(daily.ema9), ema_20: ema(daily.ema20), ema_50: ema(daily.ema50), ema_200: ema(daily.ema200),
      ma_crossover: fin(last(mc?.shortMA)) == null || fin(last(mc?.longMA)) == null ? null
        : { fast_ema: last(mc.shortMA), slow_ema: last(mc.longMA), signal: sig(daily.maCross.signal) },
      macd: fin(last(m?.macd)) == null ? null
        : { macd_line: last(m.macd), signal_line: last(m.signal), histogram: last(m.histogram), signal: sig(daily.macd.signal) },
    }
  }
  if (hourly) {
    const v = fin(last(hourly.ema100?.data))
    out.hourly = { ema_100: v == null ? null : { ema_value: v, current_price: hourly.price, signal: sig(hourly.ema100.signal) } }
  }
  if (weekly) {
    const bb = weekly.bollingerBands
    const u = fin(last(bb?.upperData)), m = fin(last(bb?.middleData)), l = fin(last(bb?.lowerData))
    const e = fin(last(weekly.ema20?.data))
    out.weekly = {
      bollinger_band: u == null ? null : { upper_band: u, middle_band: m, lower_band: l, current_price: weekly.price, signal: sig(bb.signal) },
      ema_20: e == null ? null : { ema_value: e, current_price: weekly.price, signal: sig(weekly.ema20.signal) },
    }
  }
  return out
}

// ---------------------------------------------------------------- indicator specs

const priceMargin = (i) => rel(i.current_price, i.ema_value)
export const SPECS = [
  { id: 'ema_100_h', label: 'EMA 100 · Hourly', tf: 'hourly', key: 'ema_100', logKey: 'EMA 100|Hourly',
    fields: [['ema_value', 'EMA', 'price']], margin: priceMargin, near: 3e-4 },
  { id: 'rsi_9', label: 'RSI 9 · Daily', tf: 'daily', key: 'rsi_9', logKey: 'RSI 9|Daily',
    fields: [['rsi_value', 'RSI', 'rsi']], near: 1.0,
    margin: (i) => Math.min(Math.abs(i.rsi_value - E.TRADING_RULES.RSI_SELL_ABOVE), Math.abs(i.rsi_value - E.TRADING_RULES.RSI_BUY_BELOW)) },
  { id: 'ema_9', label: 'EMA 9 · Daily', tf: 'daily', key: 'ema_9', logKey: 'EMA 9|Daily', fields: [['ema_value', 'EMA', 'price']], margin: priceMargin, near: 2e-4 },
  { id: 'ema_20', label: 'EMA 20 · Daily', tf: 'daily', key: 'ema_20', logKey: 'EMA 20|Daily', fields: [['ema_value', 'EMA', 'price']], margin: priceMargin, near: 2e-4 },
  { id: 'ema_50', label: 'EMA 50 · Daily', tf: 'daily', key: 'ema_50', logKey: 'EMA 50|Daily', fields: [['ema_value', 'EMA', 'price']], margin: priceMargin, near: 2e-4 },
  { id: 'ema_200', label: 'EMA 200 · Daily', tf: 'daily', key: 'ema_200', logKey: 'EMA 200|Daily', fields: [['ema_value', 'EMA', 'price']], margin: priceMargin, near: 2e-4 },
  { id: 'ma_cross', label: 'MA Cross · Daily', tf: 'daily', key: 'ma_crossover', logKey: 'MA Crossover|Daily',
    fields: [['fast_ema', 'Fast', 'price'], ['slow_ema', 'Slow', 'price']], margin: (i) => rel(i.fast_ema, i.slow_ema), near: 1e-4 },
  { id: 'macd', label: 'MACD · Daily', tf: 'daily', key: 'macd', logKey: 'MACD|Daily',
    fields: [['macd_line', 'MACD', 'macd'], ['signal_line', 'Sig', 'macd'], ['histogram', 'Hist', 'macd']],
    margin: (i, p) => Math.abs(i.macd_line) / p, near: 2e-5 },
  { id: 'bb_w', label: 'Bollinger · Weekly', tf: 'weekly', key: 'bollinger_band', logKey: 'Bollinger Band|Weekly',
    fields: [['upper_band', 'U', 'price'], ['middle_band', 'M', 'price'], ['lower_band', 'L', 'price']],
    margin: (i) => Math.min(rel(i.current_price, i.upper_band), rel(i.current_price, i.lower_band)), near: 3e-4 },
  { id: 'ema_20_w', label: 'EMA 20 · Weekly', tf: 'weekly', key: 'ema_20', logKey: 'EMA 20|Weekly', fields: [['ema_value', 'EMA', 'price']], margin: priceMargin, near: 3e-4 },
]

// value tolerance per field kind: [same-window recompute, chart (different window)]
const TOL = {
  price: { engine: (a, b) => rel(a, b) <= 1e-4, chart: (a, b) => rel(a, b) <= 5e-4, fmt: (v) => v.toFixed(5) },
  rsi: { engine: (a, b) => Math.abs(a - b) <= 0.5, chart: (a, b) => Math.abs(a - b) <= 1.0, fmt: (v) => v.toFixed(2) },
  macd: { engine: (a, b, p) => Math.abs(a - b) / p <= 1e-5, chart: (a, b, p) => Math.abs(a - b) / p <= 2e-5, fmt: (v) => v.toFixed(6) },
}

const describe = (spec, ind) => {
  if (!ind) return 'N/A'
  const vals = spec.fields
    .map(([f, lbl, kind]) => (fin(ind[f]) == null ? null : `${spec.fields.length > 1 ? lbl + ' ' : ''}${TOL[kind].fmt(ind[f])}`))
    .filter(Boolean).join(' · ')
  return `${sig(ind.signal)}${vals ? ' @ ' + vals : ''}`
}

/** Compare one indicator (expected = reference, actual = table). Returns a check. */
const compareIndicator = (spec, expected, actual, mode, price, refName) => {
  const base = { group: mode === 'engine' ? 'Table vs engine' : 'Table vs chart', name: spec.label,
    expected: describe(spec, expected), actual: describe(spec, actual) }
  if (!expected && !actual) return { ...base, status: STATUS.WARN, note: `N/A in both table and ${refName}` }
  if (!actual) return { ...base, status: STATUS.FAIL, note: `Table shows N/A but ${refName} computes a value` }
  if (!expected) return { ...base, status: STATUS.FAIL, note: `${refName} has not enough data but table shows a value` }

  const diffs = []
  for (const [f, lbl, kind] of spec.fields) {
    const a = fin(actual[f]), e = fin(expected[f])
    if (a == null || e == null) continue
    if (!TOL[kind][mode](e, a, price)) {
      const by = kind === 'rsi' ? `${Math.abs(a - e).toFixed(2)} pts`
        : kind === 'macd' ? `${(Math.abs(a - e) / price * 1e4).toFixed(2)} bp of price`
        : `${(rel(a, e) * 100).toFixed(3)}%`
      diffs.push(`${lbl} off by ${by}`)
    }
  }
  const sameSignal = sig(expected.signal) === sig(actual.signal)
  if (!sameSignal) {
    const m = Math.min(spec.margin(expected, price), spec.margin(actual, price))
    if (m < spec.near) return { ...base, status: STATUS.WARN, borderline: true, note: `Signal differs but value sits on the threshold (borderline). ${diffs.join('; ')}`.trim() }
    return { ...base, status: STATUS.FAIL, note: `SIGNAL MISMATCH. ${diffs.join('; ')}`.trim() }
  }
  if (diffs.length) return { ...base, status: STATUS.WARN, note: `Same signal, values differ: ${diffs.join('; ')}` }
  return { ...base, status: STATUS.PASS, note: '' }
}

// ---------------------------------------------------------------- global self-test

const selfTest = () => {
  const checks = []
  const seq = []
  let x = 1.3
  for (let i = 0; i < 400; i++) { x += Math.sin(i * 1.7) * 0.004 + Math.cos(i * 0.31) * 0.002; seq.push(x) }

  const eng = E.rsiSeries(seq, 9).slice(9)
  const chart = calculateRSI(seq, 9)
  const maxD = Math.max(...eng.map((v, i) => Math.abs(v - chart[i])))
  checks.push({ group: 'Self-test', name: 'RSI formula: engine (backend port) = chart', expected: 'max diff < 1e-9', actual: maxD.toExponential(2),
    status: maxD < 1e-9 ? STATUS.PASS : STATUS.FAIL, note: 'Both must use Wilder smoothing (TradingView standard)' })

  const engE = E.emaSeries(seq, 50).slice(49)
  const chE = calculateEMA(seq, 50)
  const maxE = Math.max(...engE.map((v, i) => Math.abs(v - chE[i])))
  checks.push({ group: 'Self-test', name: 'EMA formula: engine = chart (same input)', expected: 'max diff < 1e-12', actual: maxE.toExponential(2),
    status: maxE < 1e-12 ? STATUS.PASS : STATUS.FAIL, note: 'SMA-seeded EMA' })

  // Bollinger (20, 2, 0) - EMA: engine (table) bands = chart bands
  const bbC = calculateBollingerBands(seq, 20, 2)
  const bbE = E.bollingerIndicator(seq, 20, 2)
  const bbD = Math.max(Math.abs(bbE.upper_band - last(bbC.upper)), Math.abs(bbE.middle_band - last(bbC.middle)), Math.abs(bbE.lower_band - last(bbC.lower)))
  checks.push({ group: 'Self-test', name: 'Bollinger (20,2,0)-EMA: engine = chart', expected: 'max diff < 1e-12', actual: bbD.toExponential(2),
    status: bbD < 1e-12 ? STATUS.PASS : STATUS.FAIL, note: 'Trading Rules: EMA middle band, 2 x population std dev' })

  // MACD (12, 26, 9 EMA): engine = chart
  const mC = calculateMACD(seq, 12, 26, 9)
  const mE = E.macdIndicator(seq)
  const mD = Math.max(Math.abs(mE.macd_line - last(mC.macd)), Math.abs(mE.signal_line - last(mC.signal)), Math.abs(mE.histogram - last(mC.histogram)))
  checks.push({ group: 'Self-test', name: 'MACD (12,26,9 EMA): engine = chart', expected: 'max diff < 1e-12', actual: mD.toExponential(2),
    status: mD < 1e-12 ? STATUS.PASS : STATUS.FAIL, note: 'Trading Rules: 12 EMA > 26 EMA = BUY' })

  const up = Array.from({ length: 30 }, (_, i) => 1 + i * 0.01)
  const rUp = E.rsiIndicator(up, 9)
  const rDn = E.rsiIndicator([...up].reverse(), 9)
  const ok = rUp.rsi_value === 100 && rUp.signal === 'SELL' && rDn.rsi_value === 0 && rDn.signal === 'BUY'
  checks.push({ group: 'Self-test', name: 'Trading rules: RSI > 80 = SELL, < 40 = BUY', expected: 'up=100 SELL, down=0 BUY',
    actual: `up=${rUp.rsi_value} ${rUp.signal}, down=${rDn.rsi_value} ${rDn.signal}`, status: ok ? STATUS.PASS : STATUS.FAIL, note: '' })

  const flat = E.emaIndicator(Array(250).fill(1), 200, 1.01)
  checks.push({ group: 'Self-test', name: 'EMA 200 needs 200 bars; price above = BUY', expected: 'null @199, BUY @250',
    actual: `${E.emaIndicator(Array(199).fill(1), 200, 1) === null ? 'null' : 'value'} @199, ${flat?.signal} @250`,
    status: E.emaIndicator(Array(199).fill(1), 200, 1) === null && flat?.signal === 'BUY' ? STATUS.PASS : STATUS.FAIL, note: '' })
  return checks
}

// ---------------------------------------------------------------- views (matrix, calendar, volume bars, history, banner)

const SLOT_SPEC = {
  EMA_100_Hourly: 'ema_100_h', RSI_9_Daily: 'rsi_9', EMA_9_Daily: 'ema_9', EMA_20_Daily: 'ema_20', EMA_50_Daily: 'ema_50',
  EMA_200_Daily: 'ema_200', MA_Crossover_Daily: 'ma_cross', MACD_Daily: 'macd', Bollinger_Band_Weekly: 'bb_w', EMA_20_Weekly: 'ema_20_w',
}
const LOG_TO_SLOT = Object.fromEntries(Object.entries(SLOT_TO_LOG).map(([slot, [ind, tf]]) => [`${ind}|${tf}`, slot]))
const short = (slot) => slot.replace(/_(Daily|Weekly|Hourly)$/, (m) => ` ${m.slice(1, 2)}`).replace(/_/g, ' ')

/** Independent per-day recompute with the backend's windows ending at day `d` (no snapshot code). */
const windowedAt = (d, daily, weekly, hourly) => {
  const dBars = daily.filter(c => { const k = dayKey(c.time); return k <= d && k >= addDays(d, -E.DAILY_WINDOW_DAYS) })
  const lastBar = last(dBars)
  if (!lastBar || dayKey(lastBar.time) !== d) return null
  const price = lastBar.close
  const res = { daily: E.dailyIndicators(dBars, price), weekly: null, hourly: null }
  const wBars = weeksFromKey(weekly, addDays(d, -E.WEEKLY_WINDOW_DAYS)).filter(w => dayKey(w.time) <= d)
  if (wBars.length && dayKey(last(wBars).time) > addDays(d, -7)) {
    const w = [...wBars.slice(0, -1), { ...last(wBars), close: price }]
    res.weekly = E.weeklyIndicators(w, price)
  }
  const dayEnd = Date.parse(d + 'T00:00:00Z') / 1000 + 86400
  const hBars = fromKey(hourly, addDays(d, -E.HOURLY_WINDOW_DAYS)).filter(h => h.time < dayEnd)
  if (hBars.length && last(hBars).time >= dayEnd - 86400) res.hourly = E.hourlyIndicators(hBars, last(hBars).close)
  return res
}

// slot -> { state, borderline } from a windowed result (absent = not enough data)
const windowedStates = (res) => {
  const out = {}
  if (!res) return out
  for (const [tf, key, slot] of E.SIGNAL_SLOTS) {
    const ind = res[tf]?.[key]
    if (!ind) continue
    let b = false
    if (ind.ema_value != null) b = rel(ind.current_price, ind.ema_value) < 1e-5
    else if (ind.rsi_value != null) b = Math.min(Math.abs(ind.rsi_value - 80), Math.abs(ind.rsi_value - 40)) < 0.05
    else if (ind.fast_ema != null) b = rel(ind.fast_ema, ind.slow_ema) < 1e-5
    else if (ind.macd_line != null) b = Math.abs(ind.macd_line) / Math.abs(res.daily?.ema_9?.current_price || 1) < 1e-6
    else if (ind.upper_band != null) b = Math.min(rel(ind.current_price, ind.upper_band), rel(ind.current_price, ind.lower_band)) < 1e-5
    out[slot] = { state: ind.signal || null, borderline: b }
  }
  return out
}

const auditViews = ({ add, item, snaps, matrixSnaps, daily, weekly, hourly, history, today, engineResults, chartResults, alerts }) => {
  const G = 'Views'
  if (!snaps.size) {
    add({ group: G, name: 'Close snapshots built', expected: '> 0 days', actual: '0 days', status: STATUS.FAIL, note: 'No candles - every view for this pair is empty' })
    return
  }
  const live = liveDayKey(snaps)
  const tBuy = item.buy_signals || [], tSell = item.sell_signals || []
  const tableState = (slot) => (tBuy.includes(slot) ? 'BUY' : tSell.includes(slot) ? 'SELL' : null)
  const listsEqual = (a, b) => a.length === b.length && a.every(x => b.includes(x))
  const rangeStart = addDays(live, -CALENDAR_RANGE_DAYS)

  // 1. Live day: the forming bar's daily-close signals = the table
  const liveSnap = snaps.get(live)
  const liveDiff = [], liveBorder = []
  for (const slot of E.SLOT_NAMES) {
    if (!(slot in liveSnap.states)) continue
    if (sig(liveSnap.states[slot]) === sig(tableState(slot))) continue
    const id = SLOT_SPEC[slot]
    const border = engineResults[id]?.borderline || chartResults[id]?.borderline || chartResults[id]?.priceMoved || engineResults[id]?.status === STATUS.WARN
    ;(border ? liveBorder : liveDiff).push(`${short(slot)}: candles ${sig(liveSnap.states[slot])} vs table ${sig(tableState(slot))}`)
  }
  add({ group: G, name: `Live day (${live}) from candles = table`, expected: `${tBuy.length} buy / ${tSell.length} sell`,
    actual: `${liveSnap.buy.length} buy / ${liveSnap.sell.length} sell${liveSnap.missing.length ? ` (${liveSnap.missing.length} no data)` : ''}`,
    status: liveDiff.length ? STATUS.FAIL : liveBorder.length ? STATUS.WARN : STATUS.PASS,
    note: [...liveDiff, ...liveBorder.map(x => x + ' (borderline / price moved)')].join('; ') })
  if (live < today && isFxMarketOpen(new Date())) {
    add({ group: G, name: 'Latest daily candle is today', expected: today, actual: live, status: STATUS.WARN, note: 'Data feed has no bar for today yet - calendar/volume "today" lags the table' })
  }

  // 2. Daily-close signals (behind every view) = independent windowed recompute on sampled closes
  const closedInRange = [...snaps.keys()].filter(d => d < live && d >= rangeStart)
  const sample = new Set(closedInRange.slice(-RECOMPUTE_RECENT_DAYS))
  for (let i = closedInRange.length - RECOMPUTE_RECENT_DAYS - 1; i >= 0; i -= RECOMPUTE_SAMPLE_EVERY) sample.add(closedInRange[i])
  const mb = matrixSnaps ? matrixBaseSnapshot(matrixSnaps, 7) : null
  if (mb && snaps.has(mb.date)) sample.add(mb.date)
  const recompute = {}
  let compared = 0
  const bad = [], borderline = [], coverage = []
  for (const d of [...sample].sort()) {
    const ws = windowedStates(windowedAt(d, daily, weekly, hourly))
    recompute[d] = ws
    const snap = snaps.get(d)
    for (const slot of E.SLOT_NAMES) {
      const inSnap = slot in snap.states, inWin = slot in ws
      if (inSnap !== inWin) { coverage.push(`${d} ${short(slot)}: ${inSnap ? 'recompute' : 'snapshot'} has no data`); continue }
      if (!inSnap) continue
      compared++
      if (sig(snap.states[slot]) !== sig(ws[slot].state)) (ws[slot].borderline ? borderline : bad).push(`${d} ${short(slot)}: snapshot ${sig(snap.states[slot])} vs ${sig(ws[slot].state)}`)
    }
  }
  add({ group: G, name: `Daily-close signals = independent recompute (${sample.size} closes)`, expected: '0 differ', actual: `${bad.length} differ of ${compared} rule-days`,
    status: bad.length ? STATUS.FAIL : borderline.length ? STATUS.WARN : STATUS.PASS,
    note: [...bad.slice(0, 6), ...borderline.slice(0, 3).map(x => x + ' (borderline)')].join('; ') })
  add({ group: G, name: 'Daily-close signals: data coverage matches recompute', expected: '0 gaps', actual: `${coverage.length} gaps`,
    status: coverage.length ? STATUS.WARN : STATUS.PASS, note: coverage.slice(0, 5).join('; ') })

  // 3. Signal calendar: every month in range, via the calendar's own function
  const incomplete = closedInRange.filter(d => snaps.get(d).missing.length)
  add({ group: G, name: `Signal calendar: all 10 rules available back to ${rangeStart}`, expected: '0 incomplete days', actual: `${incomplete.length} incomplete`,
    status: incomplete.length ? STATUS.FAIL : STATUS.PASS,
    note: incomplete.length ? `e.g. ${incomplete.slice(0, 3).map(d => `${d} (no ${snaps.get(d).missing.map(short).join(', ')})`).join('; ')}` : '' })
  const calMaps = { bullish: new Map(), bearish: new Map() }
  const calBad = []
  let calDays = 0
  for (let m = new Date(rangeStart.slice(0, 7) + '-01T00:00:00Z'); m.toISOString().slice(0, 7) <= live.slice(0, 7); m.setUTCMonth(m.getUTCMonth() + 1)) {
    const { bullish, bearish } = calendarMonthSignals(snaps, item, m.getUTCFullYear(), m.getUTCMonth())
    for (const [d, names] of bullish) {
      calMaps.bullish.set(d, names)
      calMaps.bearish.set(d, bearish.get(d) || [])
      calDays++
      const expBuy = d === live ? tBuy : snaps.get(d).buy, expSell = d === live ? tSell : snaps.get(d).sell
      if (!listsEqual(names, expBuy) || !listsEqual(bearish.get(d) || [], expSell)) calBad.push(d)
    }
  }
  const calMissing = [...snaps.keys()].filter(d => d >= rangeStart.slice(0, 7) + '-01' && !calMaps.bullish.has(d))
  add({ group: G, name: `Signal calendar = daily closes; today = table (${calDays} days)`, expected: '0 differ, 0 missing',
    actual: `${calBad.length} differ, ${calMissing.length} missing`, status: calBad.length || calMissing.length ? STATUS.FAIL : STATUS.PASS,
    note: [...calBad.slice(0, 5), ...calMissing.slice(0, 5).map(d => `${d} missing`)].join('; ') })

  // 4. Currency matrix: cell counts = table badges; Δ baseline = calendar's close 7 days back
  const mc = tableCounts(item)
  const okCell = mc.bullish === tBuy.length && mc.bearish === tSell.length && mc.bullish + mc.bearish + mc.neutral === TOTAL_INDICATORS
  add({ group: G, name: 'Matrix cell (bullish / bearish / neutral) = table badges', expected: `${tBuy.length} / ${tSell.length} / ${TOTAL_INDICATORS - tBuy.length - tSell.length}`,
    actual: `${mc.bullish} / ${mc.bearish} / ${mc.neutral}`, status: okCell ? STATUS.PASS : STATUS.FAIL, note: '' })
  if (!mb) {
    add({ group: G, name: 'Matrix Δ vs 7 days ago', expected: 'baseline', actual: 'none', status: STATUS.FAIL, note: 'Matrix could not build its 7-day baseline' })
  } else {
    const expectedKey = addDays(live, -7)
    const calSnap = snaps.get(mb.date)
    const ws = recompute[mb.date] || {}
    const vsCal = calSnap && listsEqual(mb.buy, calSnap.buy) && listsEqual(mb.sell, calSnap.sell)
    const recBuy = E.SLOT_NAMES.filter(sl => ws[sl]?.state === 'BUY'), recSell = E.SLOT_NAMES.filter(sl => ws[sl]?.state === 'SELL')
    const vsRec = listsEqual(mb.buy, recBuy) && listsEqual(mb.sell, recSell)
    const dB = tBuy.length - mb.buy.length, dS = tSell.length - mb.sell.length
    add({ group: G, name: `Matrix Δ baseline (close ${mb.date}) = calendar = recompute`,
      expected: `≤ ${expectedKey}; calendar ${calSnap?.buy.length ?? '–'}/${calSnap?.sell.length ?? '–'}; recompute ${recBuy.length}/${recSell.length}`,
      actual: `${mb.date}; ${mb.buy.length} buy / ${mb.sell.length} sell${mb.missing.length ? ` (${mb.missing.length} no data)` : ''}`,
      status: mb.date > expectedKey || !vsCal || mb.missing.length ? STATUS.FAIL : !vsRec ? STATUS.WARN : STATUS.PASS,
      note: `Matrix shows Δ bullish ${dB >= 0 ? '+' : ''}${dB}, Δ bearish ${dS >= 0 ? '+' : ''}${dS}` +
        (vsCal ? '' : ' - DIFFERS from the calendar for the same day') + (vsRec ? '' : ' - differs from recompute (borderline?)') })
  }

  // 5. Chart volume bars (daily + weekly view) via the chart's own function
  const chDaily = chartCandles(fromKey(daily, addDays(today, -CHART_WINDOW_DAYS.daily)), 'daily')
  const vDaily = volumeBarsFromSnapshots(chDaily, snaps, 'daily', item)
  const volBad = [], volVsCal = []
  let fullFrom = null
  vDaily.stackedData?.bullish.forEach((b, i) => {
    const buy = b.value, sell = vDaily.stackedData.bearish[i].value - b.value
    const exp = b.day === live ? { bullish: tBuy.length, bearish: tSell.length } : snapshotCounts(snaps.get(b.day))
    if (buy !== exp.bullish || sell !== exp.bearish) volBad.push(`${b.day}: bars ${buy}/${sell} vs ${exp.bullish}/${exp.bearish}`)
    if (calMaps.bullish.has(b.day) && (buy !== calMaps.bullish.get(b.day).length || sell !== calMaps.bearish.get(b.day).length)) volVsCal.push(b.day)
    if (!fullFrom && !snaps.get(b.day)?.missing.length) fullFrom = b.day
  })
  const nBars = vDaily.stackedData?.bullish.length || 0
  add({ group: G, name: `Chart volume bars (daily) = daily closes; last bar = table (${nBars} bars)`, expected: '0 differ',
    actual: `${volBad.length} differ`, status: volBad.length || !nBars ? STATUS.FAIL : STATUS.PASS, note: volBad.slice(0, 5).join('; ') })
  add({ group: G, name: 'Chart volume bars = signal calendar (same days)', expected: '0 differ', actual: `${volVsCal.length} differ`,
    status: volVsCal.length ? STATUS.FAIL : STATUS.PASS, note: volVsCal.slice(0, 5).join(', ') })
  add({ group: G, name: 'Chart volume bars: days with all 10 rules', expected: 'informational', actual: fullFrom ? `from ${fullFrom}` : 'none',
    status: STATUS.INFO, note: 'Older bars count fewer rules: not enough history before them for EMA 200 / weekly EMA 20 / hourly EMA 100 to settle' })

  const chWeekly = chartCandles(weeksFromKey(weekly, addDays(today, -CHART_WINDOW_DAYS.weekly)), 'weekly')
  const vWeekly = volumeBarsFromSnapshots(chWeekly, snaps, 'weekly', item)
  const snapKeys = [...snaps.keys()]
  const wBad = []
  vWeekly.stackedData?.bullish.forEach((b, i) => {
    const start = dayKey(b.time)
    const lastDay = snapKeys.filter(d => d >= start && d < addDays(start, 7)).pop()
    if (lastDay !== b.day) { wBad.push(`${start}: bar uses ${b.day}, last close ${lastDay}`); return }
    const sell = vWeekly.stackedData.bearish[i].value - b.value
    const exp = b.day === live ? { bullish: tBuy.length, bearish: tSell.length } : snapshotCounts(snaps.get(b.day))
    if (b.value !== exp.bullish || sell !== exp.bearish) wBad.push(`${start}: ${b.value}/${sell} vs ${exp.bullish}/${exp.bearish}`)
  })
  add({ group: G, name: `Chart volume bars (weekly) = week's last close (${vWeekly.stackedData?.bullish.length || 0} bars)`, expected: '0 differ',
    actual: `${wBad.length} differ`, status: wBad.length ? STATUS.FAIL : STATUS.PASS, note: wBad.slice(0, 5).join('; ') })

  // 6. Chart lines (what the chart draws) vs the daily-close signals, last 60 closes
  const recent = closedInRange.slice(-CHART_HISTORY_COMPARE_DAYS)
  const perInd = {}
  for (const d of recent) {
    const upto = chDaily.filter(c => dayKey(c.time) <= d)
    const cs = chartAsBackendShape(computeChartIndicators(upto, 'daily'), null, null).daily
    const snap = snaps.get(d)
    for (const spec of SPECS.filter(sp => sp.tf === 'daily')) {
      const slot = Object.keys(SLOT_SPEC).find(k => SLOT_SPEC[k] === spec.id)
      if (!(slot in snap.states) || !cs[spec.key]) continue
      if (sig(snap.states[slot]) !== sig(cs[spec.key].signal)) {
        const border = spec.margin(cs[spec.key], cs.ema_9?.current_price || 1) < spec.near / 10
        ;(perInd[spec.label] ||= []).push(d + (border ? '*' : ''))
      }
    }
  }
  const lineBad = Object.values(perInd).flat()
  const hard = lineBad.filter(d => !d.endsWith('*'))
  add({ group: G, name: `Chart lines = daily-close signals (last ${recent.length} closes)`, expected: '0 days differ', actual: `${lineBad.length} indicator-days differ`,
    status: hard.length ? STATUS.FAIL : lineBad.length ? STATUS.WARN : STATUS.PASS,
    note: Object.entries(perInd).map(([k, ds]) => `${k}: ${ds.slice(-4).join(', ')}`).join('; ') + (lineBad.length > hard.length ? ' (* = borderline)' : '') })

  // 7. History popup = day-to-day changes in the signal calendar
  const histFrom = addDays(today, -HISTORY_DAYS)
  const calDaysSorted = [...calMaps.bullish.keys()].filter(d => d < live).sort()
  const st = (day, slot) => (calMaps.bullish.get(day).includes(slot) ? 'BUY' : calMaps.bearish.get(day).includes(slot) ? 'SELL' : null)
  const expectedChanges = new Set()
  for (let i = 1; i < calDaysSorted.length; i++) {
    const d = calDaysSorted[i], p = calDaysSorted[i - 1]
    if (d < histFrom) continue
    for (const slot of E.SLOT_NAMES) {
      if (slot === 'EMA_100_Hourly') continue
      if (st(d, slot) !== st(p, slot)) expectedChanges.add(`${d} ${slot} ${sig(st(p, slot))}>${sig(st(d, slot))}`)
    }
  }
  const got = new Set(history.map(c => `${c.timestamp.slice(0, 10)} ${LOG_TO_SLOT[`${c.indicator}|${c.timeframe}`]} ${sig(c.old_signal)}>${sig(c.new_signal)}`))
  const onlyCal = [...expectedChanges].filter(x => !got.has(x)), onlyHist = [...got].filter(x => !expectedChanges.has(x))
  add({ group: G, name: `History popup = signal calendar changes (${HISTORY_DAYS} days)`, expected: `${expectedChanges.size} changes`, actual: `${got.size} changes`,
    status: onlyCal.length || onlyHist.length ? STATUS.FAIL : STATUS.PASS,
    note: [...onlyCal.slice(0, 3).map(x => `calendar only: ${x}`), ...onlyHist.slice(0, 3).map(x => `history only: ${x}`)].join('; ') })

  // 8. MA Cross banner: counts and the cross itself vs the daily closes
  if (alerts.length) {
    const a = alerts[0]
    const c = maCrossAlertCounts(a, item)
    const sumOk = c && c.bullish + c.bearish + c.neutral === TOTAL_INDICATORS
    const day = a.cross_date
    const idx = snapKeys.indexOf(day)
    const at = idx >= 0 ? (day === live ? tableState('MA_Crossover_Daily') : snaps.get(day).states.MA_Crossover_Daily) : undefined
    const before = idx > 0 ? snaps.get(snapKeys[idx - 1]).states.MA_Crossover_Daily : undefined
    const crossOk = at === a.direction && before !== a.direction
    let nearest = null
    for (let k = Math.max(1, idx - 5); idx >= 0 && k <= Math.min(snapKeys.length - 1, idx + 5); k++) {
      const cur = snaps.get(snapKeys[k]).states.MA_Crossover_Daily, prv = snaps.get(snapKeys[k - 1]).states.MA_Crossover_Daily
      if (cur === a.direction && prv !== a.direction && (!nearest || Math.abs(k - idx) < Math.abs(snapKeys.indexOf(nearest) - idx))) nearest = snapKeys[k]
    }
    add({ group: G, name: `MA Cross banner: latest alert (${a.direction} ${day})`, expected: `cross on ${day}; counts sum to ${TOTAL_INDICATORS}`,
      actual: `close ${day}: ${sig(at)} (prev ${sig(before)}); ${c ? `${c.bullish}/${c.bearish}/${c.neutral}${c.live ? ' live' : ''}` : 'no counts'}`,
      status: !sumOk ? STATUS.FAIL : crossOk ? STATUS.PASS : STATUS.WARN,
      note: crossOk ? '' : nearest
        ? `Daily closes show this cross on ${nearest} - the alert dated it from the live (intraday) bar or the pre-Trading-Rules formulas`
        : 'No matching cross in the daily closes within 5 days (intraday cross that reversed, or detected with the pre-Trading-Rules formulas)' })
  }
}

// ---------------------------------------------------------------- per symbol

const auditSymbol = async (item, api, now) => {
  const checks = []
  const add = (c) => checks.push(c)
  const symbol = item.symbol
  const today = now.toISOString().slice(0, 10)

  // Fetch exactly what the views fetch (signalViews.fetchCloseSnapshots), then slice the
  // backend / chart windows out of it. getCandles is memoised per run, so shared windows
  // hit the data service once.
  let viewData = null, matrixData = null, fetchError = null
  const [changesRaw] = await Promise.all([
    api.getSignalChanges(symbol, 500).catch(e => ({ error: e })),
    fetchCloseSnapshots(symbol, { getCandles: api.getCandles }).then(r => { viewData = r }).catch(e => { fetchError = e }),
    fetchCloseSnapshots(symbol, { getCandles: api.getCandles, hourlyDays: MATRIX_HOURLY_DAYS }).then(r => { matrixData = r }).catch(() => {}),
  ])
  if (fetchError || !viewData) add({ group: 'Data', name: 'Fetch candles (daily / weekly / hourly)', expected: 'data', actual: 'error', status: STATUS.FAIL, note: String(fetchError?.message || fetchError || 'no data') })
  if (changesRaw?.error) add({ group: 'Data', name: 'Fetch signal log', expected: 'data', actual: 'error', status: STATUS.FAIL, note: String(changesRaw.error?.message || changesRaw.error) })
  const daily = sortCandles(viewData?.daily || [])
  const hourly = sortCandles(viewData?.hourly || [])
  const weekly = sortCandles(viewData?.weekly || [])
  const changes = Array.isArray(changesRaw) ? changesRaw : []
  const snaps = viewData?.snapshots || new Map()

  // ---------- data & freshness
  const engDaily = fromKey(daily, addDays(today, -E.DAILY_WINDOW_DAYS))
  const engHourly = fromKey(hourly, addDays(today, -E.HOURLY_WINDOW_DAYS))
  const engWeekly = weeksFromKey(weekly, addDays(today, -E.WEEKLY_WINDOW_DAYS))
  const weekdayBars = engDaily.filter(c => E.isWeekdayKey(dayKey(c.time))).length
  add({ group: 'Data', name: `Daily bars in signal window (${E.DAILY_WINDOW_DAYS} days)`, expected: '≥ 200 (EMA 200)', actual: String(weekdayBars),
    status: weekdayBars >= 200 ? STATUS.PASS : STATUS.FAIL, note: weekdayBars >= 200 ? '' : 'EMA 200 will show N/A' })
  add({ group: 'Data', name: `Hourly bars in signal window (${E.HOURLY_WINDOW_DAYS} days)`, expected: '≥ 100 (EMA 100)', actual: String(engHourly.length),
    status: engHourly.length >= 100 ? STATUS.PASS : STATUS.FAIL, note: '' })
  add({ group: 'Data', name: `Weekly bars in signal window (${E.WEEKLY_WINDOW_DAYS} days)`, expected: '≥ 20 (BB/EMA 20)', actual: String(engWeekly.length),
    status: engWeekly.length >= 20 ? STATUS.PASS : STATUS.FAIL, note: '' })

  const marketOpen = isFxMarketOpen(now)
  const updated = parseServerTime(item.last_update)
  const ageMin = updated == null ? null : (now.getTime() - updated) / 60000
  add({ group: 'Data', name: 'Table last updated', expected: marketOpen ? '≤ 15 min ago' : 'market closed',
    actual: ageMin == null ? 'unknown' : ageMin < 120 ? `${ageMin.toFixed(0)} min ago` : `${(ageMin / 60).toFixed(1)} h ago`,
    status: ageMin == null ? STATUS.FAIL : !marketOpen ? STATUS.INFO : ageMin > 120 ? STATUS.FAIL : ageMin > 15 ? STATUS.WARN : ageMin < -5 ? STATUS.WARN : STATUS.PASS,
    note: ageMin != null && ageMin < -5 ? 'Timestamp is in the future - server clock/timezone?' : !marketOpen ? 'FX market closed - staleness expected' : '' })

  const lastDaily = last(daily)
  const tablePrice = fin(item.price)
  if (lastDaily && tablePrice != null) {
    const d = rel(tablePrice, lastDaily.close)
    add({ group: 'Data', name: 'Table price vs latest candle close', expected: lastDaily.close.toFixed(5), actual: tablePrice.toFixed(5),
      status: d > 3e-3 ? STATUS.FAIL : d > 5e-4 ? STATUS.WARN : STATUS.PASS, note: `${(d * 100).toFixed(3)}% apart` })
  }
  const calcPrice = fin(item.daily_indicators?.ema_9?.current_price)
  if (calcPrice != null && tablePrice != null) {
    add({ group: 'Data', name: 'Table price = price the signals were computed with', expected: calcPrice.toFixed(5), actual: tablePrice.toFixed(5),
      status: rel(calcPrice, tablePrice) > 1e-6 ? STATUS.WARN : STATUS.PASS, note: '' })
  }

  // ---------- independent recompute (same windows as the backend, same price)
  const withPrice = (candles, p) => (p == null || !candles.length ? candles : [...candles.slice(0, -1), { ...last(candles), close: p }])
  const dPrice = fin(item.daily_indicators?.ema_9?.current_price) ?? tablePrice ?? lastDaily?.close
  const hPrice = fin(item.hourly_indicators?.ema_100?.current_price) ?? dPrice
  const wPrice = fin(item.weekly_indicators?.ema_20?.current_price) ?? dPrice
  const engine = {
    daily: E.dailyIndicators(withPrice(engDaily, dPrice), dPrice),
    hourly: E.hourlyIndicators(withPrice(engHourly, hPrice), hPrice),
    weekly: E.weeklyIndicators(withPrice(engWeekly, wPrice), wPrice),
  }
  const table = { daily: item.daily_indicators || {}, hourly: item.hourly_indicators || {}, weekly: item.weekly_indicators || {} }

  // ---------- chart (ChartModal code, ChartModal windows, live candles)
  const chDaily = chartCandles(fromKey(daily, addDays(today, -CHART_WINDOW_DAYS.daily)), 'daily')
  const chHourly = chartCandles(fromKey(hourly, addDays(today, -CHART_WINDOW_DAYS.hourly)), 'hourly')
  const chWeekly = chartCandles(weeksFromKey(weekly, addDays(today, -CHART_WINDOW_DAYS.weekly)), 'weekly')
  const chart = chartAsBackendShape(
    chDaily.length > 30 ? computeChartIndicators(chDaily, 'daily') : null,
    chHourly.length > 100 ? computeChartIndicators(chHourly, 'hourly') : null,
    chWeekly.length > 20 ? computeChartIndicators(chWeekly, 'weekly') : null,
  )

  const engineResults = {}, chartResults = {}
  for (const spec of SPECS) {
    const t = table[spec.tf]?.[spec.key] || null
    const r1 = compareIndicator(spec, engine[spec.tf]?.[spec.key] || null, t, 'engine', dPrice, 'engine')
    engineResults[spec.id] = r1
    add(r1)
  }
  const chartPrice = last(chDaily)?.close
  const moved = chartPrice != null && dPrice != null ? rel(chartPrice, dPrice) : 0
  for (const spec of SPECS) {
    const t = table[spec.tf]?.[spec.key] || null
    let r2 = compareIndicator(spec, chart[spec.tf]?.[spec.key] || null, t, 'chart', dPrice, 'chart')
    // The chart uses the latest candle, the table the price at its last update. If the table
    // agrees with the engine at its own price and the price has moved since, a different
    // chart signal is market movement, not a calculation error.
    if (r2.status === STATUS.FAIL && r2.note.startsWith('SIGNAL') && engineResults[spec.id]?.status !== STATUS.FAIL && moved > 5e-5) {
      r2 = { ...r2, status: STATUS.WARN, priceMoved: true,
        note: `Price moved since the table was computed (${dPrice} -> ${chartPrice}, ${(moved * 100).toFixed(3)}%); table matches the engine at its own price. ${r2.note.replace('SIGNAL MISMATCH.', '').trim()}`.trim() }
    }
    chartResults[spec.id] = r2
    add(r2)
  }

  // MA Cross: last cross date / direction shown in the table
  const tMac = table.daily.ma_crossover, eMac = engine.daily?.ma_crossover
  if (tMac && eMac) {
    const sameDir = tMac.last_cross_direction === eMac.last_cross_direction
    const sameDate = tMac.last_cross_date === eMac.last_cross_date
    add({ group: 'Table vs engine', name: 'MA Cross · last cross (arrow + date)',
      expected: `${eMac.last_cross_direction} ${eMac.last_cross_date}`, actual: `${tMac.last_cross_direction} ${tMac.last_cross_date}`,
      status: sameDir && sameDate ? STATUS.PASS : !sameDir ? STATUS.FAIL : STATUS.WARN, note: sameDate ? '' : 'Cross date differs' })
  }

  // ---------- badges
  const derived = E.extractSignals(table)
  const tBuy = item.buy_signals || [], tSell = item.sell_signals || []
  const eqList = (a, b) => a.length === b.length && a.every((v) => b.includes(v))
  add({ group: 'Badges', name: 'Green/red badge counts = column signals', expected: `${derived.buy.length} buy / ${derived.sell.length} sell`,
    actual: `${tBuy.length} buy / ${tSell.length} sell`,
    status: eqList(derived.buy, tBuy) && eqList(derived.sell, tSell) ? STATUS.PASS : STATUS.FAIL,
    note: eqList(derived.buy, tBuy) && eqList(derived.sell, tSell) ? '' : `Columns say BUY [${derived.buy.join(', ')}] SELL [${derived.sell.join(', ')}]` })

  const naCols = SPECS.filter(s => !table[s.tf]?.[s.key]).map(s => s.label)
  add({ group: 'Badges', name: 'Grey badge (neutral) has no N/A columns', expected: '0 N/A', actual: naCols.length ? naCols.join(', ') : '0 N/A',
    status: naCols.length ? STATUS.FAIL : STATUS.PASS,
    note: naCols.length ? `Grey count ${TOTAL_INDICATORS - tBuy.length - tSell.length} includes ${naCols.length} N/A column(s) counted as neutral` : '' })

  for (const [ref, results, refSignals] of [['engine', engineResults, E.extractSignals(engine)], ['chart', chartResults, E.extractSignals(chart)]]) {
    const same = refSignals.buy.length === tBuy.length && refSignals.sell.length === tSell.length
    const failed = Object.values(results).filter(r => r.status === STATUS.FAIL && r.note.startsWith('SIGNAL'))
    add({ group: 'Badges', name: `Badge counts vs ${ref}`, expected: `${refSignals.buy.length} buy / ${refSignals.sell.length} sell`,
      actual: `${tBuy.length} buy / ${tSell.length} sell`,
      status: same ? STATUS.PASS : failed.length ? STATUS.FAIL : STATUS.WARN,
      note: same ? '' : failed.length ? `Caused by: ${failed.map(f => f.name).join(', ')}` : 'Only borderline indicators differ' })
  }

  // ---------- signal timestamps
  const badTs = []
  for (const spec of SPECS) {
    const t = table[spec.tf]?.[spec.key]
    if (!t?.signal) continue
    const ts = parseServerTime(typeof t.signal_timestamp === 'string' ? t.signal_timestamp : t.signal_timestamp?.$date)
    if (ts == null) badTs.push(`${spec.label}: missing`)
    else if (ts > now.getTime() + 5 * 60000) badTs.push(`${spec.label}: in the future`)
  }
  add({ group: 'Badges', name: 'Signal timestamps present and not in the future', expected: 'all valid', actual: badTs.length ? `${badTs.length} bad` : 'all valid',
    status: badTs.length ? STATUS.WARN : STATUS.PASS, note: badTs.join('; ') })

  // ---------- history: candle rebuild (what the 📜 popup shows)
  const history = historyFromSnapshots(snaps, { historyDays: HISTORY_DAYS, today }) // = Dashboard history popup

  const byKey = {}
  for (const c of [...history].reverse()) (byKey[`${c.indicator}|${c.timeframe}`] ||= []).push(c)
  const chainBreaks = [], badDates = []
  for (const [k, list] of Object.entries(byKey)) {
    for (let i = 1; i < list.length; i++) if (list[i].old_signal !== list[i - 1].new_signal) chainBreaks.push(`${k} @ ${list[i].timestamp.slice(0, 10)}`)
    const days = new Set()
    for (const c of list) {
      const d = c.timestamp.slice(0, 10)
      if (!E.isWeekdayKey(d) || d >= today) badDates.push(`${k} ${d}`)
      if (days.has(d)) badDates.push(`${k} ${d} (twice)`)
      days.add(d)
    }
  }
  add({ group: 'History', name: 'History popup: every change continues from the previous one', expected: '0 breaks', actual: `${chainBreaks.length} breaks (${history.length} changes)`,
    status: chainBreaks.length ? STATUS.FAIL : STATUS.PASS, note: chainBreaks.slice(0, 5).join('; ') })
  add({ group: 'History', name: 'History popup: dates are closed weekdays, one per day', expected: '0 bad', actual: `${badDates.length} bad`,
    status: badDates.length ? STATUS.FAIL : STATUS.PASS, note: badDates.slice(0, 5).join('; ') })

  // State at the last daily close, computed independently, vs the history's final state
  const liveBarKey = daily.length ? dayKey(last(daily).time) : today
  const closedDaily = daily.filter(c => dayKey(c.time) < today && dayKey(c.time) < liveBarKey && E.isWeekdayKey(dayKey(c.time)))
  const lastClosed = last(closedDaily)
  let closeStates = {}
  if (lastClosed) {
    const lcKey = dayKey(lastClosed.time)
    const win = closedDaily.filter(c => dayKey(c.time) >= addDays(lcKey, -E.DAILY_WINDOW_DAYS))
    closeStates = dailyStates(win.map(c => c.close))
    const wk = weeksFromKey(weekly, addDays(lcKey, -E.WEEKLY_WINDOW_DAYS)).filter(w => dayKey(w.time) <= lcKey).map(w => w.close)
    if (wk.length) { wk[wk.length - 1] = lastClosed.close; Object.assign(closeStates, weeklyStates(wk, lastClosed.close)) }

    const mism = []
    for (const [k, list] of Object.entries(byKey)) {
      const fromHistory = last(list).new_signal
      if (k in closeStates && sig(fromHistory) !== sig(closeStates[k])) mism.push(`${k}: history ${sig(fromHistory)} vs ${sig(closeStates[k])}`)
    }
    add({ group: 'History', name: `History popup final state = engine at last close (${lcKey})`, expected: 'all equal', actual: mism.length ? `${mism.length} differ` : 'all equal',
      status: mism.length ? STATUS.FAIL : STATUS.PASS, note: mism.join('; ') })

    // Intraday vs end-of-day (the "EOD neutral, intraday SELL" situation)
    const intraday = []
    for (const spec of SPECS.filter(s => s.tf !== 'hourly')) {
      const t = table[spec.tf]?.[spec.key]
      if (!t || !(spec.logKey in closeStates)) continue
      if (sig(t.signal) !== sig(closeStates[spec.logKey])) intraday.push(`${spec.label}: close ${sig(closeStates[spec.logKey])} → now ${sig(t.signal)}`)
    }
    add({ group: 'History', name: `Table (live) vs last daily close (${lcKey})`, expected: 'informational', actual: intraday.length ? `${intraday.length} changed intraday` : 'same as close',
      status: STATUS.INFO, note: intraday.length ? `Live candle moved these; history will record them only if they hold at the close. ${intraday.join('; ')}` : '' })
  }

  // ---------- history: live change log (backend MongoDB)
  const logByKey = {}
  for (const c of [...changes].sort((a, b) => parseServerTime(a.timestamp) - parseServerTime(b.timestamp))) (logByKey[`${c.indicator}|${c.timeframe}`] ||= []).push(c)
  const logMismatch = [], logChain = []
  for (const spec of SPECS) {
    const list = logByKey[spec.logKey]
    if (!list?.length) continue
    const t = table[spec.tf]?.[spec.key]
    if (t && sig(last(list).new_signal) !== sig(t.signal)) logMismatch.push(`${spec.label}: log ${sig(last(list).new_signal)} vs table ${sig(t.signal)}`)
    for (let i = 1; i < list.length; i++) if (sig(list[i].old_signal) !== sig(list[i - 1].new_signal)) logChain.push(`${spec.label} @ ${String(list[i].timestamp).slice(0, 16)}`)
  }
  add({ group: 'History', name: 'Live change log: latest entry = table signal', expected: 'all equal',
    actual: changes.length ? (logMismatch.length ? `${logMismatch.length} differ` : 'all equal') : 'no log entries',
    status: !changes.length ? STATUS.INFO : logMismatch.length ? STATUS.FAIL : STATUS.PASS, note: logMismatch.join('; ') })
  add({ group: 'History', name: 'Live change log: every change continues from the previous one', expected: '0 breaks', actual: `${logChain.length} breaks (${changes.length} entries)`,
    status: logChain.length ? STATUS.WARN : STATUS.PASS, note: logChain.length ? `Gaps usually mean the indicator was N/A in between or the service restarted. ${logChain.slice(0, 5).join('; ')}` : '' })

  auditViews({ add, item, snaps, matrixSnaps: matrixData?.snapshots, daily, weekly, hourly, history, today, engineResults, chartResults, alerts: api.alertsBySymbol?.[symbol] || [] })

  const summary = { pass: 0, warn: 0, fail: 0, info: 0 }
  for (const c of checks) summary[c.status]++
  return { symbol, price: tablePrice, checks, summary }
}

// ---------------------------------------------------------------- runner

// Endpoints the audit may call. None of them touches TradingEconomics (quota-limited):
// price-data -> Massive; watchlist / signal changes / MA cross alerts -> MongoDB.
export const ALLOWED_ENDPOINTS = [
  { label: 'Signal service status', re: /^\/$/ },
  { label: 'Watchlist (MongoDB)', re: /^\/api\/watchlist\/?$/ },
  { label: 'Price candles (Massive)', re: /^\/api\/history\/price-data\// },
  { label: 'Signal change log (MongoDB)', re: /^\/api\/signals\/changes\// },
  { label: 'MA Cross alerts (MongoDB)', re: /^\/api\/ma-cross-alerts\/?$/ },
]

/**
 * api: { getStatus(), getWatchlist() -> [], getCandles(symbol, days, timespan) -> [],
 *        getSignalChanges(symbol, limit) -> [], getMACrossAlerts?(limit) -> [] }
 * getNetworkUrls?(): every URL the page requested during the run (API usage check).
 */
export const runSignalAudit = async ({ api: rawApi, symbols = null, concurrency = 3, onProgress, onSymbol, isCancelled = () => false, now = new Date(), getNetworkUrls = null }) => {
  const startedAt = new Date()
  const global = [...selfTest()]

  // Memoise candle requests for the run: views share windows, fetch each once
  const calls = { candles: 0, candlesShared: 0 }
  const memo = new Map()
  const api = {
    ...rawApi,
    getCandles: (s, d, t) => {
      const k = `${s}|${d}|${t}`
      if (memo.has(k)) { calls.candlesShared++; return memo.get(k) }
      calls.candles++
      const p = rawApi.getCandles(s, d, t)
      memo.set(k, p)
      p.catch(() => memo.delete(k))
      return p
    },
    alertsBySymbol: {},
  }

  try {
    await api.getStatus()
    global.push({ group: 'Services', name: 'Signal service reachable', expected: 'online', actual: 'online', status: STATUS.PASS, note: '' })
  } catch (e) {
    global.push({ group: 'Services', name: 'Signal service reachable', expected: 'online', actual: 'error', status: STATUS.FAIL, note: String(e?.message || e) })
  }

  let watchlist = []
  try {
    watchlist = await api.getWatchlist()
    global.push({ group: 'Services', name: 'Watchlist loaded', expected: '> 0 pairs', actual: `${watchlist.length} pairs`, status: watchlist.length ? STATUS.PASS : STATUS.FAIL, note: '' })
  } catch (e) {
    global.push({ group: 'Services', name: 'Watchlist loaded', expected: '> 0 pairs', actual: 'error', status: STATUS.FAIL, note: String(e?.message || e) })
  }

  if (rawApi.getMACrossAlerts) {
    try {
      const alerts = await rawApi.getMACrossAlerts(500)
      for (const a of alerts) (api.alertsBySymbol[a.symbol] ||= []).push(a) // newest first
      global.push({ group: 'Services', name: 'MA Cross alerts loaded', expected: 'reachable', actual: `${alerts.length} alerts`, status: STATUS.PASS, note: '' })
    } catch (e) {
      global.push({ group: 'Services', name: 'MA Cross alerts loaded', expected: 'reachable', actual: 'error', status: STATUS.WARN, note: String(e?.message || e) })
    }
  }

  const items = symbols ? watchlist.filter(w => symbols.includes(w.symbol)) : watchlist
  const results = new Array(items.length)
  let done = 0, next = 0
  const worker = async () => {
    while (next < items.length && !isCancelled()) {
      const idx = next++
      const item = items[idx]
      try {
        results[idx] = await auditSymbol(item, api, now)
      } catch (e) {
        results[idx] = { symbol: item.symbol, price: item.price, summary: { pass: 0, warn: 0, fail: 1, info: 0 },
          checks: [{ group: 'Data', name: 'Audit crashed', expected: '-', actual: 'error', status: STATUS.FAIL, note: String(e?.stack || e) }] }
      }
      done++
      onSymbol?.(results[idx])
      onProgress?.({ done, total: items.length, symbol: item.symbol })
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, worker))

  // API usage: only allow-listed endpoints, never TradingEconomics-backed ones
  global.push({ group: 'Services', name: 'Candle requests (Massive, no quota)', expected: 'informational',
    actual: `${calls.candles} requests (${calls.candlesShared} reused)`, status: STATUS.INFO, note: 'Each window is fetched once and shared by every view check' })
  if (getNetworkUrls) {
    const byLabel = {}, unexpected = []
    for (const u of getNetworkUrls()) {
      let path
      try { path = new URL(u).pathname } catch { continue }
      const hit = ALLOWED_ENDPOINTS.find(e => e.re.test(path))
      if (hit) byLabel[hit.label] = (byLabel[hit.label] || 0) + 1
      else unexpected.push(path)
    }
    global.push({ group: 'Services', name: 'No TradingEconomics / unexpected API calls during the run', expected: '0 unexpected',
      actual: unexpected.length ? `${unexpected.length} unexpected` : `0 unexpected (${Object.values(byLabel).reduce((a, b) => a + b, 0)} calls)`,
      status: unexpected.length ? STATUS.FAIL : STATUS.PASS,
      note: unexpected.length ? [...new Set(unexpected)].slice(0, 6).join(', ') : Object.entries(byLabel).map(([k, v]) => `${k}: ${v}`).join('; ') })
  }

  const symbolsOut = results.filter(Boolean)
  const totals = { pass: 0, warn: 0, fail: 0, info: 0 }
  for (const c of global) totals[c.status]++
  for (const s of symbolsOut) for (const k of Object.keys(totals)) totals[k] += s.summary[k]
  return { startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), cancelled: isCancelled(), global, symbols: symbolsOut, totals }
}
