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
  Scatter,
  ScatterChart,
  ComposedChart,
  ReferenceDot
} from 'recharts'
import FullscreenChartModal from './FullscreenChartModal'
import './SignalChart.css'

const SignalChart = ({ signalHistory, symbol }) => {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const chartData = useMemo(() => {
    if (!signalHistory || signalHistory.length === 0) return []

    // Sort signals by timestamp
    const sorted = [...signalHistory].sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
    )

    // Transform data for the chart
    return sorted.map((signal, index) => {
      const date = new Date(signal.timestamp)
      return {
        index: index + 1,
        timestamp: signal.timestamp,
        dateLabel: date.toLocaleDateString() + ' ' + date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
        price: signal.price || 0,
        signal_type: signal.signal_type,
        rsi: signal.rsi,
        ema_200: signal.ema_200,
        // Mark buy/sell signals
        buySignal: signal.signal_type === 'EMA_CROSS_ABOVE' ? signal.price : null,
        sellSignal: signal.signal_type === 'EMA_CROSS_BELOW' ? signal.price : null,
      }
    })
  }, [signalHistory])

  const stats = useMemo(() => {
    if (chartData.length === 0) return null

    const prices = chartData.map(d => d.price).filter(p => p > 0)
    const buySignals = chartData.filter(d => d.buySignal !== null)
    const sellSignals = chartData.filter(d => d.sellSignal !== null)

    return {
      totalSignals: chartData.length,
      buySignals: buySignals.length,
      sellSignals: sellSignals.length,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      currentPrice: prices[prices.length - 1],
      priceChange: prices.length > 1 ? 
        ((prices[prices.length - 1] - prices[0]) / prices[0] * 100).toFixed(2) : 0
    }
  }, [chartData])

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null

    const data = payload[0].payload
    return (
      <div className="custom-tooltip">
        <p className="tooltip-time">{data.dateLabel}</p>
        <p className="tooltip-price">
          <strong>Price:</strong> ${data.price?.toFixed(4)}
        </p>
        {data.ema_200 && (
          <p className="tooltip-ema">
            <strong>EMA 200:</strong> {data.ema_200.toFixed(4)}
          </p>
        )}
        {data.rsi && (
          <p className="tooltip-rsi">
            <strong>RSI:</strong> {data.rsi.toFixed(2)}
          </p>
        )}
        <p className={`tooltip-signal signal-${data.signal_type?.toLowerCase().includes('above') ? 'buy' : 'sell'}`}>
          <strong>Signal:</strong> {data.signal_type}
        </p>
      </div>
    )
  }

  const CustomDot = (props) => {
    const { cx, cy, payload } = props
    
    if (payload.buySignal !== null) {
      // Buy signal - green arrow up
      return (
        <g>
          <circle cx={cx} cy={cy} r={8} fill="#10b981" stroke="#fff" strokeWidth={2} />
          <text x={cx} y={cy + 5} textAnchor="middle" fill="#fff" fontSize={14} fontWeight="bold">
            ↑
          </text>
        </g>
      )
    }
    
    if (payload.sellSignal !== null) {
      // Sell signal - red arrow down
      return (
        <g>
          <circle cx={cx} cy={cy} r={8} fill="#ef4444" stroke="#fff" strokeWidth={2} />
          <text x={cx} y={cy + 5} textAnchor="middle" fill="#fff" fontSize={14} fontWeight="bold">
            ↓
          </text>
        </g>
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

  if (!chartData || chartData.length === 0) {
    return (
      <div className="chart-empty">
        <p>No data available to display chart</p>
      </div>
    )
  }

  const renderChartContent = () => (
    <>
      {/* Statistics Summary */}
      {stats && (
        <div className="chart-stats">
          <div className="stat-item">
            <span className="stat-label">Total Signals:</span>
            <span className="stat-value">{stats.totalSignals}</span>
          </div>
          <div className="stat-item buy">
            <span className="stat-label">🟢 Buy Signals:</span>
            <span className="stat-value">{stats.buySignals}</span>
          </div>
          <div className="stat-item sell">
            <span className="stat-label">🔴 Sell Signals:</span>
            <span className="stat-value">{stats.sellSignals}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Price Range:</span>
            <span className="stat-value">
              ${stats.minPrice?.toFixed(4)} - ${stats.maxPrice?.toFixed(4)}
            </span>
          </div>
          <div className={`stat-item ${stats.priceChange >= 0 ? 'positive' : 'negative'}`}>
            <span className="stat-label">Change:</span>
            <span className="stat-value">
              {stats.priceChange >= 0 ? '+' : ''}{stats.priceChange}%
            </span>
          </div>
        </div>
      )}

      {/* Price Chart */}
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="dateLabel" 
            angle={-45} 
            textAnchor="end" 
            height={80}
            tick={{ fill: '#9ca3af', fontSize: 11 }}
          />
          <YAxis 
            domain={['auto', 'auto']}
            tick={{ fill: '#9ca3af' }}
            label={{ value: 'Price ($)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="line"
          />
          
          {/* Price Line */}
          <Line 
            type="monotone" 
            dataKey="price" 
            stroke="#3b82f6" 
            strokeWidth={2}
            dot={false}
            name="Price"
            activeDot={{ r: 6 }}
          />
          
          {/* EMA 200 Line (if available) */}
          {chartData.some(d => d.ema_200) && (
            <Line 
              type="monotone" 
              dataKey="ema_200" 
              stroke="#8b5cf6" 
              strokeWidth={1.5}
              strokeDasharray="5 5"
              dot={false}
              name="EMA 200"
            />
          )}
          
          {/* Buy Signals (Green Arrows) */}
          <Scatter 
            dataKey="buySignal" 
            fill="#10b981" 
            shape={<CustomDot />}
            name="Buy Signal"
          />
          
          {/* Sell Signals (Red Arrows) */}
          <Scatter 
            dataKey="sellSignal" 
            fill="#ef4444" 
            shape={<CustomDot />}
            name="Sell Signal"
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="chart-legend">
        <div className="legend-item">
          <div className="legend-marker buy-marker">↑</div>
          <span>EMA Cross Above (Buy Signal)</span>
        </div>
        <div className="legend-item">
          <div className="legend-marker sell-marker">↓</div>
          <span>EMA Cross Below (Sell Signal)</span>
        </div>
        <div className="legend-item">
          <div className="legend-line price-line"></div>
          <span>Price Movement</span>
        </div>
        {chartData.some(d => d.ema_200) && (
          <div className="legend-item">
            <div className="legend-line ema-line"></div>
            <span>EMA 200</span>
          </div>
        )}
      </div>
    </>
  )

  return (
    <div className="signal-chart-container">
      <div className="signal-chart-header">
        <h3 className="signal-chart-title">Signal History - {symbol}</h3>
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
      
      {renderChartContent()}

      {/* Fullscreen Modal */}
      <FullscreenChartModal
        isOpen={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        title={`Signal History - ${symbol}`}
      >
        {renderChartContent()}
      </FullscreenChartModal>
    </div>
  )
}

export default SignalChart
