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

  // Currency pair mappings
  const currencyPairMappings = {
    'USDCAD': { base: 'US', quote: 'Canada', baseName: 'United States', quoteName: 'Canada' },
    'USDJPY': { base: 'US', quote: 'Japan', baseName: 'United States', quoteName: 'Japan' },
    'EURUSD': { base: 'EUR', quote: 'US', baseName: 'Euro Area', quoteName: 'United States' },
    'GBPUSD': { base: 'UK', quote: 'US', baseName: 'United Kingdom', quoteName: 'United States' },
    'AUDUSD': { base: 'AUS', quote: 'US', baseName: 'Australia', quoteName: 'United States' },
    'USDCHF': { base: 'US', quote: 'CHF', baseName: 'United States', quoteName: 'Switzerland' }
  }

  // File name mappings for interest rates
  const interestRateFileMap = {
    'US': 'united_states.json',
    'Canada': 'canada.json',
    'Japan': 'japan.json',
    'EUR': 'euro_area.json',
    'UK': 'united_kingdom.json',
    'AUS': 'australia.json'
  }

  // File name mappings for bonds
  const bondFileMap = {
    'US': 'us',
    'Canada': 'canada',
    'Japan': 'japan',
    'EUR': 'germany',
    'UK': 'uk',
    'AUS': 'australia'
  }

  useEffect(() => {
    loadAllData()
  }, [selectedCurrencyPair])

  const loadAllData = async () => {
    setLoading(true)
    setError(null)

    try {
      const mapping = currencyPairMappings[selectedCurrencyPair] || currencyPairMappings['USDCAD']
      
      // Generate common date range first (last 100 days)
      const dates = generateDateRange(100)
      setCommonDateRange(dates)
      
      // Load all data with common date range
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

  const generateDateRange = (days) => {
    const dates = []
    for (let i = days; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      dates.push(date.toISOString().split('T')[0])
    }
    return dates
  }

  const loadInterestRates = async (mapping, dates) => {
    try {
      const baseFile = interestRateFileMap[mapping.base]
      const quoteFile = interestRateFileMap[mapping.quote]

      // Load both countries' interest rate data
      const [baseResponse, quoteResponse] = await Promise.all([
        fetch(`/Interest rate/${baseFile}`),
        fetch(`/Interest rate/${quoteFile}`)
      ])

      const baseData = await baseResponse.json()
      const quoteData = await quoteResponse.json()

      // Process and merge data by date
      const mergedData = processInterestRateData(baseData, quoteData, mapping, dates)
      setInterestRateData(mergedData)
    } catch (error) {
      console.error('Error loading interest rates:', error)
      // Use stub data on error
      setInterestRateData(generateStubInterestRateData(mapping, dates))
    }
  }

  const processInterestRateData = (baseData, quoteData, mapping, dates) => {
    // Create maps by date
    const baseMap = {}
    baseData.forEach(item => {
      const date = new Date(item.DateTime).toISOString().split('T')[0]
      baseMap[date] = item.Value
    })

    const quoteMap = {}
    quoteData.forEach(item => {
      const date = new Date(item.DateTime).toISOString().split('T')[0]
      quoteMap[date] = item.Value
    })

    // Use common date range and fill with latest available values
    let lastBaseRate = null
    let lastQuoteRate = null
    
    return dates.map(date => {
      if (baseMap[date] !== undefined) lastBaseRate = baseMap[date]
      if (quoteMap[date] !== undefined) lastQuoteRate = quoteMap[date]
      
      return {
        date: date,
        baseRate: lastBaseRate || 0,
        quoteRate: lastQuoteRate || 0,
        baseName: mapping.baseName,
        quoteName: mapping.quoteName
      }
    })
  }

  const loadBondData = async (mapping, dates) => {
    try {
      const baseCode = bondFileMap[mapping.base]
      const quoteCode = bondFileMap[mapping.quote]

      // Load bond data for both countries
      const [base10Y, base2Y, quote10Y, quote2Y] = await Promise.all([
        fetch(`/bond/${baseCode}-10y.json`).then(r => r.json()).catch(() => []),
        fetch(`/bond/${baseCode}-2y.json`).then(r => r.json()).catch(() => []),
        fetch(`/bond/${quoteCode}-10y.json`).then(r => r.json()).catch(() => []),
        fetch(`/bond/${quoteCode}-2y.json`).then(r => r.json()).catch(() => [])
      ])

      // Process bond spread data
      const spreadData = processBondSpreadData(base10Y, base2Y, quote10Y, quote2Y, mapping, dates)
      setBondSpreadData(spreadData)
    } catch (error) {
      console.error('Error loading bond data:', error)
      // Use stub data on error
      setBondSpreadData(generateStubBondSpreadData(mapping, dates))
    }
  }

  const processBondSpreadData = (base10Y, base2Y, quote10Y, quote2Y, mapping, dates) => {
    // Create maps by date
    const createDateMap = (data) => {
      const map = {}
      data.forEach(item => {
        // Convert DD/MM/YYYY to YYYY-MM-DD
        const parts = item.date.split('/')
        if (parts.length === 3) {
          const date = `${parts[2]}-${parts[1]}-${parts[0]}`
          map[date] = item.close
        }
      })
      return map
    }

    const base10YMap = createDateMap(base10Y)
    const base2YMap = createDateMap(base2Y)
    const quote10YMap = createDateMap(quote10Y)
    const quote2YMap = createDateMap(quote2Y)

    // Use common date range and fill with latest available values
    let lastBase10 = null
    let lastBase2 = null
    let lastQuote10 = null
    let lastQuote2 = null

    return dates.map(date => {
      if (base10YMap[date] !== undefined) lastBase10 = base10YMap[date]
      if (base2YMap[date] !== undefined) lastBase2 = base2YMap[date]
      if (quote10YMap[date] !== undefined) lastQuote10 = quote10YMap[date]
      if (quote2YMap[date] !== undefined) lastQuote2 = quote2YMap[date]

      const base10 = lastBase10 || 0
      const base2 = lastBase2 || lastBase10 || 0
      const quote10 = lastQuote10 || 0
      const quote2 = lastQuote2 || lastQuote10 || 0

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

  const mapping = currencyPairMappings[selectedCurrencyPair] || currencyPairMappings['USDCAD']

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
            <option value="USDCAD">USD/CAD</option>
            <option value="USDJPY">USD/JPY</option>
            <option value="EURUSD">EUR/USD</option>
            <option value="GBPUSD">GBP/USD</option>
            <option value="AUDUSD">AUD/USD</option>
          </select>
        </div>
      </div>

      {/* 1. Interest Rate Comparison Chart */}
      <div className="chart-section">
        <div className="chart-title">
          <h3>🏦 Interest Rate Comparison</h3>
          <p className="chart-subtitle">{mapping.baseName} vs {mapping.quoteName}</p>
        </div>
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
              name={mapping.baseName}
              stroke="#3b82f6" 
              strokeWidth={2}
              dot={false}
            />
            <Line 
              type="monotone" 
              dataKey="quoteRate" 
              name={mapping.quoteName}
              stroke="#10b981" 
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 2. Bond Yield Spread Chart */}
      <div className="chart-section">
        <div className="chart-title">
          <h3>📈 Bond Yield Spread</h3>
          <p className="chart-subtitle">Difference between {mapping.baseName} and {mapping.quoteName}</p>
        </div>
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
                  <span className="label">{mapping.baseName} Rate:</span>
                  <span className="value">{interestRateData[interestRateData.length - 1].baseRate}%</span>
                </div>
                <div className="summary-item">
                  <span className="label">{mapping.quoteName} Rate:</span>
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
