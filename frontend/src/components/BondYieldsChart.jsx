import React, { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import './BondYieldsChart.css'

const BondYieldsChart = () => {
  const [bondData, setBondData] = useState([])
  const [selectedCountries, setSelectedCountries] = useState(['Canada', 'United States', 'Germany'])
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Available countries with their data files
  const countries = [
    { name: 'Australia', searchFile: 'aus-search.json', flag: '🇦🇺' },
    { name: 'Canada', searchFile: 'canada-search.json', flag: '🇨🇦' },
    { name: 'Germany', searchFile: 'germany-search.json', flag: '🇩🇪' },
    { name: 'Japan', searchFile: 'japan-search.json', flag: '🇯🇵' },
    { name: 'United Kingdom', searchFile: 'uk-search.json', flag: '🇬🇧' },
    { name: 'United States', searchFile: 'us-search.json', flag: '🇺🇸' }
  ]

  // Load bond yield data for all countries
  const loadBondData = async () => {
    if (loading) return
    
    setLoading(true)
    try {
      const allBondData = []
      
      for (const country of countries) {
        try {
          const response = await fetch(`/bond/${country.searchFile}`)
          if (!response.ok) {
            console.warn(`Failed to load ${country.name} bond data:`, response.status)
            continue
          }
          
          const data = await response.json()
          
          // Find 2Y and 10Y bonds
          const bond2Y = data.find(item => item.Name && item.Name.includes('2Y'))
          const bond10Y = data.find(item => item.Name && item.Name.includes('10Y'))
          
          if (bond2Y && bond10Y) {
            allBondData.push({
              country: country.name,
              flag: country.flag,
              yield2Y: bond2Y.Last || bond2Y.Close,
              yield10Y: bond10Y.Last || bond10Y.Close,
              spread: (bond10Y.Last || bond10Y.Close) - (bond2Y.Last || bond2Y.Close),
              change2Y: bond2Y.DailyChange || 0,
              change10Y: bond10Y.DailyChange || 0,
              changePercent2Y: bond2Y.DailyPercentualChange || 0,
              changePercent10Y: bond10Y.DailyPercentualChange || 0,
              lastUpdate: new Date(bond10Y.Date || bond10Y.CloseDate).toLocaleString()
            })
          } else {
            console.warn(`Could not find 2Y and 10Y data for ${country.name}`)
          }
        } catch (error) {
          console.error(`Error loading ${country.name} bond data:`, error)
        }
      }
      
      console.log('Loaded bond data:', allBondData)
      setBondData(allBondData)
    } catch (error) {
      console.error('Error loading bond yield data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Auto-refresh effect
  useEffect(() => {
    loadBondData()
    
    if (autoRefresh) {
      const interval = setInterval(loadBondData, 30000) // Refresh every 30 seconds
      return () => clearInterval(interval)
    }
  }, [autoRefresh])

  // Prepare chart data
  const chartData = useMemo(() => {
    return bondData
      .filter(item => selectedCountries.includes(item.country))
      .map(item => ({
        country: item.country,
        '2Y': item.yield2Y,
        '10Y': item.yield10Y,
        spread: item.spread,
        flag: item.flag
      }))
  }, [bondData, selectedCountries])

  // Statistics
  const stats = useMemo(() => {
    if (bondData.length === 0) return null
    
    const yields2Y = bondData.map(d => d.yield2Y)
    const yields10Y = bondData.map(d => d.yield10Y)
    const spreads = bondData.map(d => d.spread)
    
    return {
      avg2Y: (yields2Y.reduce((a, b) => a + b, 0) / yields2Y.length).toFixed(3),
      avg10Y: (yields10Y.reduce((a, b) => a + b, 0) / yields10Y.length).toFixed(3),
      avgSpread: (spreads.reduce((a, b) => a + b, 0) / spreads.length).toFixed(3),
      maxSpread: Math.max(...spreads).toFixed(3),
      minSpread: Math.min(...spreads).toFixed(3),
      maxSpreadCountry: bondData.find(d => d.spread === Math.max(...spreads))?.country,
      minSpreadCountry: bondData.find(d => d.spread === Math.min(...spreads))?.country
    }
  }, [bondData])

  const handleCountryToggle = (countryName) => {
    setSelectedCountries(prev => 
      prev.includes(countryName)
        ? prev.filter(c => c !== countryName)
        : [...prev, countryName]
    )
  }

  const formatYield = (value) => `${value}%`
  const formatSpread = (value) => `${value > 0 ? '+' : ''}${value}%`

  return (
    <div className="bond-yields-chart">
      <div className="bond-yields-header">
        <div className="chart-title-section">
          <h3>Government Bond Yields (2Y vs 10Y)</h3>
          <div className="chart-controls">
            <button 
              className="refresh-btn" 
              onClick={loadBondData}
              disabled={loading}
            >
              {loading ? '🔄' : '↻'} Refresh
            </button>
            <label className="auto-refresh-label">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh
            </label>
          </div>
        </div>
        
        <div className="country-selector">
          <span>Select Countries:</span>
          {countries.map(country => (
            <label key={country.name} className="country-checkbox">
              <input
                type="checkbox"
                checked={selectedCountries.includes(country.name)}
                onChange={() => handleCountryToggle(country.name)}
              />
              {country.flag} {country.name}
            </label>
          ))}
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
          No bond yield data available
        </div>
      )}

      {!loading && bondData.length > 0 && (
        <>
          <div className="bond-yields-charts">
            {/* Yield Comparison Chart */}
            <div className="chart-container">
              <h4>Bond Yields Comparison</h4>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="country"
                    tick={{ fontSize: 12 }}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis 
                    label={{ value: 'Yield (%)', angle: -90, position: 'insideLeft' }}
                    domain={['dataMin - 0.2', 'dataMax + 0.2']}
                    tickFormatter={formatYield}
                  />
                  <Tooltip 
                    formatter={(value, name) => [formatYield(value), name]}
                    labelFormatter={(label) => `${bondData.find(d => d.country === label)?.flag} ${label}`}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="2Y" 
                    stroke="#8884d8" 
                    strokeWidth={3}
                    dot={{ fill: '#8884d8', strokeWidth: 2, r: 6 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="10Y" 
                    stroke="#82ca9d" 
                    strokeWidth={3}
                    dot={{ fill: '#82ca9d', strokeWidth: 2, r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Yield Spread Chart */}
            <div className="chart-container">
              <h4>Yield Curve Spread (10Y - 2Y)</h4>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="country"
                    tick={{ fontSize: 12 }}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis 
                    label={{ value: 'Spread (%)', angle: -90, position: 'insideLeft' }}
                    tickFormatter={formatSpread}
                  />
                  <Tooltip 
                    formatter={(value) => [formatSpread(value), 'Yield Spread']}
                    labelFormatter={(label) => `${bondData.find(d => d.country === label)?.flag} ${label}`}
                  />
                  <ReferenceLine y={0} stroke="#666" strokeDasharray="5 5" />
                  <Line 
                    type="monotone" 
                    dataKey="spread" 
                    stroke="#ff7300" 
                    strokeWidth={3}
                    dot={{ fill: '#ff7300', strokeWidth: 2, r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bond Data Table */}
          <div className="bond-data-table">
            <h4>Current Bond Yields</h4>
            <table>
              <thead>
                <tr>
                  <th>Country</th>
                  <th>2Y Yield</th>
                  <th>2Y Change</th>
                  <th>10Y Yield</th>
                  <th>10Y Change</th>
                  <th>Spread (10Y-2Y)</th>
                  <th>Last Update</th>
                </tr>
              </thead>
              <tbody>
                {bondData
                  .filter(item => selectedCountries.includes(item.country))
                  .map(item => (
                  <tr key={item.country}>
                    <td className="country-cell">
                      {item.flag} {item.country}
                    </td>
                    <td className="yield-cell">
                      {formatYield(item.yield2Y.toFixed(3))}
                    </td>
                    <td className={`change-cell ${item.change2Y >= 0 ? 'positive' : 'negative'}`}>
                      {item.change2Y >= 0 ? '+' : ''}{item.change2Y.toFixed(3)}%
                    </td>
                    <td className="yield-cell">
                      {formatYield(item.yield10Y.toFixed(3))}
                    </td>
                    <td className={`change-cell ${item.change10Y >= 0 ? 'positive' : 'negative'}`}>
                      {item.change10Y >= 0 ? '+' : ''}{item.change10Y.toFixed(3)}%
                    </td>
                    <td className={`spread-cell ${item.spread >= 0 ? 'positive-spread' : 'inverted-spread'}`}>
                      {formatSpread(item.spread.toFixed(3))}
                    </td>
                    <td className="update-cell">
                      {item.lastUpdate}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Statistics Panel */}
          {stats && (
            <div className="bond-stats-panel">
              <h4>Market Statistics</h4>
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-label">Average 2Y Yield:</span>
                  <span className="stat-value">{stats.avg2Y}%</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Average 10Y Yield:</span>
                  <span className="stat-value">{stats.avg10Y}%</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Average Spread:</span>
                  <span className="stat-value">{stats.avgSpread}%</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Steepest Curve:</span>
                  <span className="stat-value">{stats.maxSpreadCountry} ({stats.maxSpread}%)</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Flattest Curve:</span>
                  <span className="stat-value">{stats.minSpreadCountry} ({stats.minSpread}%)</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default BondYieldsChart