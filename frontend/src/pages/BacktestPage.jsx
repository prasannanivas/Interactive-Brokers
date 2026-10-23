import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { backtestAPI, dataAPI } from '../api/api'
import { SectionLoader } from '../components/SectionLoader'
import './BacktestPage.css'
import { ArrowLeft, Download, FlaskConical, Star } from 'lucide-react'

const CONCURRENCY = 3
const SERIES = { best: '#2a78d6', baseline: '#eb6834', hold: '#898781' }

const displaySymbol = (s) => (s || '').replace('C:', '')
const pct = (v, digits = 1) => (v == null ? '–' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`)
const num = (v, digits = 2) => (v == null ? '–' : `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`)

// Diverging blue (good) <-> red (bad) around a neutral gray at Sharpe 0
const MID = [240, 239, 236]
const BLUE = [24, 79, 149]
const RED = [179, 38, 30]
const sharpeColor = (v) => {
  if (v == null) return 'transparent'
  const t = Math.max(-1, Math.min(1, v / 2))
  const pole = t >= 0 ? BLUE : RED
  const a = Math.abs(t)
  const c = MID.map((m, i) => Math.round(m + (pole[i] - m) * a))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}
const inkOn = (v) => (v != null && Math.abs(v) > 1.1 ? '#ffffff' : '#1f2937')

// ── Heat map: Sharpe for every fast/slow combo ────────────────────────────────
const SharpeHeatmap = ({ result, which }) => {
  const [hover, setHover] = useState(null)
  const { fast, slow } = result.heatmap
  const grid = which === 'test' ? result.heatmap.test_sharpe : result.heatmap.train_sharpe
  const cell = 14
  const gap = 1
  const left = 34
  const top = 8
  const width = left + slow.length * (cell + gap) + 8
  const height = top + fast.length * (cell + gap) + 30
  const isBest = (f, s) => f === result.best.fast && s === result.best.slow
  const isBase = (f, s) => f === result.baseline.fast && s === result.baseline.slow

  return (
    <div className="bt-heatmap">
      <div className="bt-heatmap-scroll">
        <svg width={width} height={height} role="img"
          aria-label={`${which === 'test' ? 'Out-of-sample' : 'Train'} Sharpe for each EMA fast/slow combination`}
          onMouseLeave={() => setHover(null)}>
          {fast.map((f, fi) => (
            <text key={`f${f}`} x={left - 6} y={top + fi * (cell + gap) + cell * 0.75} textAnchor="end" className="bt-axis-label">{f}</text>
          ))}
          {slow.map((s, si) => (si % 5 === 0 || s === 21) && (
            <text key={`s${s}`} x={left + si * (cell + gap) + cell / 2} y={top + fast.length * (cell + gap) + 14}
              textAnchor="middle" className="bt-axis-label">{s}</text>
          ))}
          <text x={left + (slow.length * (cell + gap)) / 2} y={height - 2} textAnchor="middle" className="bt-axis-title">Slow EMA</text>
          {fast.map((f, fi) => slow.map((s, si) => {
            const v = grid[fi][si]
            if (v == null) return null
            const x = left + si * (cell + gap)
            const y = top + fi * (cell + gap)
            return (
              <rect key={`${f}-${s}`} x={x} y={y} width={cell} height={cell} rx={2}
                fill={sharpeColor(v)}
                stroke={isBest(f, s) ? '#111827' : isBase(f, s) ? SERIES.baseline : 'none'}
                strokeWidth={isBest(f, s) || isBase(f, s) ? 2 : 0}
                onMouseEnter={() => setHover({ f, s, v, x, y, fi, si })} />
            )
          }))}
        </svg>
        {hover && (
          <div className="bt-tooltip" style={{ left: hover.x + 20, top: hover.y - 6 }}>
            <strong>EMA {hover.f} / {hover.s}</strong>
            <span>{which === 'test' ? 'Test' : 'Train'} Sharpe {num(hover.v)}</span>
            {(() => {
              const other = (which === 'test' ? result.heatmap.train_sharpe : result.heatmap.test_sharpe)[hover.fi][hover.si]
              return <span className="bt-tooltip-muted">{which === 'test' ? 'Train' : 'Test'} Sharpe {num(other)}</span>
            })()}
            {isBest(hover.f, hover.s) && <span className="bt-tooltip-muted"><Star size={11} fill="currentColor" /> Selected best</span>}
            {isBase(hover.f, hover.s) && <span className="bt-tooltip-muted">Current alert setting</span>}
          </div>
        )}
      </div>
      <div className="bt-heatmap-legend">
        <span className="bt-axis-title bt-fast-title">Fast EMA ↓</span>
        <span>Sharpe</span>
        <span className="bt-legend-scale">
          <span className="bt-legend-ramp" />
          <span className="bt-legend-ticks"><span>−2</span><span>0</span><span>+2</span></span>
        </span>
        <span className="bt-legend-key"><span className="bt-key-box best" /> Selected best</span>
        <span className="bt-legend-key"><span className="bt-key-box base" /> EMA 9/21 (current)</span>
      </div>
    </div>
  )
}

// ── Equity curve: best vs EMA 9/21 vs buy & hold ──────────────────────────────
const EquityChart = ({ result }) => {
  const data = result.equity.dates.map((d, i) => ({
    date: d,
    best: result.equity.best[i],
    baseline: result.equity.baseline[i],
    hold: result.equity.buy_hold[i],
  }))
  const splitDate = result.equity.dates.find(d => d >= result.split_date)
  const fmt = (v) => `${((v - 1) * 100).toFixed(1)}%`
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#e1e0d9" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} minTickGap={50} tickLine={false} axisLine={{ stroke: '#c3c2b7' }} />
        <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: '#6b7280' }} width={56} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
        <Tooltip formatter={(v, name) => [fmt(v), name]} labelStyle={{ color: '#1f2937', fontWeight: 600 }}
          contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {splitDate && (
          <ReferenceLine x={splitDate} stroke="#9ca3af" strokeDasharray="4 4"
            label={{ value: 'Out-of-sample →', position: 'insideTopRight', fill: '#6b7280', fontSize: 11 }} />
        )}
        <Line type="monotone" dataKey="best" name={`Best EMA ${result.best.fast}/${result.best.slow}`} stroke={SERIES.best} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="baseline" name="EMA 9/21 (current)" stroke={SERIES.baseline} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="hold" name="Buy & hold" stroke={SERIES.hold} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── CSV export ────────────────────────────────────────────────────────────────
const downloadCsv = (filename, header, rows) => {
  const esc = (v) => {
    if (v == null) return ''
    const str = String(v)
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
  }
  const csv = [header, ...rows].map(r => r.map(esc).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

const TRADE_HEADER = [
  'Pair', 'Strategy', 'Trade #', 'Direction', 'Signal',
  'Entry date', 'Entry time (ET)', 'Entry price', 'EMA fast at entry', 'EMA slow at entry',
  'Exit date', 'Exit time (ET)', 'Exit price', 'EMA fast at exit', 'EMA slow at exit', 'Exit reason',
  'Trading days held', 'Calendar days held', 'Pips', 'Pip size',
  'Gross return %', 'Cost %', 'Net return %', 'Best point during trade % (MFE)', 'Worst point during trade % (MAE)',
  'Equity after (start = 1)', 'Period', 'Status', 'Cost bps per side',
]

const p3 = (v) => (v == null ? '' : (v * 100).toFixed(3))
const px = (v) => (v == null ? '' : Number(v.toPrecision(8)))

// One row per trade; which = 'best' | 'baseline'
const tradeRows = (r, which) => {
  const combo = which === 'best' ? r.best : r.baseline
  const label = `EMA ${combo.fast}/${combo.slow}${which === 'baseline' ? ' (current)' : ' (best)'}`
  return (r.trades?.[which] || []).map(t => [
    displaySymbol(r.symbol), label, t.n, t.direction, t.signal,
    t.entry_date, t.entry_time_et, px(t.entry_price), px(t.entry_ema_fast), px(t.entry_ema_slow),
    t.exit_date, t.exit_time_et ?? '', px(t.exit_price), px(t.exit_ema_fast), px(t.exit_ema_slow), t.exit_reason,
    t.days, t.calendar_days, t.pips?.toFixed(1), t.pip_size,
    p3(t.gross_return), p3(t.cost), p3(t.net_return), p3(t.mfe), p3(t.mae),
    t.equity_after?.toFixed(5), t.period === 'test' ? 'out-of-sample' : 'train', t.status, r.cost_bps,
  ])
}

const today = () => new Date().toISOString().slice(0, 10)

// ── Page ──────────────────────────────────────────────────────────────────────
const BacktestPage = () => {
  const navigate = useNavigate()
  const [pairs, setPairs] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [pairFilter, setPairFilter] = useState('')
  const [years, setYears] = useState(3)
  const [costBps, setCostBps] = useState(1.0)
  const [testFraction, setTestFraction] = useState(0.3)
  const [results, setResults] = useState({})   // symbol -> result
  const [errors, setErrors] = useState({})     // symbol -> message
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [active, setActive] = useState(null)
  const [heatWhich, setHeatWhich] = useState('test')
  const [sort, setSort] = useState({ key: 'testSharpe', dir: -1 })

  useEffect(() => {
    dataAPI.getWatchlist()
      .then(res => {
        const syms = (res.data || []).map(i => i.symbol).filter(s => s.startsWith('C:')).sort()
        setPairs(syms)
        setSelected(new Set(syms))
      })
      .catch(err => console.error('Failed to load watchlist:', err))
  }, [])

  const run = async () => {
    const queue = pairs.filter(p => selected.has(p))
    if (queue.length === 0) return
    setRunning(true)
    setResults({})
    setErrors({})
    setActive(null)
    const total = queue.length
    setProgress({ done: 0, total })
    let done = 0
    const worker = async () => {
      while (queue.length) {
        const symbol = queue.shift()
        try {
          const res = await backtestAPI.runMACross({ symbol, years, costBps, testFraction })
          setResults(prev => ({ ...prev, [symbol]: res.data }))
        } catch (err) {
          setErrors(prev => ({ ...prev, [symbol]: err.response?.data?.detail || err.message }))
        }
        done += 1
        setProgress({ done, total })
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    setRunning(false)
  }

  const rows = useMemo(() => {
    const list = Object.values(results).map(r => ({
      symbol: r.symbol,
      r,
      best: `${r.best.fast}/${r.best.slow}`,
      trainSharpe: r.best.train.sharpe_smoothed,
      testSharpe: r.best.test.sharpe,
      testReturn: r.best.test.total_return,
      maxDD: r.best.test.max_drawdown,
      trades: r.best.test.trades,
      winRate: r.best.test.win_rate,
      baseSharpe: r.baseline.test.sharpe,
      baseReturn: r.baseline.test.total_return,
      edge: (r.best.test.sharpe ?? 0) - (r.baseline.test.sharpe ?? 0),
    }))
    const { key, dir } = sort
    return list.sort((a, b) => {
      const x = a[key], y = b[key]
      if (typeof x === 'string') return x.localeCompare(y) * dir
      return ((x ?? -Infinity) - (y ?? -Infinity)) * dir
    })
  }, [results, sort])

  const summary = useMemo(() => {
    if (rows.length === 0) return null
    const median = (arr) => {
      const s = arr.filter(v => v != null).sort((a, b) => a - b)
      return s.length ? s[Math.floor((s.length - 1) / 2)] : null
    }
    return {
      count: rows.length,
      beats: rows.filter(r => r.edge > 0).length,
      medBest: median(rows.map(r => r.testSharpe)),
      medBase: median(rows.map(r => r.baseSharpe)),
    }
  }, [rows])

  const sortBy = (key) => setSort(prev => ({ key, dir: prev.key === key ? -prev.dir : (key === 'symbol' || key === 'best' ? 1 : -1) }))
  const sortMark = (key) => (sort.key === key ? (sort.dir > 0 ? ' ▲' : ' ▼') : '')

  const exportCsv = () => {
    const header = ['Pair', 'Best fast', 'Best slow', 'Train Sharpe (smoothed)', 'Test Sharpe', 'Test return', 'Test max drawdown',
      'Test trades', 'Test win rate', 'EMA 9/21 test Sharpe', 'EMA 9/21 test return', 'Beats 9/21 out-of-sample',
      'Start', 'Out-of-sample from', 'End', 'Cost bps']
    const lines = rows.map(({ r }) => [
      displaySymbol(r.symbol), r.best.fast, r.best.slow, r.best.train.sharpe_smoothed?.toFixed(3), r.best.test.sharpe?.toFixed(3),
      r.best.test.total_return?.toFixed(4), r.best.test.max_drawdown?.toFixed(4), r.best.test.trades, r.best.test.win_rate?.toFixed(3),
      r.baseline.test.sharpe?.toFixed(3), r.baseline.test.total_return?.toFixed(4), r.beats_baseline_out_of_sample ? 'yes' : 'no',
      r.start_date, r.split_date, r.end_date, r.cost_bps,
    ].join(','))
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ma-cross-backtest-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const exportPairTrades = (r, which) => {
    const combo = which === 'best' ? r.best : r.baseline
    downloadCsv(`trades-${displaySymbol(r.symbol)}-ema${combo.fast}-${combo.slow}-${today()}.csv`, TRADE_HEADER, tradeRows(r, which))
  }

  const exportAllTrades = () => {
    const all = rows.flatMap(({ r }) => [...tradeRows(r, 'best'), ...tradeRows(r, 'baseline')])
    downloadCsv(`ma-cross-trades-all-pairs-${today()}.csv`, TRADE_HEADER, all)
  }

  const visiblePairs = pairs.filter(p => p.toLowerCase().includes(pairFilter.toLowerCase()))
  const activeResult = active ? results[active] : null

  return (
    <div className="bt-page">
      <div className="bt-header">
        <button className="bt-back" onClick={() => navigate('/dashboard')}><ArrowLeft size={15} /> Back to Dashboard</button>
        <div>
          <h1><FlaskConical size={24} /> MA Cross Backtest</h1>
          <p>Find the EMA fast/slow combination with the best risk-adjusted return for each pair, and check it against the current EMA 9/21.</p>
        </div>
      </div>

      <div className="bt-card">
        <div className="bt-controls">
          <div className="bt-control bt-pairs">
            <div className="bt-control-head">
              <label>Pairs ({selected.size}/{pairs.length})</label>
              <span className="bt-links">
                <button onClick={() => setSelected(new Set(pairs))} disabled={running}>All</button>
                <button onClick={() => setSelected(new Set())} disabled={running}>None</button>
              </span>
            </div>
            <input className="bt-input" placeholder="Filter pairs…" value={pairFilter} onChange={e => setPairFilter(e.target.value)} />
            <div className="bt-pair-list">
              {pairs.length === 0 && <span className="bt-muted">Loading watchlist…</span>}
              {visiblePairs.map(p => (
                <label key={p} className={`bt-pair ${selected.has(p) ? 'on' : ''}`}>
                  <input type="checkbox" checked={selected.has(p)} disabled={running}
                    onChange={() => setSelected(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n })} />
                  {displaySymbol(p)}
                </label>
              ))}
            </div>
          </div>

          <div className="bt-control-col">
            <div className="bt-control">
              <label htmlFor="bt-years">History</label>
              <select id="bt-years" className="bt-input" value={years} onChange={e => setYears(Number(e.target.value))} disabled={running}>
                {[1, 2, 3, 5, 10].map(y => <option key={y} value={y}>{y} year{y > 1 ? 's' : ''}</option>)}
              </select>
            </div>
            <div className="bt-control">
              <label htmlFor="bt-cost">Spread cost (bps per side)</label>
              <input id="bt-cost" className="bt-input" type="number" min="0" max="50" step="0.5" value={costBps}
                onChange={e => setCostBps(Number(e.target.value))} disabled={running} />
              <span className="bt-hint">1 bp ≈ 1 pip on EUR/USD. Use more for exotics (HUF, MXN, NOK…).</span>
            </div>
            <div className="bt-control">
              <label htmlFor="bt-test">Out-of-sample test period</label>
              <select id="bt-test" className="bt-input" value={testFraction} onChange={e => setTestFraction(Number(e.target.value))} disabled={running}>
                {[0.2, 0.3, 0.4, 0.5].map(f => <option key={f} value={f}>Last {Math.round(f * 100)}% of history</option>)}
              </select>
            </div>
            <button className="bt-run" onClick={run} disabled={running || selected.size === 0}>
              {running ? `Running… ${progress.done}/${progress.total}` : `Run backtest (${selected.size} pair${selected.size === 1 ? '' : 's'})`}
            </button>
            {running && (
              <div className="bt-progress" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total}>
                <span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
              </div>
            )}
          </div>

          <div className="bt-control-col bt-method">
            <h3>How it works</h3>
            <ul>
              <li>Daily candles, weekends dropped - the same data as the chart and the alerts.</li>
              <li>Tests every EMA fast 3–20 × slow 10–60 (852 combinations).</li>
              <li>Always in the market: <strong>long</strong> after a golden cross, <strong>short</strong> after a death cross. Each flip pays the spread cost.</li>
              <li>Ranked by Sharpe on the <strong>earlier</strong> part of the history, averaged over neighbouring settings so stable regions beat lucky spikes.</li>
              <li>Judged on the <strong>later</strong> part it never saw. That out-of-sample result is what matters.</li>
            </ul>
          </div>
        </div>
      </div>

      {summary && (
        <div className="bt-summary">
          <div><span className="bt-stat">{summary.count}</span><span className="bt-stat-label">pairs tested</span></div>
          <div><span className="bt-stat">{summary.beats}/{summary.count}</span><span className="bt-stat-label">beat EMA 9/21 out-of-sample</span></div>
          <div><span className="bt-stat">{num(summary.medBest)}</span><span className="bt-stat-label">median test Sharpe, optimised</span></div>
          <div><span className="bt-stat">{num(summary.medBase)}</span><span className="bt-stat-label">median test Sharpe, EMA 9/21</span></div>
          <span className="bt-export-group">
            <button className="bt-export" onClick={exportCsv}><Download size={14} /> Results CSV</button>
            <button className="bt-export" onClick={exportAllTrades}
              title="Every trade for each pair's best combo and for EMA 9/21"><Download size={14} /> All trades CSV</button>
          </span>
        </div>
      )}

      {running && rows.length === 0 && <SectionLoader variant="table" title="Results" label="Running backtests…" />}

      {rows.length > 0 && (
        <div className="bt-card">
          <h2>Results <span className="bt-muted">· out-of-sample figures unless noted · click a row for details</span></h2>
          <div className="bt-table-scroll">
            <table className="bt-table">
              <thead>
                <tr>
                  <th onClick={() => sortBy('symbol')}>Pair{sortMark('symbol')}</th>
                  <th onClick={() => sortBy('best')}>Best EMA{sortMark('best')}</th>
                  <th onClick={() => sortBy('trainSharpe')} title="Neighbourhood-average Sharpe on the train period">Train Sharpe{sortMark('trainSharpe')}</th>
                  <th onClick={() => sortBy('testSharpe')}>Test Sharpe{sortMark('testSharpe')}</th>
                  <th onClick={() => sortBy('testReturn')}>Test return{sortMark('testReturn')}</th>
                  <th onClick={() => sortBy('maxDD')}>Max drawdown{sortMark('maxDD')}</th>
                  <th onClick={() => sortBy('trades')}>Trades{sortMark('trades')}</th>
                  <th onClick={() => sortBy('winRate')}>Win rate{sortMark('winRate')}</th>
                  <th onClick={() => sortBy('baseSharpe')}>9/21 Sharpe{sortMark('baseSharpe')}</th>
                  <th onClick={() => sortBy('baseReturn')}>9/21 return{sortMark('baseReturn')}</th>
                  <th onClick={() => sortBy('edge')}>vs 9/21{sortMark('edge')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.symbol} className={active === row.symbol ? 'active' : ''} onClick={() => setActive(row.symbol)}>
                    <td className="bt-pair-cell">{displaySymbol(row.symbol)}</td>
                    <td><strong>{row.best}</strong></td>
                    <td>{num(row.trainSharpe)}</td>
                    <td><strong>{num(row.testSharpe)}</strong></td>
                    <td>{pct(row.testReturn)}</td>
                    <td>{pct(row.maxDD)}</td>
                    <td>{row.trades}</td>
                    <td>{row.winRate == null ? '–' : `${Math.round(row.winRate * 100)}%`}</td>
                    <td>{num(row.baseSharpe)}</td>
                    <td>{pct(row.baseReturn)}</td>
                    <td>
                      <span className={`bt-verdict ${row.edge > 0 ? 'better' : 'worse'}`}>
                        {row.edge > 0 ? '▲ Better' : '▼ Worse'} {num(row.edge)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {Object.keys(errors).length > 0 && (
            <p className="bt-errors">
              Skipped: {Object.entries(errors).map(([s, e]) => `${displaySymbol(s)} (${e})`).join(' · ')}
            </p>
          )}
        </div>
      )}

      {activeResult && (
        <div className="bt-card bt-detail">
          <div className="bt-detail-head">
            <h2>{displaySymbol(activeResult.symbol)} · best EMA {activeResult.best.fast}/{activeResult.best.slow}</h2>
            <span className="bt-muted">
              {activeResult.start_date} → {activeResult.end_date} · out-of-sample from {activeResult.split_date} · {activeResult.cost_bps} bps per side
            </span>
            <span className="bt-export-group bt-detail-exports">
              <button className="bt-export" onClick={() => exportPairTrades(activeResult, 'best')}>
                <Download size={14} /> Trades: EMA {activeResult.best.fast}/{activeResult.best.slow} ({activeResult.trades?.best?.length ?? 0})
              </button>
              <button className="bt-export" onClick={() => exportPairTrades(activeResult, 'baseline')}>
                <Download size={14} /> Trades: EMA 9/21 ({activeResult.trades?.baseline?.length ?? 0})
              </button>
            </span>
          </div>

          <div className="bt-detail-grid">
            <div>
              <div className="bt-subhead">
                <h3>Sharpe by combination</h3>
                <div className="bt-toggle" role="tablist">
                  <button className={heatWhich === 'test' ? 'on' : ''} onClick={() => setHeatWhich('test')}>Out-of-sample</button>
                  <button className={heatWhich === 'train' ? 'on' : ''} onClick={() => setHeatWhich('train')}>Train</button>
                </div>
              </div>
              <SharpeHeatmap result={activeResult} which={heatWhich} />
            </div>
            <div>
              <h3>Top 10 (ranked on train)</h3>
              <table className="bt-table bt-top">
                <thead><tr><th>EMA</th><th>Train Sharpe</th><th>Test Sharpe</th><th>Test return</th><th>Trades</th></tr></thead>
                <tbody>
                  {activeResult.top.map(t => (
                    <tr key={`${t.fast}-${t.slow}`}>
                      <td><strong>{t.fast}/{t.slow}</strong></td>
                      <td>{num(t.train.sharpe_smoothed)}</td>
                      <td>{num(t.test.sharpe)}</td>
                      <td>{pct(t.test.total_return)}</td>
                      <td>{t.test.trades}</td>
                    </tr>
                  ))}
                  <tr className="bt-baseline-row">
                    <td><strong>9/21</strong> <span className="bt-muted">current</span></td>
                    <td>{num(activeResult.baseline.train.sharpe_smoothed)}</td>
                    <td>{num(activeResult.baseline.test.sharpe)}</td>
                    <td>{pct(activeResult.baseline.test.total_return)}</td>
                    <td>{activeResult.baseline.test.trades}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <h3>Equity curve (growth of 1 unit, after costs)</h3>
          <EquityChart result={activeResult} />
        </div>
      )}
    </div>
  )
}

export default BacktestPage
