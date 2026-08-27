import React, { useEffect, useMemo, useState } from 'react'
import { historyAPI } from '../api/api'
import { getSignalNamesFromCandles } from '../utils/indicatorUtils'
import './SignalCalendar.css'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Upper bound for the intensity scale. getSignalNamesFromCandles casts at
// most 7 votes (RSI9, EMA9/20/50/200, MACD, MA-cross). Today's live watchlist
// count can occasionally exceed this (it draws on more indicators including
// hourly/weekly ones) — that's fine, this is just shading depth, not a cap.
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

// Turns an indicator code like "EMA_200" or "MA_Crossover" into "EMA 200" / "MA Crossover"
const formatIndicatorName = (code) => code.split('_').join(' ')

const buildTooltip = (dateKey, signals) => {
  if (signals === undefined) return dateKey
  if (signals.length === 0) return `${dateKey}: no signals`
  const lines = signals.map(s => `  • ${formatIndicatorName(s)}`)
  return [`${dateKey} (${signals.length}):`, ...lines].join('\n')
}

const MonthCalendar = ({ year, month, signalsByDate, tone, todayKey, onPrev, onNext, onToday, isCurrentMonth }) => {
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
          const signals = signalsByDate.get(dateKey)
          const count = signals?.length
          const tier = intensityTier(count)
          const isToday = dateKey === todayKey
          const isFuture = dateKey > todayKey
          return (
            <div
              key={i}
              className={`signal-cal-day tier-${tier} ${isToday ? 'is-today' : ''} ${isFuture ? 'is-future' : ''}`}
              title={buildTooltip(dateKey, signals)}
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

// Calendar days of daily candles to fetch: enough lookback for EMA200 to be
// defined even on the earliest day a user might navigate back to.
const FETCH_DAYS = 450
// Same technique CurrencyMatrix.jsx already uses for its "Δ vs 7 days ago"
// feature — recompute a past day's signals on the fly from candles, rather
// than depending on a once-daily snapshot archive. Today reads live from the
// watchlist instead, so it always matches the Matrix exactly right now.
const SignalCalendar = ({ symbol, watchlist }) => {
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

    const ticker = symbol.startsWith('C:') ? symbol : `C:${symbol}`
    historyAPI.getPriceHistory(ticker, FETCH_DAYS, 'day')
      .then(res => {
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
      })
      .catch(err => {
        if (cancelled) return
        console.error(`SignalCalendar: price history fetch failed for ${ticker}`, err)
        setError('Price history not available')
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

  const todayKey = now.toISOString().split('T')[0]

  // Live watchlist item for this pair — used for "today" so it matches the
  // Matrix exactly, instead of the on-the-fly candle approximation.
  const liveItem = useMemo(() => {
    if (!watchlist) return null
    const bare = symbol.startsWith('C:') ? symbol.slice(2) : symbol
    return watchlist.find(item => {
      const itemBare = item.symbol?.startsWith('C:') ? item.symbol.slice(2) : item.symbol
      return itemBare === bare
    }) || null
  }, [watchlist, symbol])

  // Compute signal names for every day across both visible months (the two
  // calendars can be navigated independently). Cheap to recompute per month
  // since it's ~30 candle slices, not the whole fetched range.
  const computeMonthSignals = (year, month) => {
    const bullish = new Map()
    const bearish = new Map()
    if (candles.length === 0) return { bullish, bearish }

    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = toDateKey(year, month, day)
      if (dateKey > todayKey) continue // future day, nothing to show

      if (dateKey === todayKey && liveItem) {
        bullish.set(dateKey, liveItem.buy_signals || [])
        bearish.set(dateKey, liveItem.sell_signals || [])
        continue
      }

      const idx = candles.findIndex(c => c.time === dateKey)
      if (idx < 25) continue // no candle that day (weekend/holiday) or not enough lookback

      const sliced = candles.slice(0, idx + 1)
      const { buy, sell } = getSignalNamesFromCandles(sliced)
      bullish.set(dateKey, buy)
      bearish.set(dateKey, sell)
    }

    return { bullish, bearish }
  }

  const bullishMonthSignals = useMemo(
    () => computeMonthSignals(bullishCursor.year, bullishCursor.month).bullish,
    [candles, liveItem, bullishCursor.year, bullishCursor.month, todayKey]
  )
  const bearishMonthSignals = useMemo(
    () => computeMonthSignals(bearishCursor.year, bearishCursor.month).bearish,
    [candles, liveItem, bearishCursor.year, bearishCursor.month, todayKey]
  )

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

  if (error || candles.length === 0) {
    return (
      <div className="signal-calendar-section">
        <div className="data-not-available">
          <p>📅 DATA NOT AVAILABLE</p>
          <p className="unavailable-subtitle">{error || 'No price history available for this pair'}</p>
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
        <p className="chart-subtitle">Daily signal strength for {symbol} — darker means more indicators agreed. Today is live; past days are computed from price history. Hover a day to see which indicators fired.</p>
      </div>
      <div className="signal-calendar-months">
        <MonthCalendar
          year={bullishCursor.year}
          month={bullishCursor.month}
          signalsByDate={bullishMonthSignals}
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
          signalsByDate={bearishMonthSignals}
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
