import React, { useEffect, useMemo, useState } from 'react'
import { historyAPI } from '../api/api'
import { getSignalCountsFromCandles } from '../utils/indicatorUtils'
import './SignalCalendar.css'

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// Builds a Monday-first grid of Date objects for the given month, padded
// with leading/trailing nulls so every row has exactly 7 cells.
const buildMonthGrid = (year, month) => {
  const firstDay = new Date(Date.UTC(year, month, 1))
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const leadingBlanks = (firstDay.getUTCDay() + 6) % 7 // Mon=0 ... Sun=6

  const cells = []
  for (let i = 0; i < leadingBlanks; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(day)
  while (cells.length % 7 !== 0) cells.push(null)

  return cells
}

const toDateKey = (year, month, day) => {
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

const MonthGrid = ({ year, month, countsByDate, colorClass, todayKey }) => {
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month])
  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  })

  return (
    <div className="signal-month">
      <div className="signal-month-title">{monthLabel}</div>
      <div className="signal-month-weekdays">
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
      <div className="signal-month-grid">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="signal-day signal-day-empty" />
          const dateKey = toDateKey(year, month, day)
          const count = countsByDate.get(dateKey)
          const isToday = dateKey === todayKey
          const isWeekend = new Date(Date.UTC(year, month, day)).getUTCDay() % 6 === 0
          return (
            <div
              key={i}
              className={`signal-day ${count ? colorClass : ''} ${isToday ? 'signal-day-today' : ''} ${isWeekend ? 'signal-day-weekend' : ''}`}
              title={count !== undefined ? `${dateKey}: ${count}` : dateKey}
            >
              <span className="signal-day-number">{day}</span>
              {count > 0 && <span className="signal-day-count">{count}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Minimum prior trading-day candles needed for the slowest indicator (EMA200) to be defined.
const MIN_LOOKBACK_CANDLES = 250
// Calendar days to fetch: ~2 months of target dates + enough lookback before the earliest one.
const FETCH_DAYS = 400

const SignalCalendar = ({ symbol }) => {
  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!symbol) return
    setLoading(true)
    setError(null)
    // Polygon ticker format for forex pairs
    const ticker = symbol.startsWith('C:') ? symbol : `C:${symbol}`
    historyAPI.getPriceHistory(ticker, FETCH_DAYS, 'day')
      .then(res => {
        const raw = res.data?.candles || []
        const sorted = [...raw]
          .sort((a, b) => (a.time > b.time ? 1 : -1))
          .filter(c => {
            const day = new Date(c.time + 'T00:00:00Z').getUTCDay()
            return day !== 0 && day !== 6
          })
        setCandles(sorted)
      })
      .catch(() => setError('Price history not available'))
      .finally(() => setLoading(false))
  }, [symbol])

  const { bullishCounts, bearishCounts, currentMonth, previousMonth, todayKey } = useMemo(() => {
    const bullish = new Map()
    const bearish = new Map()

    const now = new Date()
    const current = { year: now.getUTCFullYear(), month: now.getUTCMonth() }
    const prevDate = new Date(Date.UTC(current.year, current.month - 1, 1))
    const previous = { year: prevDate.getUTCFullYear(), month: prevDate.getUTCMonth() }

    if (candles.length > 0) {
      // Walk every trading-day candle that falls within the previous or current month
      // and compute its signal count from all candles up to (and including) that day.
      const rangeStart = new Date(Date.UTC(previous.year, previous.month, 1))
      candles.forEach((candle, idx) => {
        const candleDate = new Date(candle.time + 'T00:00:00Z')
        if (candleDate < rangeStart) return
        if (idx < 25) return // not enough history for any indicator to fire

        const sliced = candles.slice(0, idx + 1)
        const { bullish: buy, bearish: sell } = getSignalCountsFromCandles(sliced)
        bullish.set(candle.time, buy)
        bearish.set(candle.time, sell)
      })
    }

    return {
      bullishCounts: bullish,
      bearishCounts: bearish,
      currentMonth: current,
      previousMonth: previous,
      todayKey: now.toISOString().split('T')[0]
    }
  }, [candles])

  if (loading) {
    return (
      <div className="signal-calendar-section">
        <div className="chart-skeleton">
          <div className="skeleton-shimmer" />
          <div className="skeleton-spinner" />
          <span className="skeleton-label">Loading signal history…</span>
        </div>
      </div>
    )
  }

  if (error || candles.length < MIN_LOOKBACK_CANDLES) {
    return (
      <div className="signal-calendar-section">
        <div className="data-not-available">
          <p>📅 DATA NOT AVAILABLE</p>
          <p className="unavailable-subtitle">{error || 'Not enough price history to compute signal history'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="signal-calendar-section">
      <div className="chart-title">
        <h3>🟢 Bullish Signal Calendar</h3>
        <p className="chart-subtitle">Daily buy-signal count for {symbol}</p>
      </div>
      <div className="signal-calendar-months">
        <MonthGrid year={previousMonth.year} month={previousMonth.month} countsByDate={bullishCounts} colorClass="signal-day-bullish" todayKey={todayKey} />
        <MonthGrid year={currentMonth.year} month={currentMonth.month} countsByDate={bullishCounts} colorClass="signal-day-bullish" todayKey={todayKey} />
      </div>

      <div className="chart-title" style={{ marginTop: '32px' }}>
        <h3>🔴 Bearish Signal Calendar</h3>
        <p className="chart-subtitle">Daily sell-signal count for {symbol}</p>
      </div>
      <div className="signal-calendar-months">
        <MonthGrid year={previousMonth.year} month={previousMonth.month} countsByDate={bearishCounts} colorClass="signal-day-bearish" todayKey={todayKey} />
        <MonthGrid year={currentMonth.year} month={currentMonth.month} countsByDate={bearishCounts} colorClass="signal-day-bearish" todayKey={todayKey} />
      </div>
    </div>
  )
}

export default SignalCalendar
