import React, { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts'
import './InterestRateChart.css'

const InterestRateChart = ({ interestRateData, loading, onRefresh }) => {
  const chartData = useMemo(() => {
    if (!interestRateData || interestRateData.length === 0) return []

    // Get the latest data for each country
    const countryData = {}
    
    // Map countries to their currencies
    const countryToCurrency = {
      'Canada': 'CAD',
      'United States': 'USD',
      'Germany': 'EUR',
      'Australia': 'AUD',
      'United Kingdom': 'GBP',
      'Japan': 'JPY'
    }
    
    interestRateData.forEach(item => {
      const country = item.Country
      const dateTime = new Date(item.DateTime)
      
      if (!countryData[country] || new Date(countryData[country].DateTime) < dateTime) {
        countryData[country] = item
      }
    })

    // Convert to chart format
    return Object.values(countryData).map(item => ({
      country: item.Country,
      currency: countryToCurrency[item.Country] || '',
      rate: item.Value,
      symbol: item.HistoricalDataSymbol,
      lastUpdate: new Date(item.LastUpdate).toLocaleDateString(),
      dateTime: new Date(item.DateTime).toLocaleDateString(),
      displayName: `${item.Country} (${countryToCurrency[item.Country] || ''})`
    })).sort((a, b) => b.rate - a.rate) // Sort by rate descending

  }, [interestRateData])

  const getBarColor = (rate) => {
    if (rate >= 4.5) return '#e74c3c' // Red for high rates
    if (rate >= 3.0) return '#f39c12' // Orange for medium rates
    if (rate >= 1.0) return '#f1c40f' // Yellow for low rates
    return '#27ae60' // Green for very low rates
  }

  const customTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="custom-tooltip">
          <p className="tooltip-label">{`${data.country} (${data.currency})`}</p>
          <p className="tooltip-rate">{`Interest Rate: ${data.rate}%`}</p>
          <p className="tooltip-symbol">{`Symbol: ${data.symbol}`}</p>
          <p className="tooltip-date">{`Date: ${data.dateTime}`}</p>
          <p className="tooltip-update">{`Last Update: ${data.lastUpdate}`}</p>
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="interest-rate-chart">
        <div className="chart-header">
          <h2>Central Bank Interest Rates</h2>
          <div className="chart-header-actions">
            <p className="chart-subtitle">Loading interest rate data...</p>
            {onRefresh && (
              <button 
                className="refresh-button"
                onClick={onRefresh}
                disabled={true}
                title="Refresh interest rate data"
              >
                <span className="refresh-icon spinning">⟳</span>
                Refreshing...
              </button>
            )}
          </div>
        </div>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading interest rates...</p>
        </div>
      </div>
    )
  }

  if (chartData.length === 0) {
    return (
      <div className="interest-rate-chart">
        <div className="chart-header">
          <h2>Central Bank Interest Rates</h2>
          <p className="chart-subtitle">Current interest rates by country</p>
        </div>
        <div className="no-data">
          <p>No interest rate data available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="interest-rate-chart">
      <div className="chart-header">
        <h2>Central Bank Interest Rates</h2>
        <div className="chart-header-actions">
          <p className="chart-subtitle">Current interest rates by country</p>
          {onRefresh && (
            <button 
              className="refresh-button"
              onClick={onRefresh}
              disabled={loading}
              title="Refresh interest rate data"
            >
              <span className={`refresh-icon ${loading ? 'spinning' : ''}`}>⟳</span>
              Refresh
            </button>
          )}
        </div>
      </div>
      
      <div className="chart-stats">
        <div className="stat-item">
          <span className="stat-label">Countries:</span>
          <span className="stat-value">{chartData.length}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Highest:</span>
          <span className="stat-value">{chartData[0]?.rate}% ({chartData[0]?.currency})</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Lowest:</span>
          <span className="stat-value">{chartData[chartData.length - 1]?.rate}% ({chartData[chartData.length - 1]?.currency})</span>
        </div>
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={chartData}
            margin={{
              top: 20,
              right: 30,
              left: 20,
              bottom: 60
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="displayName" 
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={100}
              interval={0}
            />
            <YAxis 
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              label={{ value: 'Interest Rate (%)', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip content={customTooltip} />
            <Legend />
            <Bar 
              dataKey="rate" 
              name="Interest Rate (%)"
              radius={[4, 4, 0, 0]}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.rate)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-legend">
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#e74c3c' }}></div>
          <span>High (≥4.5%)</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#f39c12' }}></div>
          <span>Medium (3.0-4.5%)</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#f1c40f' }}></div>
          <span>Low (1.0-3.0%)</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#27ae60' }}></div>
          <span>Very Low (&lt;1.0%)</span>
        </div>
      </div>
    </div>
  )
}

export default InterestRateChart