import React, { useMemo, useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  ReferenceLine,
  Scatter,
  ScatterChart,
  ReferenceArea,
  ReferenceDot
} from 'recharts'
import { historyAPI } from '../api/api'
import './CurrencyRateCorrelationChart.css'

const CurrencyRateCorrelationChart = ({ interestRateData }) => {
  const [selectedPair, setSelectedPair] = useState('USDCAD')
  const [priceHistory, setPriceHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [timeframe, setTimeframe] = useState(90) // days

  // Available currency pairs with their corresponding countries
  const currencyPairs = {
    'USDCAD': { base: 'United States', quote: 'Canada', symbol: 'C:USDCAD' },
    'EURUSD': { base: 'Germany', quote: 'United States', symbol: 'C:EURUSD' },
    'GBPUSD': { base: 'United Kingdom', quote: 'United States', symbol: 'C:GBPUSD' },
    'AUDUSD': { base: 'Australia', quote: 'United States', symbol: 'C:AUDUSD' },
    'USDJPY': { base: 'United States', quote: 'Japan', symbol: 'C:USDJPY' },
    'EURJPY': { base: 'Germany', quote: 'Japan', symbol: 'C:EURJPY' },
    'GBPJPY': { base: 'United Kingdom', quote: 'Japan', symbol: 'C:GBPJPY' },
    'AUDJPY': { base: 'Australia', quote: 'Japan', symbol: 'C:AUDJPY' },
    'CADGBP': { base: 'Canada', quote: 'United Kingdom', symbol: 'C:CADGBP' },
    'CADJPY': { base: 'Canada', quote: 'Japan', symbol: 'C:CADJPY' },
    'AUDCAD': { base: 'Australia', quote: 'Canada', symbol: 'C:AUDCAD' },
    'EURGBP': { base: 'Germany', quote: 'United Kingdom', symbol: 'C:EURGBP' }
  }

  // Load price history when pair or timeframe changes
  useEffect(() => {
    loadPriceHistory()
  }, [selectedPair, timeframe])

  const loadPriceHistory = async () => {
    setLoading(true)
    try {
      const pairInfo = currencyPairs[selectedPair]
      if (!pairInfo) {
        setPriceHistory([])
        return
      }
      
      const response = await historyAPI.getPriceHistory(pairInfo.symbol, timeframe, 'day')
      const data = response.data
      
      console.log('Price history API response:', { symbol: pairInfo.symbol, data })
      
      // Log the structure of the first item to understand the data format
      if (Array.isArray(data) && data.length > 0) {
        console.log('First item structure:', data[0])
        console.log('First item keys:', Object.keys(data[0]))
      } else if (data && typeof data === 'object') {
        console.log('Data object structure:', data)
        console.log('Data object keys:', Object.keys(data))
      }
      
      // Handle different API response formats
      let processedData = []
      
      if (Array.isArray(data)) {
        // If data is already an array of price points
        processedData = data
      } else if (data && data.candles && Array.isArray(data.candles)) {
        // If data has candles array (Polygon.io format)
        console.log('Found candles array with', data.candles.length, 'items')
        processedData = data.candles
      } else if (data && data.results && Array.isArray(data.results)) {
        // If data has results array 
        processedData = data.results
      } else if (data && typeof data === 'object') {
        // If data is a single object, wrap it in an array
        processedData = [data]
      } else {
        console.warn('Unexpected data format for price history:', data)
        processedData = []
      }
      
      console.log('Processed data array:', processedData)
      
      // Ensure we always set an array
      if (processedData.length > 0) {
        console.log('Setting processed data with', processedData.length, 'items')
        console.log('Sample processed item:', processedData[0])
        setPriceHistory(processedData)
      } else {
        console.warn('No valid price data found')
        setPriceHistory([])
      }
    } catch (error) {
      console.error('Failed to load price history:', error)
      setPriceHistory([])
    } finally {
      setLoading(false)
    }
  }

  // Calculate interest rate change markers
  const getRateChangeMarkers = (baseCountry, quoteCountry) => {
    if (!interestRateData || interestRateData.length === 0) return []
    
    // Get historical rate data for both countries
    const baseRates = interestRateData
      .filter(item => item.Country === baseCountry)
      .sort((a, b) => new Date(a.DateTime) - new Date(b.DateTime))
    
    const quoteRates = interestRateData
      .filter(item => item.Country === quoteCountry)
      .sort((a, b) => new Date(a.DateTime) - new Date(b.DateTime))
    
    const markers = []
    
    // Find significant rate changes (>0.25% change)
    for (let i = 1; i < baseRates.length; i++) {
      const prevRate = baseRates[i-1].Value
      const currRate = baseRates[i].Value
      const change = currRate - prevRate
      
      if (Math.abs(change) >= 0.25) {
        markers.push({
          date: new Date(baseRates[i].DateTime).toLocaleDateString(),
          country: baseCountry,
          change: change,
          rate: currRate,
          type: 'base'
        })
      }
    }
    
    for (let i = 1; i < quoteRates.length; i++) {
      const prevRate = quoteRates[i-1].Value
      const currRate = quoteRates[i].Value
      const change = currRate - prevRate
      
      if (Math.abs(change) >= 0.25) {
        markers.push({
          date: new Date(quoteRates[i].DateTime).toLocaleDateString(),
          country: quoteCountry,
          change: change,
          rate: currRate,
          type: 'quote'
        })
      }
    }
    
    return markers
  }
  const getHistoricalRateDifferentials = (baseCountry, quoteCountry) => {
    if (!interestRateData || interestRateData.length === 0) return []
    
    // Group data by date and country
    const dataByDate = {}
    
    interestRateData.forEach(item => {
      const dateKey = item.DateTime.split('T')[0] // Get date part only
      if (!dataByDate[dateKey]) {
        dataByDate[dateKey] = {}
      }
      dataByDate[dateKey][item.Country] = item.Value
    })
    
    // Calculate rate differentials for each date
    const rateDifferentials = []
    Object.keys(dataByDate).sort().forEach(date => {
      const baseRate = dataByDate[date][baseCountry]
      const quoteRate = dataByDate[date][quoteCountry]
      
      if (baseRate !== undefined && quoteRate !== undefined) {
        rateDifferentials.push({
          date,
          differential: baseRate - quoteRate,
          baseRate,
          quoteRate
        })
      }
    })
    
    return rateDifferentials
  }

  const chartData = useMemo(() => {
    if (!priceHistory || !Array.isArray(priceHistory) || priceHistory.length === 0) return []
    
    const pairInfo = currencyPairs[selectedPair]
    if (!pairInfo) return []

    const historicalRates = getHistoricalRateDifferentials(pairInfo.base, pairInfo.quote)
    const rateChangeMarkers = getRateChangeMarkers(pairInfo.base, pairInfo.quote)
    
    // Create a map of rate differentials by date
    const rateMap = {}
    historicalRates.forEach(rate => {
      rateMap[rate.date] = rate.differential
    })
    
    // Create a map of rate change markers by date
    const markersMap = {}
    rateChangeMarkers.forEach(marker => {
      if (!markersMap[marker.date]) {
        markersMap[marker.date] = []
      }
      markersMap[marker.date].push(marker)
    })
    
    try {
      // Transform price data and match with rate differential
      console.log('Processing price history:', priceHistory)
      
      // Don't filter - just process all items and handle errors gracefully
      const sortedPriceHistory = [...priceHistory].sort((a, b) => {
        try {
          const dateA = new Date(a.timestamp || a.time || a.date || a.t || Date.now())
          const dateB = new Date(b.timestamp || b.time || b.date || b.t || Date.now())
          
          // If dates are invalid, keep original order
          if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
            return 0
          }
          
          return dateA.getTime() - dateB.getTime()
        } catch (error) {
          console.warn('Error sorting dates:', error)
          return 0
        }
      })
      
      console.log('Sorted price history (no filtering):', sortedPriceHistory)
      
      if (sortedPriceHistory.length === 0) {
        console.warn('No price history data found')
        return []
      }
      
      // Get first item for normalization
      const firstItem = sortedPriceHistory[0]
      const firstPriceValue = firstItem.c || firstItem.close || firstItem.Close ||
                             firstItem.price || firstItem.Price || firstItem.last || firstItem.Last || 
                             firstItem.value || firstItem.Value || firstItem.h || firstItem.high ||
                             firstItem.closePrice || firstItem.lastPrice || firstItem.marketPrice ||
                             firstItem.bid || firstItem.ask || firstItem.mid || firstItem.current ||
                             Object.values(firstItem).find(val => typeof val === 'number' && val > 0 && val < 10)
      
      const firstPrice = parseFloat(firstPriceValue) || 1 // Use 1 to avoid division by zero
      console.log('First item for normalization:', { firstItem, firstPriceValue, firstPrice })

      return sortedPriceHistory.map((item, index) => {
        console.log(`Processing item ${index}:`, item)
        
        // More flexible date handling
        let date
        let dateKey = 'unknown'
        
        try {
          // Handle different timestamp formats for candle data
          const timeValue = item.t || item.timestamp || item.time || item.date || item.dt || item.datetime || new Date().toISOString()
          console.log('Processing time value:', timeValue, 'from item:', item)
          
          // Convert timestamp if it's in milliseconds
          if (typeof timeValue === 'number') {
            date = new Date(timeValue)
          } else {
            date = new Date(timeValue)
          }
          
          // If date is invalid, try alternative parsing
          if (isNaN(date.getTime())) {
            console.warn('Invalid date, trying alternative parsing:', timeValue)
            // Try parsing as milliseconds if it's a number
            if (typeof timeValue === 'number') {
              date = new Date(timeValue)
            } else if (typeof timeValue === 'string') {
              // Try different date formats
              date = new Date(timeValue.replace(/[T|Z]/g, ' '))
            }
          }
          
          // Final fallback
          if (isNaN(date.getTime())) {
            console.warn('Using current date as fallback for:', timeValue)
            date = new Date()
          }
          
          dateKey = date.toISOString().split('T')[0]
        } catch (error) {
          console.warn('Error processing date, using current date:', error)
          date = new Date()
          dateKey = date.toISOString().split('T')[0]
        }
        
        // Much more flexible price handling - try all possible field names
        let price = 0
        
        try {
          // Handle candle data format (o, h, l, c) and other formats
          const priceValue = item.c || item.close || item.Close ||  // Close price (most common)
                           item.price || item.Price || item.last || item.Last || 
                           item.value || item.Value || item.h || item.high || // High as fallback
                           item.closePrice || item.lastPrice || item.marketPrice ||
                           item.bid || item.ask || item.mid || item.current ||
                           Object.values(item).find(val => typeof val === 'number' && val > 0 && val < 10) // Reasonable FX rate
          
          console.log(`Item ${index} price extraction:`, {
            item,
            priceValue,
            availableFields: Object.keys(item),
            candleFields: { o: item.o, h: item.h, l: item.l, c: item.c, t: item.t },
            availableNumbers: Object.entries(item).filter(([k, v]) => typeof v === 'number')
          })
          
          price = parseFloat(priceValue) || 0
          
          console.log(`Prices for item ${index}:`, { price, firstPrice, isValidPrice: !isNaN(price) && price > 0 })
          
        } catch (error) {
          console.warn('Error parsing prices:', error)
          price = 0
        }
        
        // Find closest rate differential (look for exact match, then nearest)
        let rateDifferential = rateMap[dateKey]
        if (rateDifferential === undefined) {
          // Find nearest available rate differential
          const availableDates = Object.keys(rateMap).sort()
          if (availableDates.length > 0) {
            const closestDate = availableDates.reduce((closest, availableDate) => {
              const availableTime = new Date(availableDate).getTime()
              const targetTime = date.getTime()
              const closestTime = new Date(closest).getTime()
              
              return Math.abs(availableTime - targetTime) < Math.abs(closestTime - targetTime)
                ? availableDate : closest
            }, availableDates[0])
            
            rateDifferential = rateMap[closestDate] || 0
          } else {
            rateDifferential = 0
          }
        }
        
        const markers = markersMap[dateKey] || []
        const hasRateChange = markers.length > 0
        const majorRateChange = markers.find(m => Math.abs(m.change) >= 0.5)
        
        const dataPoint = {
          date: date.toLocaleDateString(),
          dateTime: date,
          price: price || 0,
          rateDifferential: rateDifferential || 0,
          priceChange: firstPrice && firstPrice !== 0 ? ((price - firstPrice) / firstPrice) * 100 : 0,
          volume: parseFloat(item.volume || item.vol || item.v || 0) || 0,
          hasRateChange: hasRateChange,
          isMajorRateChange: !!majorRateChange,
          rateChangeInfo: markers
        }
        
        console.log(`Final data point ${index}:`, dataPoint)
        return dataPoint
      })
      
      console.log('Final complete chart data:', chartData)
      console.log('Chart data summary:', {
        totalPoints: chartData.length,
        hasValidPrices: chartData.filter(d => d.price > 0).length,
        priceRange: chartData.length > 0 ? {
          min: Math.min(...chartData.map(d => d.price)),
          max: Math.max(...chartData.map(d => d.price))
        } : null
      })
      
      return chartData
    } catch (error) {
      console.error('Error processing chart data:', error)
      return []
    }
  }, [priceHistory, selectedPair, interestRateData])

  const stats = useMemo(() => {
    if (!chartData || !Array.isArray(chartData) || chartData.length === 0) return null
    
    try {
      const prices = chartData.map(d => d.price).filter(p => !isNaN(p))
      const rates = chartData.map(d => d.rateDifferential).filter(r => !isNaN(r))
      
      if (prices.length === 0) return null
      
      const minPrice = Math.min(...prices)
      const maxPrice = Math.max(...prices)
      const currentPrice = prices[prices.length - 1]
      const firstPrice = prices[0]
      const totalChange = firstPrice ? ((currentPrice - firstPrice) / firstPrice) * 100 : 0
      
      // Calculate basic correlation coefficient
      const priceChanges = chartData.map(d => d.priceChange).filter(p => !isNaN(p))
      const meanPriceChange = priceChanges.length > 0 ? priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length : 0
      const meanRateChange = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0
      
      const correlation = (() => {
        try {
          if (priceChanges.length === 0 || rates.length === 0) return 0
          
          const numerator = priceChanges.reduce((sum, price, i) => {
            const rate = rates[i]
            if (rate !== undefined && !isNaN(rate) && !isNaN(price)) {
              return sum + (price - meanPriceChange) * (rate - meanRateChange)
            }
            return sum
          }, 0)
          
          const denomX = Math.sqrt(priceChanges.reduce((sum, price) => {
            if (!isNaN(price)) {
              return sum + Math.pow(price - meanPriceChange, 2)
            }
            return sum
          }, 0))
          
          const denomY = Math.sqrt(rates.reduce((sum, rate) => {
            if (!isNaN(rate)) {
              return sum + Math.pow(rate - meanRateChange, 2)
            }
            return sum
          }, 0))
          
          if (denomX === 0 || denomY === 0) return 0
          return numerator / (denomX * denomY)
        } catch (error) {
          console.error('Error calculating correlation:', error)
          return 0
        }
      })()
      
      return {
        minPrice: minPrice.toFixed(5),
        maxPrice: maxPrice.toFixed(5),
        currentPrice: currentPrice.toFixed(5),
        totalChange: totalChange.toFixed(2),
        currentRateDiff: rates[rates.length - 1]?.toFixed(2) || '0.00',
        averageRateDiff: meanRateChange.toFixed(2),
        correlation: (correlation * 100).toFixed(1), // Convert to percentage
        dataPoints: chartData.length
      }
    } catch (error) {
      console.error('Error calculating stats:', error)
      return null
    }
  }, [chartData])

  const customTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="custom-tooltip">
          <p className="tooltip-label">{`Date: ${label}`}</p>
          <p className="tooltip-price">{`Price: ${data.price.toFixed(5)}`}</p>
          <p className="tooltip-change">{`Change: ${data.priceChange.toFixed(2)}%`}</p>
          <p className="tooltip-rate">{`Rate Diff: ${data.rateDifferential.toFixed(2)}%`}</p>
          
          {data.hasRateChange && (
            <div className="tooltip-rate-changes">
              <hr style={{ margin: '8px 0', border: '1px solid #4b5563' }} />
              <p className="tooltip-section-title">📊 Rate Changes:</p>
              {data.rateChangeInfo.map((change, idx) => (
                <p key={idx} className={`tooltip-rate-change ${change.change > 0 ? 'rate-increase' : 'rate-decrease'}`}>
                  {change.country}: {change.change > 0 ? '+' : ''}{change.change.toFixed(2)}% → {change.rate}%
                </p>
              ))}
            </div>
          )}
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="correlation-chart">
        <div className="chart-header">
          <h2>Currency vs Interest Rate Correlation</h2>
          <div className="chart-controls">
            <select 
              value={selectedPair} 
              onChange={(e) => setSelectedPair(e.target.value)}
              disabled={loading}
            >
              {Object.entries(currencyPairs).map(([pair, info]) => (
                <option key={pair} value={pair}>
                  {pair} ({info.base} / {info.quote})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading price history...</p>
        </div>
      </div>
    )
  }

  if (chartData.length === 0) {
    return (
      <div className="correlation-chart">
        <div className="chart-header">
          <h2>Currency vs Interest Rate Correlation</h2>
          <div className="chart-controls">
            <select 
              value={selectedPair} 
              onChange={(e) => setSelectedPair(e.target.value)}
            >
              {Object.entries(currencyPairs).map(([pair, info]) => (
                <option key={pair} value={pair}>
                  {pair} ({info.base} / {info.quote})
                </option>
              ))}
            </select>
            <select 
              value={timeframe} 
              onChange={(e) => setTimeframe(parseInt(e.target.value))}
            >
              <option value={30}>30 Days</option>
              <option value={90}>90 Days</option>
              <option value={180}>180 Days</option>
              <option value={365}>1 Year</option>
            </select>
          </div>
        </div>
        <div className="no-data">
          <p>No price history available for {selectedPair}</p>
          <button onClick={loadPriceHistory} className="retry-button">
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const pairInfo = currencyPairs[selectedPair]

  return (
    <div className="correlation-chart">
      <div className="chart-header">
        <h2>Currency vs Interest Rate Correlation</h2>
        <div className="chart-controls">
          <select 
            value={selectedPair} 
            onChange={(e) => setSelectedPair(e.target.value)}
            className="pair-selector"
          >
            {Object.entries(currencyPairs).map(([pair, info]) => (
              <option key={pair} value={pair}>
                {pair} ({info.base} / {info.quote})
              </option>
            ))}
          </select>
          <select 
            value={timeframe} 
            onChange={(e) => setTimeframe(parseInt(e.target.value))}
            className="timeframe-selector"
          >
            <option value={30}>30 Days</option>
            <option value={90}>90 Days</option>
            <option value={180}>180 Days</option>
            <option value={365}>1 Year</option>
          </select>
          <button onClick={loadPriceHistory} className="refresh-button">
            <span className="refresh-icon">⟳</span>
            Refresh
          </button>
        </div>
      </div>

      {stats && (
        <div className="chart-stats">
          <div className="stat-item">
            <span className="stat-label">Current Price:</span>
            <span className="stat-value">{stats.currentPrice}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Total Change:</span>
            <span className={`stat-value ${parseFloat(stats.totalChange) >= 0 ? 'positive' : 'negative'}`}>
              {stats.totalChange}%
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Current Rate Diff:</span>
            <span className="stat-value">{stats.currentRateDiff}%</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Avg Rate Diff:</span>
            <span className="stat-value">{stats.averageRateDiff}%</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Correlation:</span>
            <span className={`stat-value ${Math.abs(parseFloat(stats.correlation)) > 50 ? 'strong-correlation' : 'weak-correlation'}`}>
              {stats.correlation}%
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Data Points:</span>
            <span className="stat-value">{stats.dataPoints}</span>
          </div>
        </div>
      )}

      <div className="chart-info">
        <p>
          <strong>{selectedPair}</strong>: Showing {pairInfo.base} vs {pairInfo.quote} exchange rate 
          against historical interest rate differentials. 
          <br />
          <strong>Current differential:</strong> {stats?.currentRateDiff}% | 
          <strong> Correlation strength:</strong> {stats?.correlation}% 
          ({Math.abs(parseFloat(stats?.correlation)) > 70 ? 'Strong' : 
            Math.abs(parseFloat(stats?.correlation)) > 30 ? 'Moderate' : 'Weak'})
        </p>
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height={500}>
          <ComposedChart
            data={chartData}
            margin={{
              top: 20,
              right: 30,
              left: 20,
              bottom: 80
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="date" 
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              angle={-45}
              textAnchor="end"
              height={80}
              interval={Math.ceil(chartData.length / 8)}
            />
            <YAxis 
              yAxisId="price"
              orientation="left"
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              label={{ value: `${selectedPair} Price`, angle: -90, position: 'insideLeft' }}
              domain={['dataMin - 0.001', 'dataMax + 0.001']}
            />
            <YAxis 
              yAxisId="rate"
              orientation="right"
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              label={{ value: 'Interest Rate Differential (%)', angle: 90, position: 'insideRight' }}
            />
            <Tooltip content={customTooltip} />
            <Legend />
            
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="price"
              stroke="#60a5fa"
              strokeWidth={2}
              dot={(props) => {
                const { cx, cy, payload } = props
                if (payload && payload.isMajorRateChange) {
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={6}
                      fill="#ef4444"
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                  )
                } else if (payload && payload.hasRateChange) {
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill="#f59e0b"
                      stroke="#ffffff"
                      strokeWidth={1}
                    />
                  )
                }
                return null
              }}
              name={`${selectedPair} Price`}
            />
            
            <Line
              yAxisId="rate"
              type="monotone"
              dataKey="rateDifferential"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={(props) => {
                const { cx, cy, payload } = props
                if (payload && payload.hasRateChange) {
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={3}
                      fill="#f59e0b"
                      stroke="#ffffff"
                      strokeWidth={1}
                    />
                  )
                }
                return null
              }}
              name="Interest Rate Differential (%)"
            />
            
            {/* Add reference lines for key differential levels */}
            <ReferenceLine 
              yAxisId="rate"
              y={0} 
              stroke="#ef4444" 
              strokeDasharray="3 3" 
              label={{ value: "Zero Differential", position: "topLeft" }}
            />
            
            <ReferenceLine 
              yAxisId="rate"
              y={1} 
              stroke="#10b981" 
              strokeDasharray="2 2" 
              label={{ value: "+1.0%", position: "topLeft" }}
            />
            
            <ReferenceLine 
              yAxisId="rate"
              y={-1} 
              stroke="#10b981" 
              strokeDasharray="2 2" 
              label={{ value: "-1.0%", position: "bottomLeft" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-note">
        <p className="note-text">
          📊 <strong>How to interpret:</strong> When interest rate differential increases (base country rate {'>'}  quote country rate), 
          the currency pair typically strengthens. This chart helps visualize this correlation over time.
        </p>
        <div className="chart-markers-legend">
          <h4>📍 Rate Change Markers:</h4>
          <div className="markers-grid">
            <div className="marker-item">
              <span className="marker-dot major-change"></span>
              <span>Major Rate Change (≥0.5%)</span>
            </div>
            <div className="marker-item">
              <span className="marker-dot minor-change"></span>
              <span>Minor Rate Change (≥0.25%)</span>
            </div>
            <div className="marker-item">
              <span className="reference-line zero"></span>
              <span>Zero Differential</span>
            </div>
            <div className="marker-item">
              <span className="reference-line positive"></span>
              <span>±1.0% Reference</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CurrencyRateCorrelationChart