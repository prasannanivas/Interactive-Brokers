import React, { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import './BondYieldsChart.css'

const BondYieldsChart = ({ selectedCurrencyPair }) => {
  const [bondData, setBondData] = useState([])
  const [loading, setLoading] = useState(false)

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
      
      // Generate dummy historical data for the past 90 days
      const historicalData = []
      const daysToGenerate = 90
      const today = new Date()
      
      selectedCountries.forEach(countryName => {
        // Generate different base rates for different countries
        let base2Y = 3.5
        let base10Y = 4.2
        
        if (countryName === 'United States') {
          base2Y = 4.5
          base10Y = 4.8
        } else if (countryName === 'Canada') {
          base2Y = 3.8
          base10Y = 4.1
        } else if (countryName === 'Germany') {
          base2Y = 2.5
          base10Y = 2.8
        } else if (countryName === 'Japan') {
          base2Y = 0.2
          base10Y = 0.8
        } else if (countryName === 'United Kingdom') {
          base2Y = 4.2
          base10Y = 4.5
        } else if (countryName === 'Australia') {
          base2Y = 4.0
          base10Y = 4.3
        }
        
        for (let i = daysToGenerate; i >= 0; i--) {
          const date = new Date(today)
          date.setDate(date.getDate() - i)
          
          // Add some random variation to make it look realistic
          const variation2Y = (Math.random() - 0.5) * 0.4
          const variation10Y = (Math.random() - 0.5) * 0.4
          
          historicalData.push({
            date: date.toISOString().split('T')[0],
            country: countryName,
            yield2Y: base2Y + variation2Y + (Math.sin(i / 10) * 0.3),
            yield10Y: base10Y + variation10Y + (Math.sin(i / 10) * 0.3),
            spread: (base10Y + variation10Y) - (base2Y + variation2Y)
          })
        }
      })
      
      console.log('Generated dummy historical bond data:', historicalData.length, 'records')
      setBondData(historicalData)
    } catch (error) {
      console.error('Error generating bond yield data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Load data when currency pair changes
  useEffect(() => {
    loadBondData()
  }, [selectedCurrencyPair])

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

  return (
    <div className="bond-yields-chart">
      <div className="bond-yields-header">
        <div className="chart-title-section">
          <h3>Government Bond Yields (2Y vs 10Y) - {selectedCurrencyPair}</h3>
        </div>
      </div>

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
                    interval={Math.floor(chartData.length / 10)}
                    tickFormatter={formatDate}
                  />
                  <YAxis 
                    label={{ value: 'Yield (%)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}
                    domain={['auto', 'auto']}
                    tick={{ fill: '#9ca3af' }}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                    labelStyle={{ color: '#f9fafb' }}
                    formatter={(value) => formatYield(value)}
                  />
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
                    interval={Math.floor(chartData.length / 10)}
                    tickFormatter={formatDate}
                  />
                  <YAxis 
                    label={{ value: 'Yield (%)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}
                    domain={['auto', 'auto']}
                    tick={{ fill: '#9ca3af' }}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                    labelStyle={{ color: '#f9fafb' }}
                    formatter={(value) => formatYield(value)}
                  />
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
    </div>
  )
}

export default BondYieldsChart