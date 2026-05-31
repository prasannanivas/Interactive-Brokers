import React, { useMemo, useState, useEffect } from 'react'
import { historyAPI } from '../api/api'
import { getSignalCountsFromCandles } from '../utils/indicatorUtils'
import './CurrencyMatrix.css'

// ── Module-level helpers (pure, no state) ─────────────────────────────────────

const countNeutralSignals = (item) => {
  let count = 0

  if (item.daily_indicators) {
    if (!item.daily_indicators.bollinger_band?.signal) count++
    if (!item.daily_indicators.rsi_9?.signal) count++
    if (!item.daily_indicators.ema_9?.signal) count++
    if (!item.daily_indicators.ema_20?.signal) count++
    if (!item.daily_indicators.ema_50?.signal) count++
    if (!item.daily_indicators.ema_200?.signal) count++
    if (!item.daily_indicators.ma_crossover?.signal) count++
    if (!item.daily_indicators.macd?.signal) count++
  }

  if (item.hourly_indicators?.ema_100 && !item.hourly_indicators.ema_100.signal) count++
  if (item.weekly_indicators?.ema_20 && !item.weekly_indicators.ema_20.signal) count++

  return count
}

const getHeatmapColor = (count, type) => {
  if (count === null) return '#f3f4f6'
  if (count === 0) return '#ffffff'

  const maxIntensity = 10
  const absCount = Math.abs(count)
  const intensity = Math.min(absCount / maxIntensity, 1)

  if (type === 'bullish' || (type === 'net' && count > 0)) {
    return `rgb(${Math.round(16 + (234 * (1 - intensity)))}, ${Math.round(185 + (70 * (1 - intensity)))}, ${Math.round(129 + (115 * (1 - intensity)))})`
  } else if (type === 'bearish' || (type === 'net' && count < 0)) {
    return `rgb(${Math.round(254 - (intensity * 34))}, ${Math.round(226 - (intensity * 188))}, ${Math.round(226 - (intensity * 188))})`
  } else {
    const grayValue = Math.round(156 - (intensity * 80))
    return `rgb(${grayValue}, ${grayValue + 10}, ${grayValue + 20})`
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

const HeatmapCell = ({ value, type, delta, showDelta, isNull, onClick, title }) => {
  let deltaColor = '#6b7280'
  let deltaText = ''

  if (!isNull && delta !== null && delta !== undefined) {
    if (delta > 0)      { deltaColor = '#16a34a'; deltaText = `+${delta}` }
    else if (delta < 0) { deltaColor = '#dc2626'; deltaText = `${delta}` }
    else                { deltaColor = '#9ca3af'; deltaText = '±0' }
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
          style={{
            position: 'absolute',
            bottom: '1px',
            right: '2px',
            fontSize: '9px',
            fontWeight: 'normal',
            lineHeight: 1,
            color: deltaColor,
            pointerEvents: 'none',
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

  // Compute "7 days ago" signals on the fly from price history — same approach as ChartModal volume bars.
  // For each pair, fetch 250 daily candles, slice to the 7-days-ago candle, run daily indicators,
  // and count buy/sell signals. No snapshot dependency.
  useEffect(() => {
    if (!watchlist || watchlist.length === 0) return

    const computeHistoricalDeltas = async () => {
      setDeltaLoading(true)
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const targetDateStr = sevenDaysAgo.toISOString().split('T')[0] // 'YYYY-MM-DD'

      // Fetch 250 daily bars for all watchlist symbols in parallel
      const fetches = watchlist.map(item =>
        historyAPI.getPriceHistory(item.symbol, 250, 'day')
          .then(r => ({ symbol: item.symbol, candles: r.data?.candles || [] }))
          .catch(() => ({ symbol: item.symbol, candles: [] }))
      )
      const results = await Promise.all(fetches)

      const histData = {}
      results.forEach(({ symbol, candles }) => {
        if (!candles.length) return

        // Sort ascending, filter out weekends (same as ChartModal)
        const sorted = [...candles]
          .sort((a, b) => (a.time > b.time ? 1 : -1))
          .filter(c => {
            const d = new Date(c.time + 'T00:00:00Z')
            const day = d.getUTCDay()
            return day !== 0 && day !== 6
          })

        // Slice to candles up to and including the target date
        const cutIdx = sorted.findLastIndex(c => c.time <= targetDateStr)
        if (cutIdx < 25) return // not enough history

        const sliced = sorted.slice(0, cutIdx + 1)
        const counts = getSignalCountsFromCandles(sliced)

        const parsed = parsePairSymbol(symbol)
        if (parsed) {
          histData[`${parsed.base}/${parsed.quote}`] = {
            bullish: counts.bullish,
            bearish: counts.bearish,
            neutral: 0,
          }
        }
      })

      setHistoricalPairData(Object.keys(histData).length > 0 ? histData : null)
      setDeltaLoading(false)
    }

    computeHistoricalDeltas()
  }, [watchlist])

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
  } = matrixData

  const renderMatrix = (matrix, type, title, emoji, deltaMatrix) => (
    <div className="matrix-panel">
      <h3 className="matrix-title">{emoji} {title}</h3>
      <div className="matrix-table-wrapper">
        <table className="currency-matrix-table">
          <thead>
            <tr>
              <th className="matrix-corner">Quote →<br />Base ↓</th>
              {colCurrencies.map(currency => (
                <th key={currency} className="matrix-header-cell">{currency}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowCurrencies.map((baseCurrency, rowIndex) => (
              <tr key={baseCurrency}>
                <th className="matrix-row-header">{baseCurrency}</th>
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
                          : `${pairSymbol}: ${value} ${title.toLowerCase()} signal${value !== 1 ? 's' : ''}`
                      }
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
        <h2>📊 Currency Signal Matrix</h2>
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
              {deltaLoading && <span className="toggle-hint"> ⏳ loading...</span>}
            </span>
          </label>
        </div>
      </div>

      <div className="matrices-grid">
        {renderMatrix(bullishMatrix, 'bullish', 'Bullish Signals', '🟢', bullishDelta)}
        {renderMatrix(bearishMatrix, 'bearish', 'Bearish Signals', '🔴', bearishDelta)}
        {renderMatrix(neutralMatrix, 'neutral', 'Neutral Signals', '⚪', neutralDelta)}
        {renderMatrix(netMatrix, 'net', 'Net Signal (Bullish − Bearish)', '📊', netDelta)}
      </div>
    </div>
  )
}

export default CurrencyMatrix
