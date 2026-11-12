// Shared logic behind every signal view: dashboard table badges, currency matrix (+ Δ vs
// 7 days), signal calendar, chart volume bars, MA Cross banner. Views call these
// functions and the /test audit page calls the very same functions, so "what the view
// shows" is exactly what gets verified.

import { historyAPI } from '../api/api'
import { buildCloseSnapshots, snapshotOnOrBefore, SNAPSHOT_FETCH, TOTAL_RULES, HOURLY_WINDOW_DAYS } from './signalEngine'

export { TOTAL_RULES }

// ---------------------------------------------------------------- counts

/** Badge counts for a live watchlist row (table, matrix, MA Cross banner). */
export const tableCounts = (item) => {
  const bullish = item?.buy_signals?.length || 0
  const bearish = item?.sell_signals?.length || 0
  return { bullish, bearish, neutral: Math.max(TOTAL_RULES - bullish - bearish, 0) }
}

export const snapshotCounts = (snap) => ({
  bullish: snap.buy.length,
  bearish: snap.sell.length,
  neutral: TOTAL_RULES - snap.buy.length - snap.sell.length,
})

/** MA Cross banner: counts recorded when the cross was detected, else the row's live counts. */
export const maCrossAlertCounts = (alert, item) => {
  if (alert.bullish_count != null) {
    return { bullish: alert.bullish_count, bearish: alert.bearish_count, neutral: alert.neutral_count, live: false }
  }
  if (!item) return null
  return { ...tableCounts(item), live: true }
}

// ---------------------------------------------------------------- fetching

const snapCache = new Map() // symbol -> { at, promise }
const SNAP_TTL_MS = 5 * 60 * 1000

/**
 * Daily + weekly + hourly candles -> close snapshots. Every view requests the same daily /
 * weekly windows (SNAPSHOT_FETCH), so the data service cache is shared between them.
 * `hourlyDays` only limits how far back the hourly rule is available (the matrix needs
 * ~1 week, the calendar ~15 months); EMA 100 converges within a few weeks of bars, so the
 * value on a given day does not depend on it (verified on /test).
 * `getCandles(symbol, days, timespan)` can be injected (the /test page counts requests).
 */
export const MATRIX_HOURLY_DAYS = HOURLY_WINDOW_DAYS + 14

export const fetchCloseSnapshots = (symbol, { getCandles = null, hourlyDays = SNAPSHOT_FETCH.hourly } = {}) => {
  const ticker = symbol.startsWith('C:') ? symbol : `C:${symbol}`
  const fetcher = getCandles || defaultGetCandles
  const run = async () => {
    const [daily, weekly, hourly] = await Promise.all([
      fetcher(ticker, SNAPSHOT_FETCH.daily, 'day'),
      fetcher(ticker, SNAPSHOT_FETCH.weekly, 'week'),
      fetcher(ticker, hourlyDays, 'hour').catch(() => []), // hourly rule then shows as missing
    ])
    return { snapshots: buildCloseSnapshots({ daily, weekly, hourly }), daily, weekly, hourly }
  }
  if (getCandles) return run()
  const key = `${ticker}|${hourlyDays}`
  const hit = snapCache.get(key)
  if (hit && Date.now() - hit.at < SNAP_TTL_MS) return hit.promise
  const promise = run().catch(e => { snapCache.delete(key); throw e })
  snapCache.set(key, { at: Date.now(), promise })
  return promise
}

const defaultGetCandles = (s, d, t) => historyAPI.getPriceHistory(s, d, t).then(r => r.data?.candles || [])

/** Run async jobs with a concurrency limit. */
export const mapLimit = async (items, limit, fn) => {
  const out = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

// ---------------------------------------------------------------- "today"

/** The live trading day = date of the latest (forming) daily candle. */
export const liveDayKey = (snaps) => {
  let last = null
  for (const k of snaps.keys()) last = k
  return last
}

// ---------------------------------------------------------------- signal calendar

/**
 * Buy / sell signal names per day for one month. Past days come from close snapshots;
 * the live day shows the dashboard table row (what the table shows right now).
 */
export const calendarMonthSignals = (snaps, liveItem, year, month) => {
  const bullish = new Map(), bearish = new Map()
  if (!snaps || snaps.size === 0) return { bullish, bearish }
  const live = liveDayKey(snaps)
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
  for (const [day, snap] of snaps) {
    if (!day.startsWith(prefix)) continue
    if (day === live && liveItem) {
      bullish.set(day, liveItem.buy_signals || [])
      bearish.set(day, liveItem.sell_signals || [])
    } else {
      bullish.set(day, snap.buy)
      bearish.set(day, snap.sell)
    }
  }
  return { bullish, bearish }
}

// ---------------------------------------------------------------- matrix Δ

export const daysAgoKey = (snaps, days) => {
  const live = liveDayKey(snaps)
  if (!live) return null
  return new Date(Date.parse(live + 'T00:00:00Z') - days * 86400000).toISOString().slice(0, 10)
}

/** Snapshot the matrix compares against: last daily close on or before (live day - days). */
export const matrixBaseSnapshot = (snaps, days = 7) => {
  const key = daysAgoKey(snaps, days)
  return key ? snapshotOnOrBefore(snaps, key) : null
}

// ---------------------------------------------------------------- chart volume bars

const barDayKey = (t) => (typeof t === 'string' ? t.slice(0, 10) : new Date(t * 1000).toISOString().slice(0, 10))

/**
 * Volume bars under the chart, one per candle, from close snapshots:
 *  - daily view: the snapshot of that day
 *  - weekly view: the snapshot of the last daily close inside that week
 *  - hourly view: none
 * The live (latest) bar uses the dashboard table row, same as the calendar.
 * Returns ChartModal's { stackedData: {bullish, neutral, bearish}, individualData } shape
 * (stacked values are cumulative: bullish = buy, bearish = buy + sell).
 */
export const volumeBarsFromSnapshots = (candles, snaps, timeframe, liveItem = null) => {
  if (timeframe === 'hourly' || !snaps || snaps.size === 0 || !candles?.length) return { stackedData: null, individualData: [] }
  const live = liveDayKey(snaps)
  const keys = [...snaps.keys()]
  const bullish = [], neutral = [], bearish = [], individualData = []
  let ki = -1
  for (let ci = 0; ci < candles.length; ci++) {
    const time = candles[ci].time
    const start = barDayKey(time)
    let snap = null, day = null
    if (timeframe === 'weekly') {
      const end = new Date(Date.parse(start + 'T00:00:00Z') + 7 * 86400000).toISOString().slice(0, 10)
      while (ki + 1 < keys.length && keys[ki + 1] < end) ki++
      if (ki >= 0 && keys[ki] >= start) { day = keys[ki]; snap = snaps.get(day) }
    } else {
      snap = snaps.get(start) || null
      day = start
    }
    if (!snap) continue
    const useLive = day === live && liveItem
    const buy = useLive ? (liveItem.buy_signals || []).length : snap.buy.length
    const sell = useLive ? (liveItem.sell_signals || []).length : snap.sell.length
    bullish.push({ time, value: buy, day })
    neutral.push({ time, value: buy })
    bearish.push({ time, value: buy + sell })
    if (buy > 0 || sell > 0) {
      const strength = buy - sell
      individualData.push({ time, value: Math.abs(strength), color: strength > 0 ? '#16794a' : strength < 0 ? '#b4232a' : '#d6dbd3' })
    }
  }
  return { stackedData: { bullish, neutral, bearish }, individualData }
}
