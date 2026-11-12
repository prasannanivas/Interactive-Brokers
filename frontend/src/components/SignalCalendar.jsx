import React, { useEffect, useMemo, useState } from 'react'
import { fetchCloseSnapshots, calendarMonthSignals, liveDayKey, TOTAL_RULES } from '../utils/signalViews'
import './SignalCalendar.css'
import { CalendarDays, CalendarX } from 'lucide-react'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Upper bound for the intensity scale: all 10 Trading Rules, same as the table badges.
const MAX_SIGNAL_COUNT = TOTAL_RULES

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

// "Today" per the trading day's own clock (US/Eastern), not the viewer's
// local timezone or UTC — a viewer east of New York (India, UK, etc.) can
// have already rolled into the next UTC/local calendar day while it's still
// "yesterday" in EST, which was shifting this calendar a day ahead.
const getTodayEST = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const get = (type) => parts.find(p => p.type === type).value
  return { year: parseInt(get('year'), 10), month: parseInt(get('month'), 10) - 1, day: parseInt(get('day'), 10) }
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

const SignalCalendar = ({ symbol, watchlist }) => {
  const [candles, setCandles] = useState(null) // close snapshots (Map)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const todayEST = getTodayEST()
  const [bullishCursor, setBullishCursor] = useState({ year: todayEST.year, month: todayEST.month })
  const [bearishCursor, setBearishCursor] = useState({ year: todayEST.year, month: todayEST.month })

  useEffect(() => {
    if (!symbol) return
    let cancelled = false
    setLoading(true)
    setError(null)

    // Same close snapshots as the chart volume bars, matrix delta and history popup
    fetchCloseSnapshots(symbol)
      .then(({ snapshots }) => {
        if (cancelled) return
        setCandles(snapshots)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        console.error(`SignalCalendar: price history fetch failed for ${symbol}`, err)
        setError('Price history not available')
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [symbol])

  // Reset both calendars back to the current month whenever the pair changes.
  useEffect(() => {
    const t = getTodayEST()
    setBullishCursor({ year: t.year, month: t.month })
    setBearishCursor({ year: t.year, month: t.month })
  }, [symbol])

  // The live trading day = date of the forming daily candle (UTC, as the data feed dates
  // bars), so the calendar's "today" is the same day as the table and the chart's last bar.
  const todayKey = (candles && liveDayKey(candles)) || toDateKey(todayEST.year, todayEST.month, todayEST.day)

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

  // Past days: signals at that day's close; live day: the table row (signalViews)
  const computeMonthSignals = (year, month) => calendarMonthSignals(candles, liveItem, year, month)

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
    const t = getTodayEST()
    setCursor({ year: t.year, month: t.month })
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

  if (error || !candles || candles.size === 0) {
    return (
      <div className="signal-calendar-section">
        <div className="data-not-available">
          <p><CalendarX size={16} /> DATA NOT AVAILABLE</p>
          <p className="unavailable-subtitle">{error || 'No price history available for this pair'}</p>
        </div>
      </div>
    )
  }

  const isCurrentBullish = bullishCursor.year === todayEST.year && bullishCursor.month === todayEST.month
  const isCurrentBearish = bearishCursor.year === todayEST.year && bearishCursor.month === todayEST.month

  return (
    <div className="signal-calendar-section">
      <div className="chart-title">
        <h3><CalendarDays size={16} /> Signal History Calendar</h3>
        <p className="chart-subtitle">Daily signal strength for {symbol} — darker means more indicators agreed. Today matches the dashboard table; past days are the 10 Trading Rules at that day's close. Hover a day to see which indicators fired.</p>
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
