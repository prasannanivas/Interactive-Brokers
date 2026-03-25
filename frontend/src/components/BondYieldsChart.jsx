import React, { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import TimeframeSelector from './TimeframeSelector'
import FullscreenChartModal from './FullscreenChartModal'
import { bondAPI } from '../api/api'
import './BondYieldsChart.css'

const BondYieldsChart = ({ selectedCurrencyPair }) => {
  const [bondData, setBondData] = useState([])
  const [loading, setLoading] = useState(false)
  const [timeframe, setTimeframe] = useState(365) // days - default to 1 year
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isStale, setIsStale] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [staleDays, setStaleDays] = useState(0)

  // Map currency pairs to their countries
  const pairToCountries = {
    'USDCAD': ['United States', 'Canada'],
    'EURUSD': ['Germany', 'United States'],
    'GBPUSD': ['United Kingdom', 'United States'],
    'AUDUSD': ['Australia', 'United States'],
    'USDJPY': ['United States', 'Japan'],
    'EURJPY': ['Germany', 'Japan'],
    'GBPJPY': ['United Kingdom', 'Japan'],
    'AUDJPY': ['Australia', 'Japan'],
    'CADGBP': ['Canada', 'United Kingdom'],
    'CADJPY': ['Canada', 'Japan'],
    'AUDCAD': ['Australia', 'Canada'],
    'EURGBP': ['Germany', 'United Kingdom']
  }

  // Available countries with their data files
  const countries = [
    { name: 'Australia', historyFile: 'aus-10and2y.json', flag: '🇦🇺' },
    { name: 'Canada', historyFile: 'canada-10and2y.json', flag: '🇨🇦' },
    { name: 'Germany', historyFile: 'germany-10and2y.json', flag: '🇩🇪' },
    { name: 'Japan', historyFile: 'japan-10and2y.json', flag: '🇯🇵' },
    { name: 'United Kingdom', historyFile: 'uk-10and2y.json', flag: '🇬🇧' },
    { name: 'United States', historyFile: 'us-10and2y.json', flag: '🇺🇸' }
  ]

  // Load historical bond yield data from MongoDB API
  const loadBondData = async () => {
    if (loading) return
    
    setLoading(true)
    try {
      const selectedCountries = pairToCountries[selectedCurrencyPair] || []
      
      // Map country display names to database country names
      const countryNameMap = {
        'United States': 'United States',
        'Canada': 'Canada',
        'Germany': 'Euro Area',  // Germany = Euro Area in DB
        'Japan': 'Japan',
        'United Kingdom': 'United Kingdom',
        'Australia': 'Australia'
      }
      
      const historicalData = []
      
      // Load data for each selected country (both 10Y and 2Y)
      for (const countryName of selectedCountries) {
        const dbCountryName = countryNameMap[countryName]
        if (!dbCountryName) continue
        
        try {
          // Fetch 10Y and 2Y data from MongoDB API
          const [response10Y, response2Y] = await Promise.all([
            bondAPI.getBondYields(dbCountryName, '10y', timeframe),
            bondAPI.getBondYields(dbCountryName, '2y', timeframe)
          ])
          
          const data10Y = response10Y.data || []
          const data2Y = response2Y.data || []
          
          console.log(`Loaded ${countryName} bond data from MongoDB:`, data10Y.length, '10Y records,', data2Y.length, '2Y records')
          
          // Group by date
          const dateMap = {}
          
          // Process 10Y data
          data10Y.forEach(item => {
            const date = item.Date
            const close = item.Close
            
            if (!date || close === undefined) return
            
            // Parse date from dd/mm/yyyy to yyyy-mm-dd
            const [day, month, year] = date.split('/')
            const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
            
            if (!dateMap[isoDate]) {
              dateMap[isoDate] = {
                date: isoDate,
                country: countryName
              }
            }
            
            dateMap[isoDate].yield10Y = close
          })
          
          // Process 2Y data
          data2Y.forEach(item => {
            const date = item.Date
            const close = item.Close
            
            if (!date || close === undefined) return
            
            // Parse date from dd/mm/yyyy to yyyy-mm-dd
            const [day, month, year] = date.split('/')
            const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
            
            if (!dateMap[isoDate]) {
              dateMap[isoDate] = {
                date: isoDate,
                country: countryName
              }
            }
            
            dateMap[isoDate].yield2Y = close
          })
          
          // Convert to array and calculate spreads
          Object.values(dateMap).forEach(item => {
            if (item.yield2Y !== undefined && item.yield10Y !== undefined) {
              item.spread = item.yield10Y - item.yield2Y
              historicalData.push(item)
            }
          })
          
        } catch (error) {
          console.error(`Error loading ${countryName} bond data from MongoDB:`, error)
        }
      }
      
      // Sort by date (most recent last for charting)
      historicalData.sort((a, b) => new Date(a.date) - new Date(b.date))
      
      console.log('📊 Loaded bond data from MongoDB:', historicalData.length, 'records from', selectedCountries)
      setBondData(historicalData)
      
    } catch (error) {
      console.error('Error loading bond yield data:', error)
      setBondData([])
    } finally {
      setLoading(false)
    }
  }

  // Check data freshness
  const checkDataFreshness = async () => {
    try {
      const response = await bondAPI.checkDataFreshness()
      const data = response.data
      
      if (data.is_stale) {
        setIsStale(true)
        // Calculate oldest data
        if (data.oldest_data_date) {
          const oldestDate = new Date(data.oldest_data_date)
          const today = new Date()
          const daysDiff = Math.floor((today - oldestDate) / (1000 * 60 * 60 * 24))
          setStaleDays(daysDiff)
        }
      } else {
        setIsStale(false)
        setStaleDays(0)
      }
    } catch (error) {
      console.error('Error checking data freshness:', error)
    }
  }
  
  // Handle manual data refresh
  const handleRefresh = async () => {
    if (refreshing) return
    
    setRefreshing(true)
    try {
      console.log('🔄 Triggering manual data refresh...')
      
      const response = await bondAPI.refreshData()
      
      if (response.data.success) {
        console.log('✓ Data refresh successful')
        
        // Wait a moment for data to be written
        setTimeout(async () => {
          // Reload the chart data
          await loadBondData()
          
          // Recheck freshness
          await checkDataFreshness()
          
          alert('Data refreshed successfully!')
        }, 2000)
      }
    } catch (error) {
      console.error('Error refreshing data:', error)
      alert(`Failed to refresh data: ${error.response?.data?.detail || error.message}`)
    } finally {
      setRefreshing(false)
    }
  }
  
  // Load data when currency pair or timeframe changes
  useEffect(() => {
    loadBondData()
    checkDataFreshness()
  }, [selectedCurrencyPair, timeframe])

  // Prepare chart data - group all dates and organize by country
  const chartData = useMemo(() => {
    if (!bondData || bondData.length === 0) return []
    
    // Group data by date
    const dateMap = {}
    bondData.forEach(item => {
      if (!dateMap[item.date]) {
        dateMap[item.date] = { date: item.date }
      }
      // Add yields for each country
      const prefix = `${item.country}_`
      dateMap[item.date][`${prefix}2Y`] = item.yield2Y
      dateMap[item.date][`${prefix}10Y`] = item.yield10Y
      dateMap[item.date][`${prefix}Spread`] = item.spread
    })
    
    // Convert to array and sort by date
    return Object.values(dateMap).sort((a, b) => {
      const dateA = new Date(a.date)
      const dateB = new Date(b.date)
      return dateA - dateB
    })
  }, [bondData])

  // Get country names from selected pair
  const selectedCountries = useMemo(() => {
    return pairToCountries[selectedCurrencyPair] || []
  }, [selectedCurrencyPair])

  const formatYield = (value) => value ? `${value.toFixed(2)}%` : 'N/A'
  const formatDate = (dateStr) => {
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    } catch {
      return dateStr
    }
  }
  
  const formatFullDate = (dateStr) => {
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
      return dateStr
    }
  }
  
  // Custom Tooltip to show full date and day granularity
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          backgroundColor: '#1f2937',
          border: '1px solid #374151',
          borderRadius: '8px',
          padding: '12px',
          color: '#f9fafb'
        }}>
          <p style={{ marginBottom: '8px', fontWeight: 'bold', color: '#60a5fa' }}>
            {formatFullDate(label)}
          </p>
          {payload.map((entry, index) => (
            <p key={index} style={{ margin: '4px 0', color: entry.color }}>
              {entry.name}: {formatYield(entry.value)}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  // Handle ESC key to close fullscreen
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false)
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isFullscreen])

  const renderChartContent = () => (
    <>
      {loading && (
        <div className="loading-indicator">
          <div className="loading-spinner"></div>
          Loading bond yields data...
        </div>
      )}

      {!loading && bondData.length === 0 && (
        <div className="no-data">
          No bond yield data available for {selectedCurrencyPair}
        </div>
      )}

      {!loading && bondData.length > 0 && chartData.length > 0 && (
        <>
          <div className="bond-yields-charts">
            {/* 2-Year Bond Yields */}
            <div className="chart-container">
              <h4>2-Year Government Bond Yields Over Time</h4>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    dataKey="date"
                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    interval={timeframe <= 30 ? Math.floor(chartData.length / 15) : Math.floor(chartData.length / 10)}
                    tickFormatter={formatDate}
                  />
                  <YAxis 
                    label={{ value: 'Yield (%)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}
                    domain={['auto', 'auto']}
                    tick={{ fill: '#9ca3af' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    verticalAlign="top" 
                    align="left"
                    wrapperStyle={{ paddingLeft: '20px', paddingBottom: '10px' }}
                    iconType="line"
                  />
                  {selectedCountries.map((country, idx) => (
                    <Line 
                      key={country}
                      type="monotone" 
                      dataKey={`${country}_2Y`}
                      name={`${country} 2Y`}
                      stroke={idx === 0 ? '#60a5fa' : '#f472b6'}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* 10-Year Bond Yields */}
            <div className="chart-container">
              <h4>10-Year Government Bond Yields Over Time</h4>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    dataKey="date"
                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    interval={timeframe <= 30 ? Math.floor(chartData.length / 15) : Math.floor(chartData.length / 10)}
                    tickFormatter={formatDate}
                  />
                  <YAxis 
                    label={{ value: 'Yield (%)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}
                    domain={['auto', 'auto']}
                    tick={{ fill: '#9ca3af' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    verticalAlign="top" 
                    align="left"
                    wrapperStyle={{ paddingLeft: '20px', paddingBottom: '10px' }}
                    iconType="line"
                  />
                  {selectedCountries.map((country, idx) => (
                    <Line 
                      key={country}
                      type="monotone" 
                      dataKey={`${country}_10Y`}
                      name={`${country} 10Y`}
                      stroke={idx === 0 ? '#34d399' : '#fbbf24'}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </>
  )

  return (
    <div className="bond-yields-chart">
      <div className="bond-yields-header">
        <div className="chart-title-section">
          <h3>Government Bond Yields (2Y vs 10Y) Spread - {selectedCurrencyPair}</h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {isStale && (
              <button
                className="refresh-data-btn"
                onClick={handleRefresh}
                disabled={refreshing}
                title={`Data is ${staleDays} days old. Click to refresh.`}
                style={{
                  padding: '6px 12px',
                  backgroundColor: refreshing ? '#6b7280' : '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: refreshing ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  animation: 'pulse 2s infinite'
                }}
              >
                {refreshing ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                    </svg>
                    Refreshing...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                    </svg>
                    Refresh Data ({staleDays}d old)
                  </>
                )}
              </button>
            )}
            <button 
              className="zoom-chart-btn"
              onClick={() => setIsFullscreen(true)}
              title="View Fullscreen"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      {/* Timeframe Selector */}
      <TimeframeSelector
        selectedTimeframe={timeframe}
        onTimeframeChange={setTimeframe}
      />

      {renderChartContent()}

      {/* Fullscreen Modal */}
      <FullscreenChartModal
        isOpen={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        title={`Government Bond Yields (2Y vs 10Y) - ${selectedCurrencyPair}`}
      >
        <TimeframeSelector
          selectedTimeframe={timeframe}
          onTimeframeChange={setTimeframe}
        />
        {renderChartContent()}
      </FullscreenChartModal>
    </div>
  )
}

export default BondYieldsChart