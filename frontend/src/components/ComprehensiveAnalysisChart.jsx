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
import TimeframeSelector from './TimeframeSelector'
import './ComprehensiveAnalysisChart.css'

const ComprehensiveAnalysisChart = ({ selectedCurrencyPair, onPairChange, watchlist }) => {
  const [interestRateData, setInterestRateData] = useState([])
  const [bondSpreadData, setBondSpreadData] = useState([])
  const [ema9Data, setEma9Data] = useState([])
  const [commonDateRange, setCommonDateRange] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [timeframe, setTimeframe] = useState(1095)
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
  }, [selectedCurrencyPair, timeframe])

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
      
      // Load all data with timeframe filtering (continue even if some fail)
      await loadInterestRates(mapping)
      await loadBondData(mapping)
      await loadEMA9Data(selectedCurrencyPair)
      
      // After all data is loaded, synchronize the date ranges
      synchronizeDataRanges()
      
    } catch (err) {
      console.error('Error loading data:', err)
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const synchronizeDataRanges = () => {
    // Get all dates from each dataset
    const interestDates = new Set(interestRateData.map(d => d.date))
    const bondDates = new Set(bondSpreadData.map(d => d.date))
    const ema9Dates = new Set(ema9Data.map(d => d.date))
    
    // Find common date range (dates that exist in at least one dataset)
    const allDates = new Set([...interestDates, ...bondDates, ...ema9Dates])
    const sortedDates = Array.from(allDates).sort()
    
    if (sortedDates.length === 0) return
    
    // Find the overlapping date range
    const startDate = sortedDates[0]
    const endDate = sortedDates[sortedDates.length - 1]
    
    console.log('Synchronizing date ranges:', {
      startDate,
      endDate,
      totalDays: sortedDates.length,
      interestRateDays: interestDates.size,
      bondDays: bondDates.size,
      ema9Days: ema9Dates.size
    })
    
    // Align all datasets to use the common date range with forward fill
    alignDataToDateRange(sortedDates)
    
    // Store the common date range
    setCommonDateRange(sortedDates)
  }

  const alignDataToDateRange = (dateRange) => {
    // Create maps for quick lookup
    const interestMap = new Map(interestRateData.map(d => [d.date, d]))
    const bondMap = new Map(bondSpreadData.map(d => [d.date, d]))
    const ema9Map = new Map(ema9Data.map(d => [d.date, d]))
    
    // Forward fill missing dates for interest rate data
    let lastInterestData = null
    const alignedInterestData = dateRange.map(date => {
      if (interestMap.has(date)) {
        lastInterestData = interestMap.get(date)
        return lastInterestData
      } else if (lastInterestData) {
        return { ...lastInterestData, date }
      }
      return null
    }).filter(d => d !== null)
    
    // Forward fill missing dates for bond data
    let lastBondData = null
    const alignedBondData = dateRange.map(date => {
      if (bondMap.has(date)) {
        lastBondData = bondMap.get(date)
        return lastBondData
      } else if (lastBondData) {
        return { ...lastBondData, date }
      }
      return null
    }).filter(d => d !== null)
    
    // Forward fill missing dates for EMA9 data
    let lastEma9Data = null
    const alignedEma9Data = dateRange.map(date => {
      if (ema9Map.has(date)) {
        lastEma9Data = ema9Map.get(date)
        return lastEma9Data
      } else if (lastEma9Data) {
        return { ...lastEma9Data, date }
      }
      return null
    }).filter(d => d !== null)
    
    // Update state with aligned data
    if (alignedInterestData.length > 0) {
      setInterestRateData(alignedInterestData)
    }
    if (alignedBondData.length > 0) {
      setBondSpreadData(alignedBondData)
    }
    if (alignedEma9Data.length > 0) {
      setEma9Data(alignedEma9Data)
    }
    
    console.log('Data aligned to common date range:', {
      dateRange: dateRange.length,
      interestRateAligned: alignedInterestData.length,
      bondDataAligned: alignedBondData.length,
      ema9DataAligned: alignedEma9Data.length
    })
  }

  const filterDataByTimeframe = (data, dateField = 'date') => {
    if (!data || data.length === 0) return data
    
    const now = new Date()
    const cutoffDate = new Date(now.getTime() - (timeframe * 24 * 60 * 60 * 1000))
    
    return data.filter(item => {
      const itemDate = new Date(item[dateField])
      return itemDate >= cutoffDate
    }).sort((a, b) => new Date(a[dateField]) - new Date(b[dateField]))
  }

  const loadInterestRates = async (mapping) => {
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

      // Process and merge data by date (daily, not monthly)
      const mergedData = processInterestRateData(baseData, quoteData, mapping)
      const filtered = filterDataByTimeframe(mergedData, 'date')
      setInterestRateData(filtered)
    } catch (error) {
      console.error('Error loading interest rates:', error)
      setDataAvailability(prev => ({ ...prev, interestRates: false }))
      setInterestRateData([])
    }
  }

  const processInterestRateData = (baseData, quoteData, mapping) => {
    // Create a map of dates to rates for both countries (daily data)
    const baseMap = {}
    baseData.forEach(item => {
      const date = new Date(item.DateTime)
      const dateKey = date.toISOString().split('T')[0]
      baseMap[dateKey] = item.Value
    })

    const quoteMap = {}
    quoteData.forEach(item => {
      const date = new Date(item.DateTime)
      const dateKey = date.toISOString().split('T')[0]
      quoteMap[dateKey] = item.Value
    })

    // Get all unique dates from both datasets
    const allDates = new Set([...Object.keys(baseMap), ...Object.keys(quoteMap)])
    const sortedDates = Array.from(allDates).sort()

    // Fill forward missing values
    let lastBaseRate = null
    let lastQuoteRate = null
    
    const result = sortedDates.map(date => {
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
    
    console.log('Interest rates loaded (daily):', {
      baseDataPoints: baseData.length,
      quoteDataPoints: quoteData.length,
      uniqueDates: sortedDates.length,
      resultPoints: result.length,
      sampleResult: result.slice(-3)
    })
    
    return result
  }

  const loadBondData = async (mapping) => {
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

      // Process bond spread data (daily, not monthly)
      const spreadData = processBondSpreadData(base10Y, base2Y, quote10Y, quote2Y, mapping)
      const filtered = filterDataByTimeframe(spreadData, 'date')
      setBondSpreadData(filtered)
    } catch (error) {
      console.error('Error loading bond data:', error)
      setDataAvailability(prev => ({ ...prev, bondYields: false }))
      setBondSpreadData([])
    }
  }

  const processBondSpreadData = (base10Y, base2Y, quote10Y, quote2Y, mapping) => {
    // Convert bond data to date-keyed maps (daily data)
    const convertToMap = (data) => {
      const map = {}
      data.forEach(item => {
        const dateStr = item.date || item.Date
        const closeValue = item.close || item.Close
        
        if (!dateStr || closeValue === undefined) return
        
        // Convert DD/MM/YYYY to YYYY-MM-DD
        const parts = dateStr.split('/')
        if (parts.length === 3) {
          const dateKey = `${parts[2]}-${parts[1]}-${parts[0]}`
          map[dateKey] = closeValue
        }
      })
      return map
    }

    const base10YMap = convertToMap(base10Y)
    const base2YMap = convertToMap(base2Y)
    const quote10YMap = convertToMap(quote10Y)
    const quote2YMap = convertToMap(quote2Y)

    console.log('Bond data loaded (daily):', {
      base10YDays: Object.keys(base10YMap).length,
      base2YDays: Object.keys(base2YMap).length,
      quote10YDays: Object.keys(quote10YMap).length,
      quote2YDays: Object.keys(quote2YMap).length
    })

    // Get all unique dates from all datasets
    const allDates = new Set([
      ...Object.keys(base10YMap),
      ...Object.keys(base2YMap),
      ...Object.keys(quote10YMap),
      ...Object.keys(quote2YMap)
    ])
    const sortedDates = Array.from(allDates).sort()

    // Fill forward missing values
    let lastBase10 = null
    let lastBase2 = null
    let lastQuote10 = null
    let lastQuote2 = null

    const result = sortedDates.map(date => {
      if (base10YMap[date] !== undefined) lastBase10 = base10YMap[date]
      if (base2YMap[date] !== undefined) lastBase2 = base2YMap[date]
      if (quote10YMap[date] !== undefined) lastQuote10 = quote10YMap[date]
      if (quote2YMap[date] !== undefined) lastQuote2 = quote2YMap[date]

      const base10 = lastBase10 || 0
      const base2 = lastBase2 || 0
      const quote10 = lastQuote10 || 0
      const quote2 = lastQuote2 || 0

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
    
    console.log('Bond yields processed (daily):', {
      uniqueDates: sortedDates.length,
      resultPoints: result.length,
      sampleResult: result.slice(-3)
    })
    
    return result
  }

  const loadEMA9Data = async (pair) => {
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

        // Generate historical-like data for the timeframe (daily)
        const data = []
        const now = new Date()
        const priceChange = currentPrice - ema9Value
        
        for (let i = timeframe; i >= 0; i--) {
          const date = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000))
          const dateKey = date.toISOString().split('T')[0]
          
          // Simulate price movement with some randomness
          const factor = (timeframe - i) / timeframe
          const noise = (Math.random() - 0.5) * 0.002 * currentPrice
          const price = ema9Value + (priceChange * factor) + noise
          const ema = ema9Value + (priceChange * factor * 0.8) + noise * 0.5

          data.push({
            date: dateKey,
            price: parseFloat(price.toFixed(5)),
            ema9: parseFloat(ema.toFixed(5))
          })
        }

        setEma9Data(data)
      } else {
        // Fallback stub data if watchlist item not found
        generateStubEMA9Data(pair)
      }
    } catch (error) {
      console.error('Error loading EMA9 data:', error)
      generateStubEMA9Data(pair)
    }
  }

  const generateStubEMA9Data = (pair) => {
    const now = new Date()
    const dates = []
    for (let i = timeframe; i >= 0; i--) {
      const date = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000))
      dates.push(date.toISOString().split('T')[0])
    }
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

  // Calculate optimal tick interval based on data length
  const getTickInterval = (dataLength) => {
    if (dataLength === 0) return 0
    
    // For daily data, show ~10-15 ticks across the chart
    if (timeframe <= 365) { // 1Y or less
      return Math.max(1, Math.floor(dataLength / 12))
    } else if (timeframe <= 1095) { // 3Y
      return Math.max(1, Math.floor(dataLength / 10))
    } else { // 5Y
      return Math.max(1, Math.floor(dataLength / 8))
    }
  }

  const formatDate = (dateStr) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }
  
  const formatFullDate = (dateStr) => {
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' })
    } catch {
      return dateStr
    }
  }

  const CustomTooltip = ({ active, payload, label, title }) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip">
          <p className="label">{`${formatFullDate(label)}`}</p>
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

      {/* Timeframe Selector */}
      <TimeframeSelector
        selectedTimeframe={timeframe}
        onTimeframeChange={setTimeframe}
      />

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
              interval={getTickInterval(interestRateData.length)}
              domain={['dataMin', 'dataMax']}
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
              interval={getTickInterval(bondSpreadData.length)}
              domain={['dataMin', 'dataMax']}
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
              interval={getTickInterval(ema9Data.length)}
              domain={['dataMin', 'dataMax']}
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
