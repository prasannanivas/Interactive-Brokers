import React, { useMemo } from 'react'
import './CurrencyMatrix.css'

const CurrencyMatrix = ({ watchlist, onPairClick }) => {
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

    // Define major currencies only
    const majorCurrencies = ['USD', 'AUD', 'CAD', 'CHF', 'EUR', 'GBP', 'JPY']
    const minorCurrencies = ['CZK', 'DKK', 'HUF', 'ILS', 'KRW', 'MXN', 'NOK', 'NZD', 'PLN', 'SAR', 'SEK', 'SGD', 'TRY', 'ZAR']

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
      
      // Only include if both currencies are major currencies
      if (base && quote && majorCurrencies.includes(base) && majorCurrencies.includes(quote)) {
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

    return {
      currencies,
      bullishMatrix,
      bearishMatrix,
      neutralMatrix,
      pairData
    }
  }, [watchlist])

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

  const { currencies, bullishMatrix, bearishMatrix, neutralMatrix } = matrixData

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
              {currencies.map(currency => (
                <th key={currency} className="matrix-header-cell">
                  {currency}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {currencies.map((baseCurrency, rowIndex) => (
              <tr key={baseCurrency}>
                <th className="matrix-row-header">{baseCurrency}</th>
                {currencies.map((quoteCurrency, colIndex) => {
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
                      onClick={() => !isNull && onPairClick && onPairClick(`C:${baseCurrency}${quoteCurrency}`)}
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
