import React, { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { bondAPI } from '../api/api'
import './BondSpreadAdvanced.css'

// Same option set as the server (bond_series.py ALLOWED)
export const BOND_RANGES = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y', '10Y', '25Y', '50Y', 'ALL']
const ALLOWED = {
  '1D': ['1m', '5m', '15m', '1h'],
  '1W': ['1d'],
  '1M': ['1d', '1w'],
  '3M': ['1d', '1w'],
  '6M': ['1d', '1w', '1M'],
  '1Y': ['1d', '1w', '1M'],
  '5Y': ['1d', '1w', '1M'],
  '10Y': ['1d', '1w', '1M'],
  '25Y': ['1w', '1M'],
  '50Y': ['1w', '1M'],
  ALL: ['1w', '1M'],
}
const DEFAULT_INTERVAL = {
  '1D': '5m', '1W': '1d', '1M': '1d', '3M': '1d', '6M': '1d', '1Y': '1d',
  '5Y': '1w', '10Y': '1w', '25Y': '1M', '50Y': '1M', ALL: '1M',
}
const INTERVAL_GROUPS = [
  { label: 'Intraday', items: [['1m', '1 Minute'], ['5m', '5 Minutes'], ['15m', '15 Minutes'], ['1h', '1 Hour']] },
  { label: 'Days', items: [['1d', '1 Day'], ['1w', '1 Week'], ['1M', '1 Month']] },
]
const INTERVAL_LABEL = Object.fromEntries(INTERVAL_GROUPS.flatMap(g => g.items))
const isIntraday = (iv) => ['1m', '5m', '15m', '1h'].includes(iv)

const SPREAD_10Y = '#3b82f6'
const SPREAD_2Y = '#ef4444'

// ── Toolbar: "Sync with page" or a chosen period + candle size ────────────────
export const BondRangeToolbar = ({ value, onChange }) => {
  const [open, setOpen] = useState(false)
  const range = value?.range
  const interval = value?.interval

  const pickRange = (r) => {
    const iv = value && ALLOWED[r].includes(value.interval) ? value.interval : DEFAULT_INTERVAL[r]
    onChange({ range: r, interval: iv })
  }

  return (
    <div className="bond-toolbar">
      <button className={`bond-chip ${!value ? 'on' : ''}`} onClick={() => onChange(null)}
        title="Follow the page timeframe and stay synced with the other charts">
        Sync with page
      </button>
      <div className="bond-ranges" role="group" aria-label="Period">
        {BOND_RANGES.map(r => (
          <button key={r} className={`bond-range ${range === r ? 'on' : ''}`} onClick={() => pickRange(r)}>
            {r === 'ALL' ? 'All' : r}
          </button>
        ))}
      </div>
      <div className="bond-interval">
        <button className={`bond-interval-btn ${value ? '' : 'muted'}`} onClick={() => setOpen(o => !o)}
          disabled={!value} aria-haspopup="listbox" aria-expanded={open}>
          {value ? INTERVAL_LABEL[interval] : 'Candle'} ▾
        </button>
        {open && value && (
          <div className="bond-interval-menu" role="listbox" onMouseLeave={() => setOpen(false)}>
            {INTERVAL_GROUPS.map(g => (
              <div key={g.label}>
                <div className="bond-interval-group">{g.label}</div>
                {g.items.map(([iv, label]) => {
                  const allowed = ALLOWED[range].includes(iv)
                  return (
                    <button key={iv} role="option" aria-selected={iv === interval}
                      className={`bond-interval-item ${iv === interval ? 'on' : ''}`}
                      disabled={!allowed}
                      title={allowed ? '' : (isIntraday(iv) ? 'Intraday candles are available on 1D only' : `Not offered for ${range}`)}
                      onClick={() => { onChange({ range, interval: iv }); setOpen(false) }}>
                      {label}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Time formatting (intraday in US Eastern, like the rest of the dashboard) ──
const ET = (opts) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', ...opts })
const ET_TICK_TIME = ET({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const ET_TICK_DAY = ET({ month: 'short', day: 'numeric' })
const ET_FULL = ET({ month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short' })
const DAY_FULL = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
const MONTH_TICK = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' })

const toDate = (t) => new Date(t.length === 10 ? `${t}T00:00:00Z` : t)

// ── Chart for a chosen period / candle size ───────────────────────────────────
export const BondSpreadCustomChart = ({ baseCountry, quoteCountry, view, height = 250 }) => {
  const [state, setState] = useState({ loading: true, data: null, error: null })

  useEffect(() => {
    let cancelled = false
    setState({ loading: true, data: null, error: null })
    const series = [[baseCountry, '10y'], [quoteCountry, '10y'], [baseCountry, '2y'], [quoteCountry, '2y']]
    bondAPI.getBondSeries(series, view.range, view.interval)
      .then(res => { if (!cancelled) setState({ loading: false, data: res.data, error: null }) })
      .catch(err => { if (!cancelled) setState({ loading: false, data: null, error: err.response?.data?.detail || err.message }) })
    return () => { cancelled = true }
  }, [baseCountry, quoteCountry, view.range, view.interval])

  const intraday = isIntraday(view.interval)

  // Merge the four series on time, carry each forward, and compute the spreads
  const rows = useMemo(() => {
    const s = state.data?.series
    if (!s) return []
    const keys = { b10: `${baseCountry}:10y`, q10: `${quoteCountry}:10y`, b2: `${baseCountry}:2y`, q2: `${quoteCountry}:2y` }
    const maps = Object.fromEntries(Object.entries(keys).map(([k, id]) => [k, new Map((s[id] || []).map(p => [p.t, p.c]))]))
    const times = [...new Set(Object.values(maps).flatMap(m => [...m.keys()]))].sort()
    const last = {}
    return times.map(t => {
      for (const k of Object.keys(maps)) if (maps[k].has(t)) last[k] = maps[k].get(t)
      const spread = (a, b) => (last[a] != null && last[b] != null ? +(last[a] - last[b]).toFixed(3) : null)
      return {
        t, ms: toDate(t).getTime(),
        spread10Y: spread('b10', 'q10'), spread2Y: spread('b2', 'q2'),
        base10Y: last.b10 ?? null, quote10Y: last.q10 ?? null, base2Y: last.b2 ?? null, quote2Y: last.q2 ?? null,
      }
    })
  }, [state.data, baseCountry, quoteCountry])

  const stats = (key) => {
    const pts = rows.filter(r => r[key] != null)
    if (!pts.length) return null
    let min = pts[0], max = pts[0]
    for (const p of pts) { if (p[key] < min[key]) min = p; if (p[key] > max[key]) max = p }
    return { current: pts[pts.length - 1][key], min: min[key], minT: min.t, max: max[key], maxT: max.t }
  }

  const fmtTick = (ms) => {
    const d = new Date(ms)
    if (intraday) return view.range === '1D' ? ET_TICK_TIME.format(d) : ET_TICK_DAY.format(d)
    return ['1M', '1w'].includes(view.interval) && !['1M', '3M', '6M'].includes(view.range) ? MONTH_TICK.format(d) : DAY_FULL.format(d)
  }
  const fmtFull = (t) => (intraday ? ET_FULL.format(toDate(t)) : DAY_FULL.format(toDate(t)))
  const pctFmt = (v) => (v == null ? '–' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`)

  if (state.loading) {
    return (
      <div className="chart-skeleton" style={{ height }}>
        <div className="skeleton-shimmer" />
        <div className="skeleton-spinner" />
        <span className="skeleton-label">Loading {view.range} · {INTERVAL_LABEL[view.interval]} bond yields…</span>
      </div>
    )
  }
  if (state.error) {
    return <div className="bond-empty" style={{ minHeight: height }}><strong>Couldn't load bond yields</strong><span>{state.error}</span></div>
  }
  if (rows.length === 0) {
    const notes = Object.values(state.data?.notes || {})
    const err = notes.find(n => n.last_error)?.last_error
    const noTicker = notes.some(n => n.has_ticker === false)
    return (
      <div className="bond-empty" style={{ minHeight: height }}>
        <strong>{intraday ? 'No intraday data yet for this pair' : 'No data for this period'}</strong>
        {intraday && (
          <span>
            Intraday yields are fetched from Trading Economics the first time a pair is viewed, then stored and reused
            (refreshed at most every few hours).
            {err && <> Last attempt: <em>{err}</em></>}
            {noTicker && <> One of these countries has no 2Y bond on Trading Economics.</>}
          </span>
        )}
      </div>
    )
  }

  const s10 = stats('spread10Y')
  const s2 = stats('spread2Y')
  const since = Object.values(state.data?.notes || {}).map(n => n.intraday_since).filter(Boolean).sort()[0]

  return (
    <div>
      <div className="delta-stats-row">
        {[['10Y Delta', s10, SPREAD_10Y], ['2Y Delta', s2, SPREAD_2Y]].map(([label, st, color]) => st && (
          <div className="delta-stats-bar" key={label}>
            <span className="delta-stats-item">
              <span className="delta-stats-label">{label}:</span>
              <span className="delta-stats-value" style={{ color }}>{pctFmt(st.current)}</span>
            </span>
            <span className="delta-stats-item">
              <span className="delta-stats-label">Min:</span>
              <span className="delta-stats-value">{pctFmt(st.min)}</span>
              <span className="delta-stats-date">({fmtFull(st.minT)})</span>
            </span>
            <span className="delta-stats-item">
              <span className="delta-stats-label">Max:</span>
              <span className="delta-stats-value">{pctFmt(st.max)}</span>
              <span className="delta-stats-date">({fmtFull(st.maxT)})</span>
            </span>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="ms" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fmtTick}
            stroke="#6b7280" style={{ fontSize: '12px' }} minTickGap={40} />
          <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} domain={['auto', 'auto']}
            label={{ value: 'Spread (%)', angle: -90, position: 'insideLeft' }} />
          <Tooltip
            labelFormatter={(ms) => {
              const r = rows.find(x => x.ms === ms)
              return r ? fmtFull(r.t) : ''
            }}
            formatter={(v, name) => [v == null ? '–' : `${v.toFixed(3)}%`, name]}
            contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
          />
          <Legend />
          <Line type="monotone" dataKey="spread10Y" name="10Y Bond Spread" stroke={SPREAD_10Y} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="spread2Y" name="2Y Bond Spread" stroke={SPREAD_2Y} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="bond-footnote">
        {view.range === 'ALL' ? 'All history' : view.range} · {INTERVAL_LABEL[view.interval]} candles (close)
        {intraday ? ' · times in US Eastern' : ''}
        {intraday && since ? ` · intraday history stored since ${fmtFull(since)}` : ''}
      </p>
    </div>
  )
}
