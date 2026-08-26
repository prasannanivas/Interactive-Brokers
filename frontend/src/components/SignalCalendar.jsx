import React, { useEffect, useMemo, useState } from 'react'
import { tradingAPI } from '../api/api'
import './SignalCalendar.css'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Upper bound for the intensity scale. The live engine (indicator_calculator.py)
// can cast up to ~10 votes (RSI, EMA9/20/50/200, MA-cross, MACD, Bollinger,
// plus hourly/weekly variants), though not all fire every day. This is just
// for shading depth, not a hard cap on the count shown.
const MAX_SIGNAL_COUNT = 10

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

// How far back to pull daily snapshots for the navigable history.
const FETCH_DAYS = 90

const SignalCalendar = ({ symbol }) => {
  const [days, setDays] = useState([])
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

    tradingAPI.getDailySnapshotsBySymbol(symbol, FETCH_DAYS)
      .then(res => {
        if (cancelled) return
        setDays(res.data?.days || [])
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        console.error(`SignalCalendar: daily snapshot fetch failed for ${symbol}`, err)
        setError('Signal history not available')
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [symbol])

  // Reset both calendars back to the current month whenever the pair changes.
  useEffect(() => {
    const n = new Date()
    setBullishCursor({ year: n.getUTCFullYear(), month: n.getUTCMonth() })
    setBearishCursor({ year: n.getUTCFullYear(), month: n.getUTCMonth() })
  }, [symbol])

  // Same source as the live Currency Signal Matrix — each day's snapshot was
  // captured from that day's watchlist buy_signals/sell_signals arrays, not
  // recomputed here, so a given day's count always matches what the Matrix
  // showed on that day. Plot buy/sell counts independently (like the Matrix
  // does), not gated by the day's overall net signal_type classification —
  // a day can have real buy_signals even if sell_signals outnumbered them
  // and the day was archived as BEARISH overall.
  const { bullishCounts, bearishCounts, todayKey } = useMemo(() => {
    const bullish = new Map()
    const bearish = new Map()

    days.forEach(d => {
      bullish.set(d.date, d.buy_signals)
      bearish.set(d.date, d.sell_signals)
    })

    return { bullishCounts: bullish, bearishCounts: bearish, todayKey: now.toISOString().split('T')[0] }
  }, [days])

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

  if (error || days.length === 0) {
    return (
      <div className="signal-calendar-section">
        <div className="data-not-available">
          <p>📅 DATA NOT AVAILABLE</p>
          <p className="unavailable-subtitle">{error || 'No signal history captured yet for this pair'}</p>
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
