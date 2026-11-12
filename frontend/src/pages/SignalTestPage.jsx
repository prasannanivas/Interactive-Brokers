import React, { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Play, Square, Download, ChevronRight, ChevronDown, ShieldCheck } from 'lucide-react'
import { tradingAPI, dataAPI, historyAPI } from '../api/api'
import { runSignalAudit, SPECS, STATUS } from '../utils/signalAudit'
import ThemeToggle from '../components/ThemeToggle'
import './SignalTestPage.css'

// Hidden QA page (/test) - not linked anywhere in the UI.
// Re-computes every signal independently and compares table, chart and history.

const STORAGE_KEY = 'signal-audit:last'
const NEWLINE = String.fromCharCode(10)
const RANK = { fail: 3, warn: 2, info: 1, pass: 0 }
// Per-indicator comparisons (one grid column per indicator)
const INDICATOR_GROUPS = ['Table vs Trading Rules', 'Table vs Technical Analysis']
// Section comparisons (one grid column per section)
const SECTION_GROUPS = ['Calendar', 'Matrix', 'Volume bars', 'Technical Analysis', 'History popup', 'Change log', 'MA Cross banner', 'Table badges', 'Data feed']
const GROUPS = [...INDICATOR_GROUPS, ...SECTION_GROUPS]

const GROUP_HELP = {
  'Formula check': 'Technical Analysis chart formulas vs Table formulas (RSI 9 Wilder, EMA, Bollinger 20,2,0-EMA, MACD 12,26,9) and the Trading Rules thresholds, on test data.',
  Connections: 'Signal service, watchlist and MA Cross alerts reachable; TradingEconomics calls during the test must be 0.',
  'Table vs Trading Rules': 'Each of the 10 Table indicators vs a Trading Rules recalculation from price candles, same windows and price as the Table. Value and BUY/SELL.',
  'Table vs Technical Analysis': 'Each of the 10 Table indicators vs what the Technical Analysis chart computes and draws (chart code, chart candles).',
  'Table badges': 'Table green/red badges vs the indicator columns; grey badge vs N/A columns; badges vs Trading Rules recalculation and vs Technical Analysis chart.',
  Calendar: 'Calendar today vs Table; Calendar past days vs Trading Rules recalculation (last 30 closes + samples back 15 months); all 10 rules shown on every day; every month view.',
  Matrix: 'Matrix cell vs Table; Matrix vs Calendar today; Matrix 7-day Δ baseline vs Calendar; Matrix Δ vs Calendar Δ; baseline vs Trading Rules recalculation.',
  'Volume bars': "Volume bars vs Table today; Volume bars vs Calendar for the last 30 days and for every calendar day; weekly-view bars vs each week's last close.",
  'Technical Analysis': 'Technical Analysis chart lines (RSI, EMA 9/20/50/200, MA Cross, MACD) vs Calendar for the last 60 daily closes.',
  'History popup': 'History popup vs Calendar day-to-day changes (180 days); vs Trading Rules recalculation at the last close; change chain and dates.',
  'Change log': 'Stored change log vs Table (latest entry per indicator); change chain.',
  'MA Cross banner': "MA Cross banner counts vs Table; latest alert's cross day vs Calendar.",
  'Data feed': 'Enough price candles for every indicator, Table freshness, Table price vs latest price candle.',
}

const api = {
  getStatus: () => tradingAPI.getStatus().then(r => r.data),
  getWatchlist: () => dataAPI.getWatchlist().then(r => r.data || []),
  getCandles: (s, d, t) => historyAPI.getPriceHistory(s, d, t).then(r => r.data?.candles || []),
  getSignalChanges: (s, l) => historyAPI.getSignalChanges(s, l).then(r => r.data?.changes || []),
  getMACrossAlerts: (l) => tradingAPI.getMACrossAlerts(l).then(r => r.data?.alerts || []),
}

// Every XHR/fetch URL requested since `t0` (browser resource timing) - for the API usage check
const networkSince = (t0) => () => {
  try {
    return performance.getEntriesByType('resource')
      .filter(e => e.startTime >= t0 && (e.initiatorType === 'xmlhttprequest' || e.initiatorType === 'fetch'))
      .map(e => e.name)
  } catch { return [] }
}

const pair = (s) => (s || '').replace(/^C:/, '')
const loadSaved = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') } catch { return null }
}
const save = (r) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(r)) } catch { /* quota / private mode */ }
}
const worst = (checks) => checks.reduce((w, c) => (RANK[c.status] > RANK[w] ? c.status : w), 'pass')

const download = (name, text, type) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

const StatusPill = ({ status }) => <span className={`sa-pill sa-${status}`}>{status.toUpperCase()}</span>

const ChecksTable = ({ checks }) => (
  <table className="sa-checks">
    <thead>
      <tr><th>Status</th><th>Group</th><th>Check</th><th>Expected (reference)</th><th>Actual (UI)</th><th>Detail</th></tr>
    </thead>
    <tbody>
      {checks.map((c, i) => (
        <tr key={i} className={`sa-row-${c.status}`}>
          <td><StatusPill status={c.status} /></td>
          <td className="sa-dim">{c.group}</td>
          <td>{c.name}</td>
          <td className="sa-mono">{c.expected}</td>
          <td className="sa-mono">{c.actual}</td>
          <td className="sa-note">{c.note}</td>
        </tr>
      ))}
    </tbody>
  </table>
)

export default function SignalTestPage() {
  const navigate = useNavigate()
  const [result, setResult] = useState(loadSaved)
  const [live, setLive] = useState([])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [onlySymbols, setOnlySymbols] = useState('')
  const [statusFilter, setStatusFilter] = useState('issues')
  const [groupFilter, setGroupFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState({})
  const cancelRef = useRef(false)

  const run = async () => {
    cancelRef.current = false
    setRunning(true)
    setLive([])
    setOpen({})
    setProgress({ done: 0, total: 0 })
    const list = onlySymbols.split(/[\s,]+/).filter(Boolean).map(s => (s.toUpperCase().startsWith('C:') ? s.toUpperCase() : `C:${s.toUpperCase()}`))
    const t0 = performance.now()
    try { performance.setResourceTimingBufferSize?.(50000); performance.clearResourceTimings?.() } catch { /* not supported */ }
    try {
      const r = await runSignalAudit({
        api,
        getNetworkUrls: networkSince(t0),
        symbols: list.length ? list : null,
        concurrency: 3,
        isCancelled: () => cancelRef.current,
        onProgress: setProgress,
        onSymbol: (s) => setLive(prev => [...prev, s]),
      })
      r.durationSec = Math.round((performance.now() - t0) / 1000)
      setResult(r)
      save(r)
    } finally {
      setRunning(false)
    }
  }

  const symbols = running ? live : result?.symbols || []
  const totals = useMemo(() => {
    if (!running) return result?.totals
    const t = { pass: 0, warn: 0, fail: 0, info: 0 }
    for (const s of live) for (const k of Object.keys(t)) t[k] += s.summary[k]
    return t
  }, [running, live, result])

  const keep = (c) =>
    (statusFilter === 'all' || (statusFilter === 'issues' ? c.status === STATUS.FAIL || c.status === STATUS.WARN : c.status === statusFilter)) &&
    (groupFilter === 'all' || c.group === groupFilter)

  const rows = useMemo(() => symbols
    .filter(s => !search || pair(s.symbol).toLowerCase().includes(search.toLowerCase()))
    .map(s => ({ ...s, shown: s.checks.filter(keep), worst: worst(s.checks) }))
    .sort((a, b) => RANK[b.worst] - RANK[a.worst] || b.summary.fail - a.summary.fail || b.summary.warn - a.summary.warn || pair(a.symbol).localeCompare(pair(b.symbol))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [symbols, search, statusFilter, groupFilter])

  const pairsFailing = symbols.filter(s => s.summary.fail > 0).length

  const exportCsv = () => {
    const esc = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''))
    const lines = [['Pair', 'Status', 'Group', 'Check', 'Expected', 'Actual', 'Detail']]
    for (const c of result.global) lines.push(['(global)', c.status, c.group, c.name, c.expected, c.actual, c.note])
    for (const s of result.symbols) for (const c of s.checks) lines.push([pair(s.symbol), c.status, c.group, c.name, c.expected, c.actual, c.note])
    download(`signal-audit-${result.startedAt.slice(0, 16).replace(':', '')}.csv`, lines.map(l => l.map(esc).join(',')).join('\n'), 'text/csv')
  }

  // Overview grid: per indicator (Table vs Trading Rules + Table vs Technical Analysis), then per section
  const tip = (c, withStatus) => [
    `${withStatus ? c.status.toUpperCase() + ' ' : ''}${c.name}`,
    `  expected ${c.expected}`,
    `  actual   ${c.actual}`,
    ...(c.note ? [`  ${c.note}`] : []),
  ].join(NEWLINE)
  const indicatorCell = (s, spec) => {
    const cs = s.checks.filter(c => INDICATOR_GROUPS.includes(c.group) && c.name.startsWith(spec.label + ':'))
    if (!cs.length) return null
    return { status: worst(cs), title: cs.map(c => tip(c, true)).join(NEWLINE) }
  }
  const sectionCell = (s, group) => {
    const cs = s.checks.filter(c => c.group === group)
    if (!cs.length) return null
    const shown = cs.filter(c => c.status === 'fail' || c.status === 'warn')
    return { status: worst(cs), fails: cs.filter(c => c.status === 'fail').length, title: (shown.length ? shown : cs).map(c => tip(c, true)).join(NEWLINE) }
  }

  return (
    <div className="sa-page">
      <header className="sa-header">
        <button className="sa-back" onClick={() => navigate('/dashboard')}><ArrowLeft size={16} /> Dashboard</button>
        <div className="sa-title">
          <h1><ShieldCheck size={20} /> Signal Audit</h1>
          <p>Every pair: Table vs Trading Rules recalculation, Technical Analysis chart, Calendar, Matrix, Volume bars, History popup, Change log and MA Cross banner.</p>
        </div>
        <ThemeToggle />
      </header>

      <section className="sa-card sa-controls">
        <div className="sa-run">
          {!running ? (
            <button className="sa-btn sa-primary" onClick={run}><Play size={16} /> Run all tests</button>
          ) : (
            <button className="sa-btn sa-danger" onClick={() => { cancelRef.current = true }}><Square size={14} /> Stop</button>
          )}
          <input
            className="sa-input"
            placeholder="Optional: only these pairs (e.g. USDCAD, EURUSD)"
            value={onlySymbols}
            onChange={e => setOnlySymbols(e.target.value)}
            disabled={running}
          />
          {result && !running && (
            <>
              <button className="sa-btn" onClick={exportCsv}><Download size={14} /> CSV</button>
              <button className="sa-btn" onClick={() => download(`signal-audit-${result.startedAt.slice(0, 10)}.json`, JSON.stringify(result, null, 1), 'application/json')}><Download size={14} /> JSON</button>
            </>
          )}
        </div>
        {running && progress && (
          <div className="sa-progress">
            <div className="sa-bar"><div style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
            <span className="sa-dim">{progress.done}/{progress.total || '…'} pairs {progress.symbol ? `· last: ${pair(progress.symbol)}` : ''}</span>
          </div>
        )}
        {!running && result && (
          <p className="sa-dim sa-meta">
            Last run {new Date(result.startedAt).toLocaleString()} · {result.symbols.length} pairs
            {result.durationSec != null && ` · ${result.durationSec}s`}{result.cancelled && ' · stopped early'}
          </p>
        )}
      </section>

      {totals && (
        <section className="sa-tiles">
          <div className={`sa-tile ${totals.fail ? 'sa-tile-fail' : 'sa-tile-ok'}`}>
            <span className="sa-tile-num">{totals.fail ? totals.fail : '✓'}</span>
            <span>{totals.fail ? `failed checks · ${pairsFailing} pair${pairsFailing === 1 ? '' : 's'}` : 'no failures'}</span>
          </div>
          <div className="sa-tile"><span className="sa-tile-num sa-c-warn">{totals.warn}</span><span>warnings</span></div>
          <div className="sa-tile"><span className="sa-tile-num sa-c-pass">{totals.pass}</span><span>passed</span></div>
          <div className="sa-tile"><span className="sa-tile-num sa-c-info">{totals.info}</span><span>info</span></div>
        </section>
      )}

      {!result && !running && (
        <section className="sa-card">
          <h2>What gets checked</h2>
          <ul className="sa-help">
            {Object.entries(GROUP_HELP).map(([g, t]) => <li key={g}><b>{g}</b> - {t}</li>)}
          </ul>
          <p className="sa-dim">FAIL = a signal disagrees (money-relevant). WARN = same signal but numbers differ, or the value sits right on a threshold. INFO = context, e.g. a signal that changed intraday.</p>
        </section>
      )}

      {result?.global && !running && (
        <section className="sa-card">
          <h2>Formula checks &amp; connections</h2>
          <ChecksTable checks={result.global} />
        </section>
      )}

      {symbols.length > 0 && (
        <section className="sa-card">
          <h2>Overview <span className="sa-dim">every pair · every comparison · hover a cell for expected vs actual · click a row to open</span></h2>
          <div className="sa-matrix-wrap">
            <table className="sa-matrix">
              <thead>
                <tr>
                  <th />
                  <th colSpan={SPECS.length} className="sa-matrix-group">Table vs Trading Rules recalculation &amp; Technical Analysis chart</th>
                  <th colSpan={SECTION_GROUPS.length} className="sa-matrix-group">Section vs section</th>
                </tr>
                <tr>
                  <th>Pair</th>
                  {SPECS.map(s => <th key={s.id}>{s.label.replace(' · ', NEWLINE)}</th>)}
                  {SECTION_GROUPS.map(g => <th key={g} title={GROUP_HELP[g]}>{g.replace(' ', NEWLINE)}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(s => (
                  <tr key={s.symbol} onClick={() => setOpen(o => ({ ...o, [s.symbol]: true }))}>
                    <td className="sa-mono">{pair(s.symbol)}</td>
                    {SPECS.map(spec => {
                      const c = indicatorCell(s, spec)
                      return <td key={spec.id} className={`sa-cell sa-bg-${c?.status || 'none'}`} title={c?.title}>{c ? c.status[0].toUpperCase() : '–'}</td>
                    })}
                    {SECTION_GROUPS.map(g => {
                      const c = sectionCell(s, g)
                      return <td key={g} className={`sa-cell sa-bg-${c?.status || 'none'}`} title={c?.title}>{c ? `${c.fails > 1 ? c.fails : ''}${c.status[0].toUpperCase()}` : '–'}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {symbols.length > 0 && (
        <section className="sa-card">
          <div className="sa-filters">
            <h2>Checks by pair</h2>
            <div className="sa-seg">
              {[['issues', 'Fail + Warn'], ['fail', 'Fail'], ['warn', 'Warn'], ['info', 'Info'], ['all', 'All']].map(([k, l]) => (
                <button key={k} className={statusFilter === k ? 'on' : ''} onClick={() => setStatusFilter(k)}>{l}</button>
              ))}
            </div>
            <select className="sa-input sa-select" value={groupFilter} onChange={e => setGroupFilter(e.target.value)}>
              <option value="all">All groups</option>
              {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <input className="sa-input sa-search" placeholder="Filter pairs…" value={search} onChange={e => setSearch(e.target.value)} />
            <button className="sa-btn" onClick={() => setOpen(Object.fromEntries(rows.map(r => [r.symbol, true])))}>Expand all</button>
            <button className="sa-btn" onClick={() => setOpen({})}>Collapse</button>
          </div>
          {groupFilter !== 'all' && <p className="sa-dim">{GROUP_HELP[groupFilter]}</p>}

          {rows.map(s => {
            const isOpen = open[s.symbol]
            return (
              <div key={s.symbol} className={`sa-pair sa-edge-${s.worst}`}>
                <button className="sa-pair-head" onClick={() => setOpen(o => ({ ...o, [s.symbol]: !o[s.symbol] }))}>
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="sa-mono sa-pair-name">{pair(s.symbol)}</span>
                  <span className="sa-dim sa-mono">{s.price?.toFixed?.(5)}</span>
                  <span className="sa-counts">
                    {s.summary.fail > 0 && <span className="sa-c-fail">{s.summary.fail} fail</span>}
                    {s.summary.warn > 0 && <span className="sa-c-warn">{s.summary.warn} warn</span>}
                    <span className="sa-c-pass">{s.summary.pass} pass</span>
                  </span>
                  {!isOpen && s.shown.length > 0 && <span className="sa-dim sa-preview">{s.shown.slice(0, 2).map(c => c.name).join(' · ')}{s.shown.length > 2 ? ` +${s.shown.length - 2}` : ''}</span>}
                </button>
                {isOpen && (s.shown.length ? <ChecksTable checks={s.shown} /> : <p className="sa-dim sa-empty">No checks match the filter.</p>)}
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}
