import React, { useMemo, useState } from 'react'
import './CurrencyMatrix.css'

const CurrencyMatrix = ({ watchlist, onPairClick }) => {
  const [filterEmpty, setFilterEmpty] = useState(true)
  
  // Count neutral signals (same as Dashboard logic)
  const countNeutralSignals = (item) => {
    let count = 0
    
    // Daily indicators
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
    
    // Hourly indicators
    if (item.hourly_indicators?.ema_100 && !item.hourly_indicators.ema_100.signal) count++
    
    // Weekly indicators
    if (item.weekly_indicators?.ema_20 && !item.weekly_indicators.ema_20.signal) count++
    
    return count
  }

  // Extract unique currencies from pairs and build matrix data
  const matrixData = useMemo(() => {
    if (!watchlist || watchlist.length === 0) return null

    // Extract unique currencies from symbols like "EUR/USD" or "C:EURUSD"
    const currenciesSet = new Set()
    const pairData = {}

    watchlist.forEach(item => {
      let symbol = item.symbol
      
      // Handle different formats: "C:EURUSD", "EURUSD", "EUR/USD"
      if (symbol.startsWith('C:')) {
        symbol = symbol.substring(2) // Remove "C:" prefix
      }
      
      let base, quote
      
      // Try to split by /
      if (symbol.includes('/')) {
        const parts = symbol.split('/')
        base = parts[0]
        quote = parts[1]
      } 
      // Try common 6-character forex format like "EURUSD"
      else if (symbol.length === 6 && /^[A-Z]{6}$/.test(symbol)) {
        base = symbol.substring(0, 3)
        quote = symbol.substring(3, 6)
      }
      // Try 7-character format with separator like "EUR-USD"
      else if (symbol.includes('-')) {
        const parts = symbol.split('-')
        base = parts[0]
        quote = parts[1]
      }
      
      // Include all valid currency pairs
      if (base && quote && base.length === 3 && quote.length === 3) {
        currenciesSet.add(base)
        currenciesSet.add(quote)
        
        const normalizedSymbol = `${base}/${quote}`
        
        // Store signal counts for this pair
        pairData[normalizedSymbol] = {
          bullish: item.buy_signals?.length || 0,
          bearish: item.sell_signals?.length || 0,
          neutral: countNeutralSignals(item),
          originalSymbol: item.symbol
        }
      }
    })

    const currencies = Array.from(currenciesSet).sort()
    
    console.log('🔍 Matrix Debug:', {
      watchlistCount: watchlist.length,
      symbols: watchlist.map(w => w.symbol),
      majorCurrencies: currencies,
      majorPairsCount: Object.keys(pairData).length,
      pairDataKeys: Object.keys(pairData)
    })

    // Build matrix: matrix[row][col] = signals for currencies[row]/currencies[col]
    const bullishMatrix = []
    const bearishMatrix = []
    const neutralMatrix = []

    currencies.forEach((baseCurrency, rowIndex) => {
      bullishMatrix[rowIndex] = []
      bearishMatrix[rowIndex] = []
      neutralMatrix[rowIndex] = []

      currencies.forEach((quoteCurrency, colIndex) => {
        if (baseCurrency === quoteCurrency) {
          // Diagonal cells - same currency
          bullishMatrix[rowIndex][colIndex] = null
          bearishMatrix[rowIndex][colIndex] = null
          neutralMatrix[rowIndex][colIndex] = null
        } else {
          const pairSymbol = `${baseCurrency}/${quoteCurrency}`
          const pair = pairData[pairSymbol]
          
          if (pair) {
            bullishMatrix[rowIndex][colIndex] = pair.bullish
            bearishMatrix[rowIndex][colIndex] = pair.bearish
            neutralMatrix[rowIndex][colIndex] = pair.neutral
          } else {
            bullishMatrix[rowIndex][colIndex] = 0
            bearishMatrix[rowIndex][colIndex] = 0
            neutralMatrix[rowIndex][colIndex] = 0
          }
        }
      })
    })

    // Conditionally filter rows and columns based on filterEmpty state
    let rowCurrencies, colCurrencies, filteredBullishMatrix, filteredBearishMatrix, filteredNeutralMatrix
    
    if (filterEmpty) {
      // Filter rows and columns independently
      // Keep row if it has any signals, keep column if it has any signals
      const hasRowSignals = (rowIndex) => {
        for (let col = 0; col < currencies.length; col++) {
          if (col === rowIndex) continue // Skip diagonal
          
          const bullish = bullishMatrix[rowIndex][col]
          const bearish = bearishMatrix[rowIndex][col]
          const neutral = neutralMatrix[rowIndex][col]
          
          if ((typeof bullish === 'number' && bullish > 0) || 
              (typeof bearish === 'number' && bearish > 0) || 
              (typeof neutral === 'number' && neutral > 0)) {
            return true
          }
        }
        return false
      }
      
      const hasColSignals = (colIndex) => {
        for (let row = 0; row < currencies.length; row++) {
          if (row === colIndex) continue // Skip diagonal
          
          const bullish = bullishMatrix[row][colIndex]
          const bearish = bearishMatrix[row][colIndex]
          const neutral = neutralMatrix[row][colIndex]
          
          if ((typeof bullish === 'number' && bullish > 0) || 
              (typeof bearish === 'number' && bearish > 0) || 
              (typeof neutral === 'number' && neutral > 0)) {
            return true
          }
        }
        return false
      }

      // Get active rows and columns separately
      console.log('🔍 Filtering rows and columns independently...')
      const activeRowIndices = []
      const activeColIndices = []
      
      for (let i = 0; i < currencies.length; i++) {
        const hasRow = hasRowSignals(i)
        const hasCol = hasColSignals(i)
        
        if (hasRow) activeRowIndices.push(i)
        if (hasCol) activeColIndices.push(i)
        
        console.log(`${currencies[i]}: row=${hasRow ? '✅' : '❌'}, col=${hasCol ? '✅' : '❌'}`)
      }
      
      console.log('🔍 Filtering complete:', {
        activeRows: activeRowIndices.map(i => currencies[i]),
        activeCols: activeColIndices.map(i => currencies[i])
      })
      
      // Filter currencies for row and column headers
      rowCurrencies = activeRowIndices.map(i => currencies[i])
      colCurrencies = activeColIndices.map(i => currencies[i])
      
      // Build filtered matrices: rows x columns
      filteredBullishMatrix = activeRowIndices.map(rowIdx =>
        activeColIndices.map(colIdx => bullishMatrix[rowIdx][colIdx])
      )
      
      filteredBearishMatrix = activeRowIndices.map(rowIdx =>
        activeColIndices.map(colIdx => bearishMatrix[rowIdx][colIdx])
      )
      
      filteredNeutralMatrix = activeRowIndices.map(rowIdx =>
        activeColIndices.map(colIdx => neutralMatrix[rowIdx][colIdx])
      )

      const removedRows = currencies.filter((c, i) => !activeRowIndices.includes(i))
      const removedCols = currencies.filter((c, i) => !activeColIndices.includes(i))
      
      console.log('🔍 Matrix Filtering Summary:', {
        originalCount: currencies.length,
        rowsKept: rowCurrencies.length,
        colsKept: colCurrencies.length,
        rowsRemoved: removedRows,
        colsRemoved: removedCols
      })

      // If no active rows or columns, return empty
      if (rowCurrencies.length === 0 || colCurrencies.length === 0) {
        return {
          rowCurrencies: [],
          colCurrencies: [],
          bullishMatrix: [],
          bearishMatrix: [],
          neutralMatrix: [],
          pairData
        }
      }
    } else {
      // No filtering - show all currencies
      console.log('🔍 No filtering applied - showing all currencies')
      rowCurrencies = currencies
      colCurrencies = currencies
      filteredBullishMatrix = bullishMatrix
      filteredBearishMatrix = bearishMatrix
      filteredNeutralMatrix = neutralMatrix
    }

    return {
      rowCurrencies,
      colCurrencies,
      bullishMatrix: filteredBullishMatrix,
      bearishMatrix: filteredBearishMatrix,
      neutralMatrix: filteredNeutralMatrix,
      pairData
    }
  }, [watchlist, filterEmpty])

  // Get color intensity based on signal count
  const getHeatmapColor = (count, type) => {
    if (count === null) return '#f3f4f6' // Gray for diagonal
    if (count === 0) return '#ffffff' // White for no signals

    const maxIntensity = 10 // Assume max 10 signals for color scale
    const intensity = Math.min(count / maxIntensity, 1)

    if (type === 'bullish') {
      // Green scale - from light green to dark green
      return `rgb(${Math.round(16 + (234 * (1 - intensity)))}, ${Math.round(185 + (70 * (1 - intensity)))}, ${Math.round(129 + (115 * (1 - intensity)))})`
    } else if (type === 'bearish') {
      // Red scale - more vibrant reds from #fee to #dc2626
      return `rgb(${Math.round(254 - (intensity * 34))}, ${Math.round(226 - (intensity * 188))}, ${Math.round(226 - (intensity * 188))})`
    } else {
      // Gray scale for neutral
      const grayValue = Math.round(156 - (intensity * 80))
      return `rgb(${grayValue}, ${grayValue + 10}, ${grayValue + 20})`
    }
  }

  if (!matrixData) {
    return (
      <div className="currency-matrix-container">
        <div className="matrix-empty">
          No currency pairs in watchlist. Add some forex pairs to see the matrix!
        </div>
      </div>
    )
  }

  const { rowCurrencies, colCurrencies, bullishMatrix, bearishMatrix, neutralMatrix } = matrixData

  const renderMatrix = (matrix, type, title, emoji) => (
    <div className="matrix-panel">
      <h3 className="matrix-title">
        {emoji} {title}
      </h3>
      <div className="matrix-table-wrapper">
        <table className="currency-matrix-table">
          <thead>
            <tr>
              <th className="matrix-corner">Quote →<br/>Base ↓</th>
              {colCurrencies.map(currency => (
                <th key={currency} className="matrix-header-cell">
                  {currency}
                </th>
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
                  const pairSymbol = `${baseCurrency}/${quoteCurrency}`
                  
                  return (
                    <td
                      key={colIndex}
                      className={`matrix-cell ${isNull ? 'diagonal' : ''}`}
                      style={{
                        backgroundColor: getHeatmapColor(value, type),
                        fontWeight: value > 0 ? 'bold' : 'normal',
                        cursor: isNull ? 'default' : 'pointer'
                      }}
                      onClick={() => !isNull && onPairClick && onPairClick(`C:${baseCurrency}${quoteCurrency}`, type)}
                      title={isNull ? `${baseCurrency} (same currency)` : `${pairSymbol}: ${value} ${title.toLowerCase()} signal${value !== 1 ? 's' : ''}`}
                    >
                      {isNull ? '—' : value}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* <div className="matrix-legend">
        <span className="legend-item">Darker color = More signals</span>
        <span className="legend-item">White = No signals</span>
        <span className="legend-item">Gray diagonal = Same currency</span>
      </div> */}
    </div>
  )

  return (
    <div className="currency-matrix-container">
      <div className="matrix-header">
        <h2>📊 Currency Signal Matrix</h2>
        <p className="matrix-description">
          Heatmap showing signal counts for each currency pair. Darker colors indicate more signals.
        </p>
        <div className="matrix-filter-toggle">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={filterEmpty}
              onChange={(e) => setFilterEmpty(e.target.checked)}
              className="toggle-checkbox"
            />
            <span className="toggle-text">Hide empty rows/columns</span>
          </label>
        </div>
      </div>

      <div className="matrices-grid">
        {renderMatrix(bullishMatrix, 'bullish', 'Bullish Signals', '🟢')}
        {renderMatrix(bearishMatrix, 'bearish', 'Bearish Signals', '🔴')}
        {renderMatrix(neutralMatrix, 'neutral', 'Neutral Signals', '⚪')}
      </div>

      {/* <div className="matrix-insights">
        <h4>💡 How to Read This Matrix</h4>
        <ul>
          <li><strong>Rows (Base Currency):</strong> The currency you're buying</li>
          <li><strong>Columns (Quote Currency):</strong> The currency you're selling</li>
          <li><strong>Cell Value:</strong> Number of indicators signaling for that pair</li>
          <li><strong>Example:</strong> EUR row + USD column = EUR/USD pair signals</li>
          <li><strong>Diagonal:</strong> Same currency (e.g., EUR/EUR) - not a valid pair</li>
        </ul>
      </div> */}
    </div>
  )
}

export default CurrencyMatrix
