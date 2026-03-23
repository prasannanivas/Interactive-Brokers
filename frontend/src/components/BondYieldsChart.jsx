import React, { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import TimeframeSelector from './TimeframeSelector'
import FullscreenChartModal from './FullscreenChartModal'
import './BondYieldsChart.css'

const BondYieldsChart = ({ selectedCurrencyPair }) => {
  const [bondData, setBondData] = useState([])
  const [loading, setLoading] = useState(false)
  const [timeframe, setTimeframe] = useState(365) // days - default to 1 year
  const [isFullscreen, setIsFullscreen] = useState(false)

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

  // Load historical bond yield data
  const loadBondData = async () => {
    if (loading) return
    
    setLoading(true)
    try {
      const selectedCountries = pairToCountries[selectedCurrencyPair] || []
      
      // Map country names to their file prefixes
      const countryFileMap = {
        'United States': 'us',
        'Canada': 'canada',
        'Germany': 'germany',
        'Japan': 'japan',
        'United Kingdom': 'uk',
        'Australia': 'australia'
      }
      
      const historicalData = []
      
      // Load data for each selected country
      for (const countryName of selectedCountries) {
        const filePrefix = countryFileMap[countryName]
        if (!filePrefix) continue
        
        try {
          // Load combined 10Y and 2Y data
          const response = await fetch(`/bond/${filePrefix}-10and2y.json`)
          if (!response.ok) {
            console.warn(`Failed to load ${filePrefix} bond data:`, response.status)
            continue
          }
          
          const data = await response.json()
          console.log(`Loaded ${filePrefix} bond data:`, data.length, 'records')
          
          // Process and extract 2Y and 10Y data
          // Group by date since file contains both 2Y and 10Y entries per date
          const dateMap = {}
          
          data.forEach(item => {
            const date = item.date || item.Date
            const symbol = item.symbol || item.Symbol
            const close = item.close || item.Close
            
            if (!date || !symbol || !close) return
            
            // Parse date from dd/mm/yyyy to yyyy-mm-dd
            const [day, month, year] = date.split('/')
            const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
            
            if (!dateMap[isoDate]) {
              dateMap[isoDate] = {
                date: isoDate,
                country: countryName
              }
            }
            
            // Determine if this is 2Y or 10Y based on symbol
            if (symbol.includes('2Y') || symbol.includes('2y')) {
              dateMap[isoDate].yield2Y = close
            } else if (symbol.includes('10Y') || symbol.includes('10y')) {
              dateMap[isoDate].yield10Y = close
            }
          })
          
          // Convert to array and calculate spreads
          Object.values(dateMap).forEach(item => {
            if (item.yield2Y !== undefined && item.yield10Y !== undefined) {
              item.spread = item.yield10Y - item.yield2Y
              historicalData.push(item)
            }
          })
          
        } catch (error) {
          console.error(`Error loading ${countryName} bond data:`, error)
        }
      }
      
      // Sort by date (most recent last for charting)
      historicalData.sort((a, b) => new Date(a.date) - new Date(b.date))
      
      // Filter by selected timeframe
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - timeframe)
      const recentData = historicalData.filter(item => 
        new Date(item.date) >= cutoffDate
      )
      
      console.log('📊 Loaded real bond data:', recentData.length, 'records from', selectedCountries)
      setBondData(recentData)
      
    } catch (error) {
      console.error('Error loading bond yield data:', error)
      setBondData([])
    } finally {
      setLoading(false)
    }
  }

  // Load data when currency pair or timeframe changes
  useEffect(() => {
    loadBondData()
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