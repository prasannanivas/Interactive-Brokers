import React, { useMemo, useState, useEffect } from 'react'
import { historyAPI } from '../api/api'
import { fetchCloseSnapshots, matrixBaseSnapshot, mapLimit, tableCounts, MATRIX_HOURLY_DAYS } from '../utils/signalViews'
import './CurrencyMatrix.css'
import { Grid3x3, LoaderCircle, Scale } from 'lucide-react'

// ── Module-level helpers (pure, no state) ─────────────────────────────────────

// Same count as the table's grey badge: 10 Trading Rules - buy - sell
const countNeutralSignals = (item) => tableCounts(item).neutral

const getHeatmapColor = (count, type) => {
  if (count === null) return 'var(--paper-3)'
  if (count === 0) return 'var(--paper)'

  const maxIntensity = 10
  const intensity = Math.min(Math.abs(count) / maxIntensity, 1)

  // Ramp from paper toward the bull / bear / neutral ink, capped so cell text stays legible in both themes
  const mix = (ink) => `color-mix(in srgb, ${ink} ${Math.round(intensity * 55)}%, var(--paper))`

  if (type === 'bullish' || (type === 'net' && count > 0)) {
    return mix('var(--bull)')
  } else if (type === 'bearish' || (type === 'net' && count < 0)) {
    return mix('var(--bear)')
  } else {
    return mix('var(--text-3)')
  }
}

const parsePairSymbol = (rawSymbol) => {
  let symbol = rawSymbol
  if (symbol?.startsWith('C:')) symbol = symbol.substring(2)

  let base, quote
  if (symbol?.includes('/')) {
    const parts = symbol.split('/')
    base = parts[0]
    quote = parts[1]
  } else if (symbol?.length === 6 && /^[A-Z]{6}$/.test(symbol)) {
    base = symbol.substring(0, 3)
    quote = symbol.substring(3, 6)
  } else if (symbol?.includes('-')) {
    const parts = symbol.split('-')
    base = parts[0]
    quote = parts[1]
  }

  if (base?.length === 3 && quote?.length === 3) return { base, quote }
  return null
}

// ── HeatmapCell sub-component ─────────────────────────────────────────────────

const HeatmapCell = ({ value, type, delta, showDelta, isNull, onClick, title, deltaTitle }) => {
  let deltaColor = 'var(--text-3)'
  let deltaText = ''

  if (!isNull && delta !== null && delta !== undefined) {
    if (delta > 0)      { deltaColor = 'var(--bull-strong)'; deltaText = `+${delta}` }
    else if (delta < 0) { deltaColor = 'var(--bear-strong)'; deltaText = `${delta}` }
    else                { deltaColor = 'var(--text-3)'; deltaText = '±0' }
  }

  return (
    <td
      className={`matrix-cell ${isNull ? 'diagonal' : ''}`}
      style={{
        backgroundColor: getHeatmapColor(value, type),
        fontWeight: (!isNull && value !== 0) ? 'bold' : 'normal',
        cursor: isNull ? 'default' : 'pointer',
        position: 'relative',
      }}
      onClick={onClick}
      title={title}
    >
      {isNull ? '—' : value}
      {showDelta && !isNull && deltaText && (
        <span
          title={deltaTitle || undefined}
          style={{
            position: 'absolute',
            bottom: '1px',
            right: '2px',
            fontSize: '9px',
            fontWeight: 'normal',
            lineHeight: 1,
            color: deltaColor,
            cursor: deltaTitle ? 'help' : 'inherit',
          }}
        >
          {deltaText}
        </span>
      )}
    </td>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const CurrencyMatrix = ({ watchlist, onPairClick }) => {
  const [filterEmpty, setFilterEmpty] = useState(true)
  const [showDelta, setShowDelta] = useState(true)
  const [historicalPairData, setHistoricalPairData] = useState(null)
  const [deltaLoading, setDeltaLoading] = useState(false)

  // "Δ vs 7 days ago": all 10 rules at the close 7 days before the live day (close
  // snapshots, shared with the signal calendar / chart volume bars / history popup).
  // Re-run only when the set of pairs changes - the watchlist object is replaced on every
  // live update.
  const symbolsKey = (watchlist || []).map(item => item.symbol).sort().join(',')

  useEffect(() => {
    if (!watchlist || watchlist.length === 0) return

    const computeHistoricalDeltas = async () => {
      setDeltaLoading(true)

      // All 10 rules at the daily close 7 days before the live day - the same close
      // snapshots as the signal calendar / chart volume bars, so Δ compares like with like.
      const results = await mapLimit(watchlist, 6, item =>
        fetchCloseSnapshots(item.symbol, { hourlyDays: MATRIX_HOURLY_DAYS })
          .then(r => ({ symbol: item.symbol, snap: matrixBaseSnapshot(r.snapshots, 7) }))
          .catch(() => ({ symbol: item.symbol, snap: null }))
      )

      const histData = {}
      results.forEach(({ symbol, snap }) => {
        if (!snap) return
        const parsed = parsePairSymbol(symbol)
        if (parsed) {
          histData[`${parsed.base}/${parsed.quote}`] = {
            bullish: snap.buy.length,
            bearish: snap.sell.length,
            neutral: 0,
            bullishNames: snap.buy,
            bearishNames: snap.sell,
            date: snap.date,
          }
        }
      })

      setHistoricalPairData(Object.keys(histData).length > 0 ? histData : null)
      setDeltaLoading(false)
    }

    computeHistoricalDeltas()
  }, [symbolsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Build all matrices (current + net + deltas)
  const matrixData = useMemo(() => {
    if (!watchlist || watchlist.length === 0) return null

    const currenciesSet = new Set()
    const pairData = {}

    watchlist.forEach(item => {
      const parsed = parsePairSymbol(item.symbol)
      if (parsed) {
        const { base, quote } = parsed
        currenciesSet.add(base)
        currenciesSet.add(quote)
        pairData[`${base}/${quote}`] = {
          bullish: item.buy_signals?.length || 0,
          bearish: item.sell_signals?.length || 0,
          neutral: countNeutralSignals(item),
          originalSymbol: item.symbol,
          bullishNames: item.buy_signals || [],
          bearishNames: item.sell_signals || [],
        }
      }
    })

    const currencies = Array.from(currenciesSet).sort()

    console.log('🔍 Matrix Debug:', {
      watchlistCount: watchlist.length,
      symbols: watchlist.map(w => w.symbol),
      majorCurrencies: currencies,
      majorPairsCount: Object.keys(pairData).length,
      pairDataKeys: Object.keys(pairData),
    })

    // Full unfiltered matrices
    const bullishFull = []
    const bearishFull = []
    const neutralFull = []

    currencies.forEach((base, ri) => {
      bullishFull[ri] = []
      bearishFull[ri] = []
      neutralFull[ri] = []

      currencies.forEach((quote, ci) => {
        if (base === quote) {
          bullishFull[ri][ci] = null
          bearishFull[ri][ci] = null
          neutralFull[ri][ci] = null
        } else {
          const pair = pairData[`${base}/${quote}`]
          bullishFull[ri][ci] = pair ? pair.bullish : 0
          bearishFull[ri][ci] = pair ? pair.bearish : 0
          neutralFull[ri][ci] = pair ? pair.neutral : 0
        }
      })
    })

    // Filter empty rows/columns
    let rowCurrencies, colCurrencies,
        filteredBullish, filteredBearish, filteredNeutral

    if (filterEmpty) {
      const hasRowSignals = (ri) =>
        currencies.some((_, ci) => ci !== ri &&
          ((bullishFull[ri][ci] > 0) || (bearishFull[ri][ci] > 0) || (neutralFull[ri][ci] > 0)))

      const hasColSignals = (ci) =>
        currencies.some((_, ri) => ri !== ci &&
          ((bullishFull[ri][ci] > 0) || (bearishFull[ri][ci] > 0) || (neutralFull[ri][ci] > 0)))

      const activeRows = []
      const activeCols = []
      currencies.forEach((_, i) => {
        if (hasRowSignals(i)) activeRows.push(i)
        if (hasColSignals(i)) activeCols.push(i)
      })

      console.log('🔍 Filtering:', {
        activeRows: activeRows.map(i => currencies[i]),
        activeCols: activeCols.map(i => currencies[i]),
      })

      rowCurrencies = activeRows.map(i => currencies[i])
      colCurrencies = activeCols.map(i => currencies[i])

      filteredBullish = activeRows.map(ri => activeCols.map(ci => bullishFull[ri][ci]))
      filteredBearish = activeRows.map(ri => activeCols.map(ci => bearishFull[ri][ci]))
      filteredNeutral = activeRows.map(ri => activeCols.map(ci => neutralFull[ri][ci]))

      if (rowCurrencies.length === 0 || colCurrencies.length === 0) {
        return {
          rowCurrencies: [], colCurrencies: [],
          bullishMatrix: [], bearishMatrix: [], neutralMatrix: [], netMatrix: [],
          bullishDelta: null, bearishDelta: null, neutralDelta: null, netDelta: null,
          pairData,
        }
      }
    } else {
      rowCurrencies = currencies
      colCurrencies = currencies
      filteredBullish = bullishFull
      filteredBearish = bearishFull
      filteredNeutral = neutralFull
    }

    // Net signal matrix (bullish − bearish)
    const netMatrix = rowCurrencies.map((_, ri) =>
      colCurrencies.map((_, ci) => {
        const b = filteredBullish[ri][ci]
        return b === null ? null : b - filteredBearish[ri][ci]
      })
    )

    // Delta matrices vs 7-day-ago snapshot
    let bullishDelta = null, bearishDelta = null, neutralDelta = null, netDelta = null

    if (historicalPairData) {
      bullishDelta = rowCurrencies.map((base, ri) =>
        colCurrencies.map((quote, ci) => {
          if (filteredBullish[ri][ci] === null) return null
          const hist = historicalPairData[`${base}/${quote}`]
          return hist != null ? filteredBullish[ri][ci] - hist.bullish : null
        })
      )
      bearishDelta = rowCurrencies.map((base, ri) =>
        colCurrencies.map((quote, ci) => {
          if (filteredBearish[ri][ci] === null) return null
          const hist = historicalPairData[`${base}/${quote}`]
          return hist != null ? filteredBearish[ri][ci] - hist.bearish : null
        })
      )
      neutralDelta = rowCurrencies.map((base, ri) =>
        colCurrencies.map((quote, ci) => {
          if (filteredNeutral[ri][ci] === null) return null
          const hist = historicalPairData[`${base}/${quote}`]
          return hist != null ? filteredNeutral[ri][ci] - hist.neutral : null
        })
      )
      netDelta = rowCurrencies.map((base, ri) =>
        colCurrencies.map((quote, ci) => {
          if (netMatrix[ri][ci] === null) return null
          const hist = historicalPairData[`${base}/${quote}`]
          if (hist == null) return null
          return netMatrix[ri][ci] - (hist.bullish - hist.bearish)
        })
      )
    }

    return {
      rowCurrencies,
      colCurrencies,
      bullishMatrix: filteredBullish,
      bearishMatrix: filteredBearish,
      neutralMatrix: filteredNeutral,
      netMatrix,
      bullishDelta,
      bearishDelta,
      neutralDelta,
      netDelta,
      pairData,
    }
  }, [watchlist, filterEmpty, historicalPairData])

  if (!matrixData) {
    return (
      <div className="currency-matrix-container">
        <div className="matrix-empty">
          No currency pairs in watchlist. Add some forex pairs to see the matrix!
        </div>
      </div>
    )
  }

  const {
    rowCurrencies, colCurrencies,
    bullishMatrix, bearishMatrix, neutralMatrix, netMatrix,
    bullishDelta, bearishDelta, neutralDelta, netDelta,
    pairData,
  } = matrixData

  // Human-readable label for an indicator code, whichever engine produced it
  // (live: e.g. "EMA_9_Daily"; JS week-ago estimate: e.g. "EMA_9").
  const formatIndicatorLabel = (code) => code.split('_').join(' ')

  // The live engine names things like "EMA_9_Daily"/"EMA_100_Hourly" while the
  // week-ago JS estimate only knows "EMA_9" (no timeframe suffix) — strip the
  // trailing timeframe so the same underlying indicator lines up for diffing.
  const buildDeltaTooltip = (pairSymbol, type) => {
    if (type !== 'bullish' && type !== 'bearish') return null
    const now = pairData[pairSymbol]
    const hist = historicalPairData?.[pairSymbol]
    if (!now || !hist) return null

    const nowNames = type === 'bullish' ? now.bullishNames : now.bearishNames
    const histNames = type === 'bullish' ? hist.bullishNames : hist.bearishNames
    if (!nowNames || !histNames) return null

    // Both sides use the same 10 rule names, so a plain set difference is exact
    const added = nowNames.filter(n => !histNames.includes(n))
    const removed = histNames.filter(n => !nowNames.includes(n))

    const lines = [`${pairSymbol} — ${type} signals, change vs close of ${hist.date}:`]
    lines.push(added.length ? `+ Turned on: ${added.map(formatIndicatorLabel).join(', ')}` : '+ Turned on: none')
    lines.push(removed.length ? `− Turned off: ${removed.map(formatIndicatorLabel).join(', ')}` : '− Turned off: none')
    return lines.join('\n')
  }

  // Itemized tooltip for the main cell body — which specific indicators make
  // up this count, not just the number.
  const buildCellTooltip = (pairSymbol, type, value, typeLabel) => {
    const base = `${pairSymbol}: ${value} ${typeLabel.toLowerCase()} signal${value !== 1 ? 's' : ''}`
    if (type !== 'bullish' && type !== 'bearish') return base

    const now = pairData[pairSymbol]
    const names = type === 'bullish' ? now?.bullishNames : now?.bearishNames
    if (!names || names.length === 0) return base

    return [base + ':', ...names.map(n => `  • ${formatIndicatorLabel(n)}`)].join('\n')
  }

  const renderMatrix = (matrix, type, title, icon, deltaMatrix) => (
    <div className="matrix-panel">
      <h3 className="matrix-title">{icon} {title}</h3>
      <div className="matrix-table-wrapper">
        <table className="currency-matrix-table">
          <thead>
            <tr>
              <th className="matrix-corner">Quote →<br />Base ↓</th>
              {colCurrencies.map(currency => (
                <th key={currency} className={`matrix-header-cell ink-${currency.toLowerCase()}`}>{currency}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowCurrencies.map((baseCurrency, rowIndex) => (
              <tr key={baseCurrency}>
                <th className={`matrix-row-header ink-${baseCurrency.toLowerCase()}`}>{baseCurrency}</th>
                {colCurrencies.map((quoteCurrency, colIndex) => {
                  const value = matrix[rowIndex][colIndex]
                  const isNull = value === null
                  const delta = deltaMatrix?.[rowIndex]?.[colIndex] ?? null
                  const pairSymbol = `${baseCurrency}/${quoteCurrency}`
                  return (
                    <HeatmapCell
                      key={colIndex}
                      value={value}
                      type={type}
                      delta={delta}
                      showDelta={showDelta}
                      isNull={isNull}
                      onClick={() => !isNull && onPairClick && onPairClick(`C:${baseCurrency}${quoteCurrency}`, type)}
                      title={
                        isNull
                          ? `${baseCurrency} (same currency)`
                          : buildCellTooltip(pairSymbol, type, value, title)
                      }
                      deltaTitle={!isNull ? buildDeltaTooltip(pairSymbol, type) : null}
                    />
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="currency-matrix-container">
      <div className="matrix-header">
        <h2><Grid3x3 size={18} /> Currency Signal Matrix</h2>
        <p className="matrix-description">
          Heatmap showing signal counts for each currency pair. Darker colors indicate more signals.
        </p>
        <div className="matrix-controls">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={filterEmpty}
              onChange={(e) => setFilterEmpty(e.target.checked)}
              className="toggle-checkbox"
            />
            <span className="toggle-text">Hide empty rows/columns</span>
          </label>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={showDelta}
              onChange={(e) => setShowDelta(e.target.checked)}
              className="toggle-checkbox"
              disabled={deltaLoading || !historicalPairData}
            />
            <span className="toggle-text">
              Show Δ vs 7 days ago
              {deltaLoading && <span className="toggle-hint"> <LoaderCircle size={12} className="spin" /> loading…</span>}
            </span>
          </label>
        </div>
      </div>

      <div className="matrices-grid">
        {renderMatrix(bullishMatrix, 'bullish', 'Bullish Signals', <span className="dot dot-bull" />, bullishDelta)}
        {renderMatrix(bearishMatrix, 'bearish', 'Bearish Signals', <span className="dot dot-bear" />, bearishDelta)}
        {renderMatrix(neutralMatrix, 'neutral', 'Neutral Signals', <span className="dot dot-neutral" />, neutralDelta)}
        {renderMatrix(netMatrix, 'net', 'Net Signal (Bullish − Bearish)', <Scale size={16} />, netDelta)}
      </div>
    </div>
  )
}

export default CurrencyMatrix
