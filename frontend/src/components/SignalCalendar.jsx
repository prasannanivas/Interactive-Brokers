import React, { useEffect, useMemo, useState } from 'react'
import { historyAPI } from '../api/api'
import { getSignalCountsFromCandles } from '../utils/indicatorUtils'
import './SignalCalendar.css'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Max number of indicators that can vote in getSignalCountsFromCandles
// (RSI9, EMA9, EMA20, EMA50, EMA200, MACD, MA-cross).
const MAX_SIGNAL_COUNT = 7

// Builds a Monday-first grid of day numbers for the given month, padded
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

// 0 -> no data, 1-4 -> intensity tier scaled against MAX_SIGNAL_COUNT
const intensityTier = (count) => {
  if (!count) return 0
  const ratio = count / MAX_SIGNAL_COUNT
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}

const MonthCalendar = ({ year, month, countsByDate, tone, todayKey, onPrev, onNext, onToday, isCurrentMonth }) => {
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month])
  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  })

  return (
    <div className={`signal-cal signal-cal-${tone}`}>
      <div className="signal-cal-header">
        <button className="signal-cal-nav" onClick={onPrev} aria-label="Previous month">‹</button>
        <div className="signal-cal-title-group">
          <span className="signal-cal-title">{monthLabel}</span>
          {!isCurrentMonth && (
            <button className="signal-cal-today" onClick={onToday}>Today</button>
          )}
        </div>
        <button className="signal-cal-nav" onClick={onNext} aria-label="Next month">›</button>
      </div>

      <div className="signal-cal-weekdays">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="signal-cal-grid">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="signal-cal-day signal-cal-day-empty" />
          const dateKey = toDateKey(year, month, day)
          const count = countsByDate.get(dateKey)
          const tier = intensityTier(count)
          const isToday = dateKey === todayKey
          const isFuture = dateKey > todayKey
          return (
            <div
              key={i}
              className={`signal-cal-day tier-${tier} ${isToday ? 'is-today' : ''} ${isFuture ? 'is-future' : ''}`}
              title={count !== undefined ? `${dateKey}: ${count} signal${count === 1 ? '' : 's'}` : dateKey}
            >
              <span className="signal-cal-day-number">{day}</span>
              {count > 0 && <span className="signal-cal-day-count">{count}</span>}
            </div>
          )
        })}
      </div>

      <div className="signal-cal-legend">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map(tier => (
          <span key={tier} className={`signal-cal-legend-swatch tone-${tone} tier-${tier}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}

// Minimum prior trading-day candles needed for the slowest indicator (EMA200) to be defined.
const MIN_LOOKBACK_CANDLES = 250
// Calendar days to fetch: covers plenty of navigable history + lookback before the earliest one.
const FETCH_DAYS = 400

const SignalCalendar = ({ symbol }) => {
  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const now = new Date()
  const [bullishCursor, setBullishCursor] = useState({ year: now.getUTCFullYear(), month: now.getUTCMonth() })
  const [bearishCursor, setBearishCursor] = useState({ year: now.getUTCFullYear(), month: now.getUTCMonth() })

  useEffect(() => {
    if (!symbol) return
    let cancelled = false
    setLoading(true)
    setError(null)

    // Polygon ticker format for forex pairs
    const ticker = symbol.startsWith('C:') ? symbol : `C:${symbol}`

    // This is a large live fetch (400 days) that can occasionally exceed the
    // backend's fetch timeout on slower/higher-latency connections. Retry a
    // couple of times before surfacing an error, instead of failing on the
    // first hiccup.
    const MAX_ATTEMPTS = 3
    const fetchWithRetry = async (attempt = 1) => {
      try {
        const res = await historyAPI.getPriceHistory(ticker, FETCH_DAYS, 'day')
        if (cancelled) return
        const raw = res.data?.candles || []
        const sorted = [...raw]
          .sort((a, b) => (a.time > b.time ? 1 : -1))
          .filter(c => {
            const day = new Date(c.time + 'T00:00:00Z').getUTCDay()
            return day !== 0 && day !== 6
          })
        setCandles(sorted)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        console.error(`SignalCalendar: price history fetch failed for ${ticker} (attempt ${attempt}/${MAX_ATTEMPTS})`, err)
        if (attempt < MAX_ATTEMPTS) {
          setTimeout(() => fetchWithRetry(attempt + 1), 1500 * attempt)
        } else {
          setError('Price history not available')
          setLoading(false)
        }
      }
    }

    fetchWithRetry()
    return () => { cancelled = true }
  }, [symbol])

  // Reset both calendars back to the current month whenever the pair changes.
  useEffect(() => {
    const n = new Date()
    setBullishCursor({ year: n.getUTCFullYear(), month: n.getUTCMonth() })
    setBearishCursor({ year: n.getUTCFullYear(), month: n.getUTCMonth() })
  }, [symbol])

  const { bullishCounts, bearishCounts, todayKey } = useMemo(() => {
    const bullish = new Map()
    const bearish = new Map()

    candles.forEach((candle, idx) => {
      if (idx < 25) return // not enough history for any indicator to fire
      const sliced = candles.slice(0, idx + 1)
      const { bullish: buy, bearish: sell } = getSignalCountsFromCandles(sliced)
      bullish.set(candle.time, buy)
      bearish.set(candle.time, sell)
    })

    return { bullishCounts: bullish, bearishCounts: bearish, todayKey: now.toISOString().split('T')[0] }
  }, [candles])

  const shiftMonth = (setCursor, delta) => {
    setCursor(prev => {
      const d = new Date(Date.UTC(prev.year, prev.month + delta, 1))
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() }
    })
  }

  const resetToToday = (setCursor) => {
    const n = new Date()
    setCursor({ year: n.getUTCFullYear(), month: n.getUTCMonth() })
  }

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

  const isCurrentBullish = bullishCursor.year === now.getUTCFullYear() && bullishCursor.month === now.getUTCMonth()
  const isCurrentBearish = bearishCursor.year === now.getUTCFullYear() && bearishCursor.month === now.getUTCMonth()

  return (
    <div className="signal-calendar-section">
      <div className="chart-title">
        <h3>📅 Signal History Calendar</h3>
        <p className="chart-subtitle">Daily signal strength for {symbol} — darker means more indicators agreed</p>
      </div>
      <div className="signal-calendar-months">
        <MonthCalendar
          year={bullishCursor.year}
          month={bullishCursor.month}
          countsByDate={bullishCounts}
          tone="bullish"
          todayKey={todayKey}
          onPrev={() => shiftMonth(setBullishCursor, -1)}
          onNext={() => shiftMonth(setBullishCursor, 1)}
          onToday={() => resetToToday(setBullishCursor)}
          isCurrentMonth={isCurrentBullish}
        />
        <MonthCalendar
          year={bearishCursor.year}
          month={bearishCursor.month}
          countsByDate={bearishCounts}
          tone="bearish"
          todayKey={todayKey}
          onPrev={() => shiftMonth(setBearishCursor, -1)}
          onNext={() => shiftMonth(setBearishCursor, 1)}
          onToday={() => resetToToday(setBearishCursor)}
          isCurrentMonth={isCurrentBearish}
        />
      </div>
    </div>
  )
}

export default SignalCalendar
