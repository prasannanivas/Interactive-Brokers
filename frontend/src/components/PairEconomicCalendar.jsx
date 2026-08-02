import React, { useEffect, useMemo, useState } from 'react'
import { tradingAPI } from '../api/api'
import './PairEconomicCalendar.css'

// Keyword match for "main central bank events" — rate decisions plus the
// events that typically accompany a decision day (press conference, rate
// statement, monetary policy statement/minutes). Deliberately narrower than
// the full Key Indicators filter on the main Economic Calendar page, which
// also includes unemployment/inflation — not central-bank-specific.
const isCentralBankEvent = (eventName) => {
  const name = eventName.toLowerCase()
  return (
    name.includes('interest rate decision') ||
    name.includes('rate decision') ||
    name.includes('press conference') ||
    name.includes('rate statement') ||
    name.includes('monetary policy statement') ||
    name.includes('monetary policy minutes') ||
    name.includes('fomc')
  )
}

const getImportanceColor = (importance) => {
  switch (importance) {
    case 'High': return '#ef4444'
    case 'Medium': return '#f59e0b'
    case 'Low': return '#10b981'
    default: return '#9ca3af'
  }
}

const formatDayLabel = (dateStr) => {
  const date = new Date(dateStr)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  today.setHours(0, 0, 0, 0)
  tomorrow.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)

  if (date.getTime() === today.getTime()) return 'Today'
  if (date.getTime() === tomorrow.getTime()) return 'Tomorrow'
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const PairEconomicCalendar = ({ baseCountry, quoteCountry }) => {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    tradingAPI.getEconomicCalendar(0, 30)
      .then(res => setEvents(res.data?.events || []))
      .catch(() => setError('Economic calendar not available'))
      .finally(() => setLoading(false))
  }, [])

  const groupedByDay = useMemo(() => {
    const countries = new Set([baseCountry, quoteCountry].filter(Boolean))
    const relevant = events.filter(ev =>
      countries.has(ev.country) && isCentralBankEvent(ev.event || '')
    )

    const groups = new Map()
    relevant.forEach(ev => {
      const dateKey = ev.date_str || (ev.date || '').split('T')[0]
      if (!groups.has(dateKey)) groups.set(dateKey, [])
      groups.get(dateKey).push(ev)
    })

    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [events, baseCountry, quoteCountry])

  if (loading) {
    return (
      <div className="pair-econ-calendar">
        <div className="chart-skeleton">
          <div className="skeleton-shimmer" />
          <div className="skeleton-spinner" />
          <span className="skeleton-label">Loading central bank calendar…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="pair-econ-calendar">
        <div className="data-not-available">
          <p>📅 DATA NOT AVAILABLE</p>
          <p className="unavailable-subtitle">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pair-econ-calendar">
      <div className="chart-title">
        <h3>🏛️ Upcoming Central Bank Events</h3>
        <p className="chart-subtitle">{baseCountry} &amp; {quoteCountry} — next 30 days</p>
      </div>

      {groupedByDay.length === 0 ? (
        <div className="pair-econ-empty">No upcoming central bank events for {baseCountry} or {quoteCountry}</div>
      ) : (
        <div className="pair-econ-days">
          {groupedByDay.map(([dateKey, dayEvents]) => (
            <div key={dateKey} className="pair-econ-day">
              <div className="pair-econ-day-label">{formatDayLabel(dateKey)}</div>
              <div className="pair-econ-day-events">
                {dayEvents.map((ev, i) => (
                  <div key={i} className="pair-econ-event">
                    <span
                      className="pair-econ-importance"
                      style={{ backgroundColor: getImportanceColor(ev.importance) }}
                      title={`${ev.importance} Importance`}
                    />
                    <span className="pair-econ-time">{ev.time || '—'}</span>
                    <span className="pair-econ-country">{ev.country}</span>
                    <span className="pair-econ-name">{ev.event}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default PairEconomicCalendar
