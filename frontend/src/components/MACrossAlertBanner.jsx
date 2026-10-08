import React, { useEffect, useRef, useState } from 'react'
import { tradingAPI } from '../api/api'
import './MACrossAlertBanner.css'

// MA Cross (EMA 9, EMA 21) - key buy/sell signal.
// Shows a flashing banner for recent crosses, plays a sound and raises a desktop
// notification the moment a new cross arrives (via WebSocket push or polling).

const POLL_MS = 30000
const RECENT_DAYS = 2
const DISMISSED_KEY = 'maCrossDismissed'

const alertKey = (a) => `${a.symbol}|${a.direction}|${a.cross_date}`
const displaySymbol = (s) => (s || '').replace('C:', '')

const loadDismissed = () => {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]')) } catch { return new Set() }
}
const saveDismissed = (set) => {
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set].slice(-200))) } catch { /* storage unavailable */ }
}

const isRecent = (crossDate) => {
  const d = Date.parse(crossDate)
  if (isNaN(d)) return true
  return (Date.now() - d) / 86400000 <= RECENT_DAYS
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

const MACrossAlertBanner = ({ liveAlerts = [], onOpenChart }) => {
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
      return [...map.values()].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    })

    // Don't ring for alerts that already existed when the page loaded
    if (!firstLoad || announce) {
      const toAnnounce = newOnes.filter(a => isRecent(a.cross_date))
      if (toAnnounce.length > 0) {
        playChime(toAnnounce[0].direction === 'BUY')
        toAnnounce.forEach(notifyDesktop)
        setFreshKeys(prev => new Set([...prev, ...toAnnounce.map(alertKey)]))
      }
    }
  }

  const fetchAlerts = async () => {
    try {
      const res = await tradingAPI.getMACrossAlerts(50)
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
  if (visible.length === 0 && notifPermission !== 'default') return null

  return (
    <div className="ma-cross-banner">
      <div className="ma-cross-banner-header">
        <span className="ma-cross-banner-title">🚨 MA Cross (EMA 9, EMA 21) Alerts</span>
        {notifPermission === 'default' && (
          <button className="ma-cross-enable-btn" onClick={enableNotifications}>
            🔔 Enable desktop alerts
          </button>
        )}
      </div>
      {visible.length === 0 ? (
        <div className="ma-cross-empty">No new crosses. You'll be alerted here the moment EMA 9 crosses EMA 21.</div>
      ) : (
        <div className="ma-cross-list">
          {visible.map(a => {
            const isBuy = a.direction === 'BUY'
            const key = alertKey(a)
            return (
              <div
                key={key}
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
                <span className="ma-cross-date">{a.cross_date}</span>
                <button className="ma-cross-dismiss" onClick={() => dismiss(a)} title="Dismiss">✕</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default MACrossAlertBanner
