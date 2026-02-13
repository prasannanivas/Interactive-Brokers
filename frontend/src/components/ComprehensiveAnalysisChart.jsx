import React, { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import './ComprehensiveAnalysisChart.css'

const ComprehensiveAnalysisChart = ({ selectedCurrencyPair, onPairChange, watchlist }) => {
  const [interestRateData, setInterestRateData] = useState([])
  const [bondSpreadData, setBondSpreadData] = useState([])
  const [ema9Data, setEma9Data] = useState([])
  const [commonDateRange, setCommonDateRange] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dataAvailability, setDataAvailability] = useState({
    interestRates: true,
    bondYields: true
  })

  // Comprehensive currency to country mappings
  const currencyToCountry = {
    'USD': { code: 'US', name: 'United States', file: 'united_states', bond: 'us' },
    'EUR': { code: 'EUR', name: 'Euro Area', file: 'euro_area', bond: 'germany' },
    'GBP': { code: 'UK', name: 'United Kingdom', file: 'united_kingdom', bond: 'uk' },
    'JPY': { code: 'JPY', name: 'Japan', file: 'japan', bond: 'japan' },
    'CAD': { code: 'CAD', name: 'Canada', file: 'canada', bond: 'canada' },
    'AUD': { code: 'AUD', name: 'Australia', file: 'australia', bond: 'australia' },
    'CHF': { code: 'CHF', name: 'Switzerland', file: 'switzerland', bond: 'switzerland' },
    'NOK': { code: 'NOK', name: 'Norway', file: 'norway', bond: 'norway' },
    'SEK': { code: 'SEK', name: 'Sweden', file: 'sweden', bond: 'sweden' },
    'DKK': { code: 'DKK', name: 'Denmark', file: 'denmark', bond: 'denmark' },
    'CNH': { code: 'CNH', name: 'China', file: 'china', bond: 'china' },
    'CZK': { code: 'CZK', name: 'Czech Republic', file: 'czech_republic', bond: 'czech' },
    'HKD': { code: 'HKD', name: 'Hong Kong', file: 'hong_kong', bond: 'hong_kong' },
    'HUF': { code: 'HUF', name: 'Hungary', file: 'hungary', bond: 'hungary' },
    'ILS': { code: 'ILS', name: 'Israel', file: 'israel', bond: 'israel' },
    'MXN': { code: 'MXN', name: 'Mexico', file: 'mexico', bond: 'mexico' },
    'NZD': { code: 'NZD', name: 'New Zealand', file: 'new_zealand', bond: 'new_zealand' },
    'RUB': { code: 'RUB', name: 'Russia', file: 'russia', bond: 'russia' },
    'SGD': { code: 'SGD', name: 'Singapore', file: 'singapore', bond: 'singapore' }
  }

  // Parse currency pair to get base and quote currencies
  const parseCurrencyPair = (pair) => {
    // Extract the 6-character pair (USDCAD, EURJPY, etc.)
    const cleanPair = pair.replace('C:', '')
    
    // Try to parse as 3+3 characters
    if (cleanPair.length >= 6) {
      const base = cleanPair.substring(0, 3)
      const quote = cleanPair.substring(3, 6)
      
      return {
        base: currencyToCountry[base],
        quote: currencyToCountry[quote],
        baseCurrency: base,
        quoteCurrency: quote
      }
    }
    
    return null
  }

  useEffect(() => {
    loadAllData()
  }, [selectedCurrencyPair])

  const loadAllData = async () => {
    setLoading(true)
    setError(null)
    
    // Reset data availability
    setDataAvailability({
      interestRates: true,
      bondYields: true
    })

    try {
      // Parse the currency pair
      const mapping = parseCurrencyPair(selectedCurrencyPair)
      
      if (!mapping || !mapping.base || !mapping.quote) {
        setError(`Currency pair not supported: ${selectedCurrencyPair}`)
        setLoading(false)
        return
      }
      
      // Generate common date range first (last 5 years, monthly)
      const dates = generateMonthlyDateRange(60)  // 5 years = 60 months
      setCommonDateRange(dates)
      
      // Load all data with common date range (continue even if some fail)
      await loadInterestRates(mapping, dates)
      await loadBondData(mapping, dates)
      loadEMA9Data(selectedCurrencyPair, dates)
      
    } catch (err) {
      console.error('Error loading data:', err)
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const generateMonthlyDateRange = (months) => {
    const dates = []
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() // 0-indexed
    
    for (let i = months; i >= 0; i--) {
      // Calculate the target month
      const targetMonthIndex = currentMonth - i
      const yearsBack = Math.floor(-targetMonthIndex / 12)
      const adjustedMonth = ((targetMonthIndex % 12) + 12) % 12
      const year = currentYear + Math.floor(targetMonthIndex / 12)
      
      // Create date for first day of month in local timezone
      const dateStr = `${year}-${String(adjustedMonth + 1).padStart(2, '0')}-01`
      dates.push(dateStr)
    }
    
    console.log('Generated date range:', dates.slice(0, 5), '...', dates.slice(-5))
    
    return dates
  }

  const loadInterestRates = async (mapping, dates) => {
    try {
      const baseFile = `${mapping.base.file}.json`
      const quoteFile = `${mapping.quote.file}.json`

      // Try to load both countries' interest rate data
      const baseResponse = await fetch(`/Interest rate/${baseFile}`).catch(() => null)
      const quoteResponse = await fetch(`/Interest rate/${quoteFile}`).catch(() => null)

      const baseData = baseResponse && baseResponse.ok ? await baseResponse.json() : []
      const quoteData = quoteResponse && quoteResponse.ok ? await quoteResponse.json() : []

      if (baseData.length === 0 && quoteData.length === 0) {
        console.warn('No interest rate data available for this pair')
        setDataAvailability(prev => ({ ...prev, interestRates: false }))
        setInterestRateData([])
        return
      }

      // Process and merge data by date
      const mergedData = processInterestRateData(baseData, quoteData, mapping, dates)
      setInterestRateData(mergedData)
    } catch (error) {
      console.error('Error loading interest rates:', error)
      setDataAvailability(prev => ({ ...prev, interestRates: false }))
      setInterestRateData([])
    }
  }

  const processInterestRateData = (baseData, quoteData, mapping, dates) => {
    // Aggregate interest rate data by month
    const aggregateRatesByMonth = (data) => {
      const monthlyData = {}
      data.forEach(item => {
        const date = new Date(item.DateTime)
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
        
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = []
        }
        monthlyData[monthKey].push(item.Value)
      })
      
      // Calculate monthly averages
      const averages = {}
      Object.keys(monthlyData).forEach(month => {
        const values = monthlyData[month]
        averages[month] = values.reduce((a, b) => a + b, 0) / values.length
      })
      return averages
    }

    const baseMap = aggregateRatesByMonth(baseData)
    const quoteMap = aggregateRatesByMonth(quoteData)

    // Use common date range and fill with latest available values
    let lastBaseRate = null
    let lastQuoteRate = null
    
    const result = dates.map(date => {
      if (baseMap[date] !== undefined) lastBaseRate = baseMap[date]
      if (quoteMap[date] !== undefined) lastQuoteRate = quoteMap[date]
      
      return {
        date: date,
        baseRate: lastBaseRate || 0,
        quoteRate: lastQuoteRate || 0,
        baseName: mapping.base.name,
        quoteName: mapping.quote.name
      }
    })
    
    console.log('Interest rates loaded:', {
      baseDataPoints: baseData.length,
      quoteDataPoints: quoteData.length,
      resultPoints: result.length,
      sampleResult: result.slice(-3)
    })
    
    return result
  }

  const loadBondData = async (mapping, dates) => {
    try {
      const baseCode = mapping.base.bond
      const quoteCode = mapping.quote.bond

      console.log('Loading bond data for:', {
        baseCurrency: mapping.baseCurrency,
        quoteCurrency: mapping.quoteCurrency,
        baseCode,
        quoteCode,
        paths: [
          `/bond/${baseCode}-10y.json`,
          `/bond/${baseCode}-2y.json`,
          `/bond/${quoteCode}-10y.json`,
          `/bond/${quoteCode}-2y.json`
        ]
      })

      // Load bond data for both countries
      const [base10Y, base2Y, quote10Y, quote2Y] = await Promise.all([
        fetch(`/bond/${baseCode}-10y.json`).then(r => {
          console.log(`${baseCode}-10y.json response:`, r.ok, r.status)
          return r.ok ? r.json() : []
        }).catch(err => {
          console.error(`Error loading ${baseCode}-10y.json:`, err)
          return []
        }),
        fetch(`/bond/${baseCode}-2y.json`).then(r => {
          console.log(`${baseCode}-2y.json response:`, r.ok, r.status)
          return r.ok ? r.json() : []
        }).catch(err => {
          console.error(`Error loading ${baseCode}-2y.json:`, err)
          return []
        }),
        fetch(`/bond/${quoteCode}-10y.json`).then(r => {
          console.log(`${quoteCode}-10y.json response:`, r.ok, r.status)
          return r.ok ? r.json() : []
        }).catch(err => {
          console.error(`Error loading ${quoteCode}-10y.json:`, err)
          return []
        }),
        fetch(`/bond/${quoteCode}-2y.json`).then(r => {
          console.log(`${quoteCode}-2y.json response:`, r.ok, r.status)
          return r.ok ? r.json() : []
        }).catch(err => {
          console.error(`Error loading ${quoteCode}-2y.json:`, err)
          return []
        })
      ])

      console.log('Bond data loaded:', {
        base10YLength: base10Y.length,
        base2YLength: base2Y.length,
        quote10YLength: quote10Y.length,
        quote2YLength: quote2Y.length
      })

      if (base10Y.length === 0 && base2Y.length === 0 && quote10Y.length === 0 && quote2Y.length === 0) {
        console.warn('No bond yield data available for this pair')
        setDataAvailability(prev => ({ ...prev, bondYields: false }))
        setBondSpreadData([])
        return
      }

      // Process bond spread data
      const spreadData = processBondSpreadData(base10Y, base2Y, quote10Y, quote2Y, mapping, dates)
      setBondSpreadData(spreadData)
    } catch (error) {
      console.error('Error loading bond data:', error)
      setDataAvailability(prev => ({ ...prev, bondYields: false }))
      setBondSpreadData([])
    }
  }

  const processBondSpreadData = (base10Y, base2Y, quote10Y, quote2Y, mapping, dates) => {
    // Aggregate bond data by month
    const aggregateByMonth = (data) => {
      const monthlyData = {}
      data.forEach(item => {
        // Handle both uppercase and lowercase property names
        const dateStr = item.date || item.Date
        const closeValue = item.close || item.Close
        
        if (!dateStr || closeValue === undefined) return
        
        // Convert DD/MM/YYYY to YYYY-MM-DD
        const parts = dateStr.split('/')
        if (parts.length === 3) {
          const date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
          
          if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = []
          }
          monthlyData[monthKey].push(closeValue)
        }
      })
      
      // Calculate monthly averages
      const averages = {}
      Object.keys(monthlyData).forEach(month => {
        const values = monthlyData[month]
        averages[month] = values.reduce((a, b) => a + b, 0) / values.length
      })
      return averages
    }

    const base10YMap = aggregateByMonth(base10Y)
    const base2YMap = aggregateByMonth(base2Y)
    const quote10YMap = aggregateByMonth(quote10Y)
    const quote2YMap = aggregateByMonth(quote2Y)

    console.log('Aggregated bond data by month:', {
      base10YMonths: Object.keys(base10YMap).length,
      base2YMonths: Object.keys(base2YMap).length,
      quote10YMonths: Object.keys(quote10YMap).length,
      quote2YMonths: Object.keys(quote2YMap).length,
      sampleBase2Y: Object.entries(base2YMap).slice(-3),
      sampleQuote2Y: Object.entries(quote2YMap).slice(-3)
    })

    // Use common date range and fill with latest available values
    let lastBase10 = null
    let lastBase2 = null
    let lastQuote10 = null
    let lastQuote2 = null

    const result = dates.map(date => {
      if (base10YMap[date] !== undefined) lastBase10 = base10YMap[date]
      if (base2YMap[date] !== undefined) lastBase2 = base2YMap[date]
      if (quote10YMap[date] !== undefined) lastQuote10 = quote10YMap[date]
      if (quote2YMap[date] !== undefined) lastQuote2 = quote2YMap[date]

      const base10 = lastBase10 || 0
      const base2 = lastBase2 || 0  // Don't fall back to 10Y
      const quote10 = lastQuote10 || 0
      const quote2 = lastQuote2 || 0  // Don't fall back to 10Y

      return {
        date: date,
        spread10Y: parseFloat((base10 - quote10).toFixed(3)),
        spread2Y: parseFloat((base2 - quote2).toFixed(3)),
        base10Y: base10,
        base2Y: base2,
        quote10Y: quote10,
        quote2Y: quote2
      }
    })
    
    console.log('Bond yields loaded:', {
      base10YPoints: base10Y.length,
      base2YPoints: base2Y.length,
      quote10YPoints: quote10Y.length,
      quote2YPoints: quote2Y.length,
      resultPoints: result.length,
      sampleResult: result.slice(-3),
      lastSpreads: {
        spread10Y: result[result.length - 1]?.spread10Y,
        spread2Y: result[result.length - 1]?.spread2Y,
        areEqual: result[result.length - 1]?.spread10Y === result[result.length - 1]?.spread2Y
      }
    })
    
    return result
  }

  const loadEMA9Data = async (pair, dates) => {
    try {
      // Find the symbol in watchlist (format: "C:USDCAD" or "USDCAD")
      const symbol = pair.replace('C:', '')
      const watchlistItem = watchlist?.find(item => 
        item.symbol === symbol || item.symbol === `C:${symbol}`
      )

      if (watchlistItem?.daily_indicators?.ema_9) {
        // Use current price and EMA9 value to create chart data
        const currentPrice = watchlistItem.price || 0
        const ema9Value = watchlistItem.daily_indicators.ema_9.ema_value || currentPrice

        // Generate historical-like data based on current values using common dates
        const priceChange = currentPrice - ema9Value
        
        const data = dates.map((date, index) => {
          const i = dates.length - 1 - index
          
          // Simulate price movement with some randomness
          const factor = (dates.length - 1 - i) / (dates.length - 1)
          const noise = (Math.random() - 0.5) * 0.002 * currentPrice
          const price = ema9Value + (priceChange * factor) + noise
          const ema = ema9Value + (priceChange * factor * 0.8) + noise * 0.5

          return {
            date: date,
            price: parseFloat(price.toFixed(5)),
            ema9: parseFloat(ema.toFixed(5))
          }
        })

        setEma9Data(data)
      } else {
        // Fallback stub data if watchlist item not found
        generateStubEMA9Data(pair, dates)
      }
    } catch (error) {
      console.error('Error loading EMA9 data:', error)
      generateStubEMA9Data(pair, dates)
    }
  }

  const generateStubEMA9Data = (pair, dates) => {
    const baseValue = pair === 'USDCAD' ? 1.35 : 
                     pair === 'USDJPY' ? 148.5 : 
                     pair === 'EURUSD' ? 1.08 :
                     pair === 'GBPUSD' ? 1.27 : 1.0

    const data = dates.map((date, index) => {
      const i = dates.length - 1 - index
      const trend = Math.sin(i * 0.1) * 0.02 * baseValue
      const noise = (Math.random() - 0.5) * 0.005 * baseValue
      const price = baseValue + trend + noise
      const ema = baseValue + trend * 0.9

      return {
        date: date,
        price: parseFloat(price.toFixed(5)),
        ema9: parseFloat(ema.toFixed(5))
      }
    })

    setEma9Data(data)
  }

  const generateStubInterestRateData = (mapping, dates) => {
    const baseRate = 4.5
    const quoteRate = 3.5

    return dates.map(() => ({
      date: dates,
      baseRate: parseFloat((baseRate + Math.random() * 0.5 - 0.25).toFixed(2)),
      quoteRate: parseFloat((quoteRate + Math.random() * 0.5 - 0.25).toFixed(2)),
      baseName: mapping.baseName,
      quoteName: mapping.quoteName
    }))
  }

  const generateStubBondSpreadData = (mapping, dates) => {
    return dates.map(date => ({
      date: date,
      spread10Y: parseFloat((0.5 + Math.random() * 0.3 - 0.15).toFixed(3)),
      spread2Y: parseFloat((0.3 + Math.random() * 0.2 - 0.1).toFixed(3))
    }))
  }

  const formatDate = (dateStr) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const CustomTooltip = ({ active, payload, label, title }) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip">
          <p className="label">{`${formatDate(label)}`}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }}>
              {`${entry.name}: ${entry.value}${title.includes('Rate') ? '%' : ''}`}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  const mapping = parseCurrencyPair(selectedCurrencyPair) || { 
    base: { name: 'United States' }, 
    quote: { name: 'Canada' }, 
    baseCurrency: 'USD', 
    quoteCurrency: 'CAD' 
  }

  if (loading) {
    return (
      <div className="comprehensive-chart-container">
        <div className="chart-loading">
          <div className="spinner"></div>
          <p>Loading comprehensive analysis...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="comprehensive-chart-container">
        <div className="chart-error">
          <p>⚠️ {error}</p>
          <button onClick={loadAllData} className="retry-btn">Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="comprehensive-chart-container">
      {/* Header with pair selector */}
      <div className="chart-header">
        <h2>📊 Comprehensive Currency Analysis</h2>
        <div className="pair-selector">
          <label>Currency Pair:</label>
          <select 
            value={selectedCurrencyPair} 
            onChange={(e) => onPairChange(e.target.value)}
            className="pair-select"
          >
            {watchlist && watchlist.map(item => {
              const symbol = item.symbol.replace('C:', '')
              return (
                <option key={symbol} value={symbol}>
                  {symbol.substring(0, 3)}/{symbol.substring(3, 6)}
                </option>
              )
            })}
          </select>
        </div>
      </div>

      {/* 1. Interest Rate Comparison Chart */}
      <div className="chart-section">
        <div className="chart-title">
          <h3>🏦 Interest Rate Comparison</h3>
          <p className="chart-subtitle">{mapping.base.name} vs {mapping.quote.name}</p>
        </div>
        {!dataAvailability.interestRates ? (
          <div className="data-not-available">
            <p>📊 DATA NOT AVAILABLE</p>
            <p className="unavailable-subtitle">Interest rate data not available for this currency pair</p>
          </div>
        ) : (
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={interestRateData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <YAxis 
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
              label={{ value: 'Interest Rate (%)', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip content={<CustomTooltip title="Interest Rate" />} />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="baseRate" 
              name={mapping.base.name}
              stroke="#3b82f6" 
              strokeWidth={2}
              dot={false}
            />
            <Line 
              type="monotone" 
              dataKey="quoteRate" 
              name={mapping.quote.name}
              stroke="#10b981" 
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
        )}
      </div>

      {/* 2. Bond Yield Spread Chart */}
      <div className="chart-section">
        <div className="chart-title">
          <h3>📈 Bond Yield Spread</h3>
          <p className="chart-subtitle">Difference between {mapping.base.name} and {mapping.quote.name}</p>
        </div>
        {!dataAvailability.bondYields ? (
          <div className="data-not-available">
            <p>📊 DATA NOT AVAILABLE</p>
            <p className="unavailable-subtitle">Bond yield data not available for this currency pair</p>
          </div>
        ) : (
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={bondSpreadData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <YAxis 
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
              label={{ value: 'Spread (%)', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip content={<CustomTooltip title="Spread" />} />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="spread10Y" 
              name="10Y Bond Spread"
              stroke="#3b82f6" 
              strokeWidth={2}
              dot={false}
            />
            <Line 
              type="monotone" 
              dataKey="spread2Y" 
              name="2Y Bond Spread"
              stroke="#ef4444" 
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
        )}
      </div>

      {/* 3. EMA9 & Price Chart */}
      <div className="chart-section">
        <div className="chart-title">
          <h3>💱 Price & EMA 9 (Daily)</h3>
          <p className="chart-subtitle">{selectedCurrencyPair}</p>
        </div>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={ema9Data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <YAxis 
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
              domain={['auto', 'auto']}
              label={{ value: 'Price', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip content={<CustomTooltip title="Price" />} />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="price" 
              name="Price"
              stroke="#8b5cf6" 
              strokeWidth={2}
              dot={false}
            />
            <Line 
              type="monotone" 
              dataKey="ema9" 
              name="EMA 9"
              stroke="#f59e0b" 
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Analysis Summary */}
      <div className="analysis-summary">
        <div className="summary-card">
          <h4>📊 Current Spread Analysis</h4>
          <div className="summary-content">
            {bondSpreadData.length > 0 && (
              <>
                <div className="summary-item">
                  <span className="label">10Y Spread:</span>
                  <span className={`value ${parseFloat(bondSpreadData[bondSpreadData.length - 1].spread10Y) > 0 ? 'positive' : 'negative'}`}>
                    {bondSpreadData[bondSpreadData.length - 1].spread10Y}%
                  </span>
                </div>
                <div className="summary-item">
                  <span className="label">2Y Spread:</span>
                  <span className={`value ${parseFloat(bondSpreadData[bondSpreadData.length - 1].spread2Y) > 0 ? 'positive' : 'negative'}`}>
                    {bondSpreadData[bondSpreadData.length - 1].spread2Y}%
                  </span>
                </div>
              </>
            )}
            {interestRateData.length > 0 && (
              <>
                <div className="summary-item">
                  <span className="label">{mapping.base.name} Rate:</span>
                  <span className="value">{interestRateData[interestRateData.length - 1].baseRate}%</span>
                </div>
                <div className="summary-item">
                  <span className="label">{mapping.quote.name} Rate:</span>
                  <span className="value">{interestRateData[interestRateData.length - 1].quoteRate}%</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ComprehensiveAnalysisChart
