import React, { useEffect, useMemo, useRef, useState } from 'react'
import { tradingAPI } from '../api/api'
import './MACrossAlertBanner.css'

// MA Cross (EMA 9, EMA 21) - key buy/sell signal.
// Shows a flashing banner for recent crosses, plays a sound and raises a desktop
// notification the moment a new cross arrives (via WebSocket push or polling).

const POLL_MS = 30000
const RECENT_DAYS = 7    // how far back the scrollable list goes
const ANNOUNCE_DAYS = 2  // only chime / notify for crosses this recent
const FETCH_LIMIT = 300  // enough alerts to cover the 7-day window
const DISMISSED_KEY = 'maCrossDismissed'

const alertKey = (a) => `${a.symbol}|${a.direction}|${a.cross_date}`
const displaySymbol = (s) => (s || '').replace('C:', '')

// EMA 100 (Hourly); RSI, EMA 9/20/50/200, MA Cross, MACD (Daily); Bollinger, EMA 20 (Weekly)
const TOTAL_INDICATORS = 10

// Server stores detection time in UTC without a zone suffix; always show it in US Eastern
// (EDT/EST), the same clock the trading day and the Telegram alerts use
const EASTERN_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23', timeZoneName: 'short',
})

const formatDetectedAt = (timestamp) => {
  if (!timestamp) return null
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(timestamp) ? timestamp : `${timestamp}Z`
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const p = Object.fromEntries(EASTERN_FORMAT.formatToParts(d).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}`
}

// Counts recorded when the cross was detected; older alerts fall back to the pair's current counts
const signalCounts = (alert, item) => {
  if (alert.bullish_count != null) {
    return { bullish: alert.bullish_count, bearish: alert.bearish_count, neutral: alert.neutral_count, live: false }
  }
  if (!item) return null
  const bullish = item.buy_signals?.length || 0
  const bearish = item.sell_signals?.length || 0
  return { bullish, bearish, neutral: Math.max(TOTAL_INDICATORS - bullish - bearish, 0), live: true }
}

const loadDismissed = () => {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]')) } catch { return new Set() }
}
const saveDismissed = (set) => {
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set].slice(-200))) } catch { /* storage unavailable */ }
}

const isWithinDays = (crossDate, days) => {
  const d = Date.parse(crossDate)
  if (isNaN(d)) return true
  return (Date.now() - d) / 86400000 <= days
}

const isRecent = (crossDate) => isWithinDays(crossDate, RECENT_DAYS)

// 'Tue, Oct 20' for the day dividers (cross_date is the chart's daily bar, YYYY-MM-DD)
const formatBarDay = (crossDate) => {
  const d = new Date(`${crossDate}T00:00:00Z`)
  if (isNaN(d.getTime())) return crossDate
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
}

const playChime = (isBuy) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const notes = isBuy ? [660, 880, 1100] : [880, 660, 440]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      osc.connect(gain)
      gain.connect(ctx.destination)
      const t = ctx.currentTime + i * 0.18
      gain.gain.setValueAtTime(0.25, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16)
      osc.start(t)
      osc.stop(t + 0.17)
    })
  } catch { /* audio blocked until user interacts with the page */ }
}

const notifyDesktop = (a) => {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const isBuy = a.direction === 'BUY'
    new Notification(`MA CROSS ${a.direction}: ${displaySymbol(a.symbol)}`, {
      body: `EMA 9 crossed ${isBuy ? 'above' : 'below'} EMA 21 (Daily)${a.price ? ` @ ${Number(a.price).toFixed(5)}` : ''}`,
      tag: alertKey(a),
    })
  } catch { /* notifications unavailable */ }
}

const MACrossAlertBanner = ({ liveAlerts = [], onOpenChart, watchlist = [] }) => {
  const watchlistBySymbol = useMemo(
    () => Object.fromEntries((watchlist || []).map(item => [item.symbol, item])),
    [watchlist]
  )
  const [alerts, setAlerts] = useState([])
  const [dismissed, setDismissed] = useState(loadDismissed)
  const [freshKeys, setFreshKeys] = useState(new Set())
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )
  const seenKeys = useRef(null)

  const ingest = (incoming, announce) => {
    const firstLoad = seenKeys.current === null
    if (firstLoad) seenKeys.current = new Set()
    if (!incoming || incoming.length === 0) return

    const newOnes = incoming.filter(a => !seenKeys.current.has(alertKey(a)))
    newOnes.forEach(a => seenKeys.current.add(alertKey(a)))

    setAlerts(prev => {
      const map = new Map(prev.map(a => [alertKey(a), a]))
      incoming.forEach(a => map.set(alertKey(a), a))
      // Newest chart bar first, then newest detection - keeps each day's rows together under one divider
      return [...map.values()].sort((a, b) =>
        String(b.cross_date).localeCompare(String(a.cross_date)) || String(b.timestamp).localeCompare(String(a.timestamp)))
    })

    // Don't ring for alerts that already existed when the page loaded
    if (!firstLoad || announce) {
      const toAnnounce = newOnes.filter(a => isWithinDays(a.cross_date, ANNOUNCE_DAYS))
      if (toAnnounce.length > 0) {
        playChime(toAnnounce[0].direction === 'BUY')
        toAnnounce.forEach(notifyDesktop)
        setFreshKeys(prev => new Set([...prev, ...toAnnounce.map(alertKey)]))
      }
    }
  }

  const fetchAlerts = async () => {
    try {
      const res = await tradingAPI.getMACrossAlerts(FETCH_LIMIT)
      ingest(res.data?.alerts || [], false)
    } catch (e) {
      console.error('Failed to load MA Cross alerts:', e)
    }
  }

  useEffect(() => {
    fetchAlerts()
    const id = setInterval(fetchAlerts, POLL_MS)
    return () => clearInterval(id)
  }, [])

  // WebSocket push from the signal service
  useEffect(() => {
    if (liveAlerts.length > 0) {
      if (seenKeys.current === null) seenKeys.current = new Set()
      ingest(liveAlerts, true)
    }
  }, [liveAlerts])

  const dismiss = (a) => {
    const next = new Set(dismissed)
    next.add(alertKey(a))
    setDismissed(next)
    saveDismissed(next)
  }

  const enableNotifications = async () => {
    try {
      const p = await Notification.requestPermission()
      setNotifPermission(p)
    } catch { /* ignore */ }
  }

  const visible = alerts.filter(a => isRecent(a.cross_date) && !dismissed.has(alertKey(a)))
  const buyCount = visible.filter(a => a.direction === 'BUY').length
  const sellCount = visible.length - buyCount

  return (
    <div className="ma-cross-banner">
      <div className="ma-cross-banner-header">
        <span className="ma-cross-banner-title">
          🚨 MA Cross (EMA 9, EMA 21) Alerts
          <span className="ma-cross-banner-summary">
            Last {RECENT_DAYS} days · {visible.length} signal{visible.length === 1 ? '' : 's'}
            {visible.length > 0 && (
              <>
                {' '}(<span className="ma-cross-sum-buy">▲ {buyCount} BUY</span>
                {' · '}<span className="ma-cross-sum-sell">▼ {sellCount} SELL</span>)
              </>
            )}
          </span>
        </span>
        {notifPermission === 'default' && (
          <button className="ma-cross-enable-btn" onClick={enableNotifications}>
            🔔 Enable desktop alerts
          </button>
        )}
      </div>
      {visible.length === 0 ? (
        <div className="ma-cross-empty">No crosses in the last {RECENT_DAYS} days. You'll be alerted here the moment EMA 9 crosses EMA 21.</div>
      ) : (
        <div className="ma-cross-list" tabIndex={0} aria-label={`MA Cross signals, last ${RECENT_DAYS} days`}>
          {visible.map((a, i) => {
            const isBuy = a.direction === 'BUY'
            const key = alertKey(a)
            const newDay = i === 0 || visible[i - 1].cross_date !== a.cross_date
            return (
              <React.Fragment key={key}>
              {newDay && <div className="ma-cross-day">{formatBarDay(a.cross_date)}</div>}
              <div
                className={`ma-cross-item ${isBuy ? 'buy' : 'sell'} ${freshKeys.has(key) ? 'flash' : ''}`}
              >
                <span className="ma-cross-arrow">{isBuy ? '▲' : '▼'}</span>
                <span className="ma-cross-dir">{a.direction}</span>
                <button
                  className="ma-cross-symbol"
                  onClick={() => !a.test && onOpenChart && onOpenChart(a.symbol)}
                  title="Open chart"
                >
                  {displaySymbol(a.symbol)}
                </button>
                <span className="ma-cross-detail">
                  EMA 9 crossed {isBuy ? 'above' : 'below'} EMA 21
                  {a.price ? ` @ ${Number(a.price).toFixed(5)}` : ''}
                </span>
                {(() => {
                  const counts = signalCounts(a, watchlistBySymbol[a.symbol])
                  if (!counts) return null
                  return (
                    <span className="ma-cross-counts"
                      title={counts.live ? 'Current signal counts for this pair' : 'Signal counts when the cross was detected'}>
                      <span className="ma-cross-count bullish">🟢 {counts.bullish} Bullish</span>
                      <span className="ma-cross-count bearish">🔴 {counts.bearish} Bearish</span>
                      <span className="ma-cross-count neutral">⚪ {counts.neutral} Neutral</span>
                    </span>
                  )
                })()}
                <span className="ma-cross-date"
                  title="Daily candles are UTC days, so a candle starts at 8 PM EDT (7 PM EST) the evening before its date">
                  <span className="ma-cross-bar">Chart bar {a.cross_date}</span>
                  <span>Detected {formatDetectedAt(a.timestamp) || '-'}</span>
                </span>
                <button className="ma-cross-dismiss" onClick={() => dismiss(a)} title="Dismiss">✕</button>
              </div>
              </React.Fragment>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default MACrossAlertBanner
