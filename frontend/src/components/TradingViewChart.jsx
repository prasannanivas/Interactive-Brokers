import React, { useEffect, useRef, useState } from 'react'
import { createChart } from 'lightweight-charts'
import { historyAPI } from '../api/api'
import FullscreenChartModal from './FullscreenChartModal'
import './TradingViewChart.css'

const TradingViewChart = ({ symbol, signalHistory }) => {
  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

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

  // Resize chart when fullscreen state changes
  useEffect(() => {
    const resizeChart = () => {
      if (chartContainerRef.current && chartRef.current) {
        setTimeout(() => {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: isFullscreen ? window.innerHeight - 150 : 500,
          })
          chartRef.current.timeScale().fitContent()
        }, 100)
      }
    }
    
    if (!loading && !error) {
      resizeChart()
    }
  }, [isFullscreen, loading, error])

  useEffect(() => {
    if (!symbol) {
      setLoading(false)
      return
    }

    const fetchAndDisplayChart = async () => {
      setLoading(true)
      setError(null)

      try {
        // Wait for container ref to be available
        let retries = 0
        while (!chartContainerRef.current && retries < 10) {
          await new Promise(resolve => setTimeout(resolve, 100))
          retries++
        }

        if (!chartContainerRef.current) {
          setError('Chart container not ready')
          setLoading(false)
          return
        }

        // Calculate days from first signal to now
        let days = 7
        if (signalHistory && signalHistory.length > 0) {
          const firstSignalDate = new Date(signalHistory[signalHistory.length - 1].timestamp)
          const now = new Date()
          days = Math.ceil((now - firstSignalDate) / (1000 * 60 * 60 * 24)) + 1
          days = Math.min(days, 30)
        }

        // Fetch historical price data from Massive API
        const response = await historyAPI.getPriceHistory(symbol, days)
        const candles = response.data.candles

        if (!candles || candles.length === 0) {
          setError('No price history available from Massive API')
          setLoading(false)
          return
        }

        // Re-check if container still exists after async operation
        if (!chartContainerRef.current) {
          setError('Chart container unavailable')
          setLoading(false)
          return
        }

        // Create chart with v4.x API
        const chart = createChart(chartContainerRef.current, {
          localization: {
            timeFormatter: (time) => {
              if (typeof time === 'object' && time !== null) {
                // BusinessDay {year, month, day}
                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                return `${months[time.month - 1]} ${time.day}, ${time.year}`
              }
              if (typeof time === 'string') {
                const [year, month, day] = time.split('-')
                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`
              }
              // UTCTimestamp (number) — hourly bars
              const d = new Date(time * 1000)
              if (isNaN(d.getTime())) return String(time)
              return d.toLocaleString('en-US', {
                timeZone: 'America/New_York',
                month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: false
              }) + ' ET'
            }
          },
          layout: {
            backgroundColor: '#1f2937',
            textColor: '#d1d5db',
          },
          grid: {
            vertLines: { color: '#374151' },
            horzLines: { color: '#374151' },
          },
          crosshair: {
            mode: 1,
          },
          rightPriceScale: {
            borderColor: '#4b5563',
          },
          timeScale: {
            borderColor: '#4b5563',
            timeVisible: true,
            secondsVisible: false,
          },
          width: chartContainerRef.current.clientWidth,
          height: 500,
        })

        chartRef.current = chart

        // Add candlestick series with v4.x API
        const candlestickSeries = chart.addCandlestickSeries({
          upColor: '#10b981',
          downColor: '#ef4444',
          borderVisible: true,
          wickUpColor: '#10b981',
          wickDownColor: '#ef4444',
        })

        // Sort candles by time (ascending order required) - handles both 'YYYY-MM-DD' strings and Unix-second numbers
        const sortedCandles = [...candles]
          .sort((a, b) => typeof a.time === 'string' ? a.time.localeCompare(b.time) : a.time - b.time)
          .filter(candle => {
            // Filter out weekend candles (Saturday=6, Sunday=0)
            const date = typeof candle.time === 'string'
              ? new Date(candle.time + 'T00:00:00Z')
              : new Date(candle.time * 1000)
            const day = date.getUTCDay()
            return day !== 0 && day !== 6
          })
        
        // Set candlestick data
        candlestickSeries.setData(sortedCandles)

        // Calculate and add 200 EMA line (optimized)
        const ema200Data = []
        const period = 200
        const multiplier = 2 / (period + 1)
        
        if (sortedCandles.length >= period) {
          // Calculate initial SMA for first 200 periods
          let smaSum = 0
          for (let i = 0; i < period; i++) {
            smaSum += sortedCandles[i].close
          }
          let ema = smaSum / period
          
          // Add the first EMA point
          ema200Data.push({ time: sortedCandles[period - 1].time, value: ema })
          
          // Calculate EMA for remaining periods
          for (let i = period; i < sortedCandles.length; i++) {
            ema = (sortedCandles[i].close - ema) * multiplier + ema
            ema200Data.push({ time: sortedCandles[i].time, value: ema })
          }
        }
        
        // Add 200 EMA line series
        const ema200Series = chart.addLineSeries({
          color: '#f59e0b',
          lineWidth: 2,
          title: '200 EMA',
          priceLineVisible: false,
          lastValueVisible: true,
        })
        ema200Series.setData(ema200Data)

        // Add signal markers if available
        if (signalHistory && signalHistory.length > 0) {
          const markers = signalHistory
            .filter(s => s.price && s.timestamp)
            .map(signal => {
              const timestamp = Math.floor(new Date(signal.timestamp).getTime() / 1000)
              const isBuySignal = signal.signal_type === 'EMA_CROSS_ABOVE'
              
              return {
                time: timestamp,
                position: isBuySignal ? 'belowBar' : 'aboveBar',
                color: isBuySignal ? '#10b981' : '#ef4444',
                shape: isBuySignal ? 'arrowUp' : 'arrowDown',
                text: isBuySignal ? 'BUY' : 'SELL',
                size: 2,
              }
            })
            .sort((a, b) => a.time - b.time)
          
          candlestickSeries.setMarkers(markers)
        }

        // Calculate statistics
        const prices = sortedCandles.map(c => c.close)
        const buySignals = signalHistory?.filter(s => s.signal_type === 'EMA_CROSS_ABOVE') || []
        const sellSignals = signalHistory?.filter(s => s.signal_type === 'EMA_CROSS_BELOW') || []
        
        // Calculate high/low efficiently without spread operator
        let high = sortedCandles[0].high
        let low = sortedCandles[0].low
        for (let i = 1; i < sortedCandles.length; i++) {
          if (sortedCandles[i].high > high) high = sortedCandles[i].high
          if (sortedCandles[i].low < low) low = sortedCandles[i].low
        }
        
        // Set stats and loading false together
        setStats({
          totalCandles: sortedCandles.length,
          buySignals: buySignals.length,
          sellSignals: sellSignals.length,
          firstPrice: prices[0],
          lastPrice: prices[prices.length - 1],
          priceChange: ((prices[prices.length - 1] - prices[0]) / prices[0] * 100).toFixed(2),
          high: high,
          low: low,
        })
        setLoading(false)

        // Fit content after chart is visible (use setTimeout to ensure DOM update)
        setTimeout(() => {
          if (chartRef.current) {
            chart.timeScale().fitContent()
          }
        }, 0)

        // Handle resize
        const handleResize = () => {
          if (chartContainerRef.current && chartRef.current) {
            chartRef.current.applyOptions({
              width: chartContainerRef.current.clientWidth,
            })
          }
        }

        window.addEventListener('resize', handleResize)

        return () => {
          window.removeEventListener('resize', handleResize)
        }

      } catch (err) {
        console.error('Error fetching chart data:', err)
        setError(err.response?.data?.detail || err.message || 'Failed to load price data')
        setLoading(false)
      }
    }

    fetchAndDisplayChart()

  }, [symbol, signalHistory])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
    }
  }, [])

  console.log('TradingViewChart render - loading:', loading, 'error:', error, 'stats:', stats)

  const chartContent = (
    <>
      {/* Statistics Bar */}
      {stats && !loading && !error && (
        <div className="chart-stats-bar">
          <div className="stat-group">
            <span className="stat-label">Candles:</span>
            <span className="stat-value">{stats.totalCandles}</span>
          </div>
          <div className="stat-group">
            <span className="stat-label">Range:</span>
            <span className="stat-value">
              ${stats.low.toFixed(4)} - ${stats.high.toFixed(4)}
            </span>
          </div>
          <div className={`stat-group ${stats.priceChange >= 0 ? 'positive' : 'negative'}`}>
            <span className="stat-label">Change:</span>
            <span className="stat-value">
              {stats.priceChange >= 0 ? '+' : ''}{stats.priceChange}%
            </span>
          </div>
          <div className="stat-group buy">
            <span className="stat-label">🟢 Buy:</span>
            <span className="stat-value">{stats.buySignals}</span>
          </div>
          <div className="stat-group sell">
            <span className="stat-label">🔴 Sell:</span>
            <span className="stat-value">{stats.sellSignals}</span>
          </div>
          {!isFullscreen && (
            <button 
              className="chart-zoom-btn"
              onClick={() => setIsFullscreen(true)}
              title="Expand to fullscreen"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* TradingView Chart - Always rendered so ref is available */}
      <div 
        ref={chartContainerRef} 
        className="chart-wrapper"
        style={{ display: loading || error ? 'none' : 'block' }}
      />

      {/* Legend */}
      {stats && !loading && !error && (
        <div className="chart-legend">
          <div className="legend-row">
            <div className="legend-item">
              <div className="legend-candle up">
                <div className="candle-body"></div>
              </div>
              <span>Price Up (Green)</span>
            </div>
            <div className="legend-item">
              <div className="legend-candle down">
                <div className="candle-body"></div>
              </div>
              <span>Price Down (Red)</span>
            </div>
          </div>
          <div className="legend-row">
            <div className="legend-item">
              <div className="legend-marker buy-marker">▲</div>
              <span>Buy Signal (EMA Cross Above)</span>
            </div>
            <div className="legend-item">
              <div className="legend-marker sell-marker">▼</div>
              <span>Sell Signal (EMA Cross Below)</span>
            </div>
          </div>
        </div>
      )}

      {stats && !loading && !error && (
        <div className="chart-info">
          <p>💡 <strong>Live Data from Massive API:</strong> Real candlesticks with buy/sell signals. Drag to pan, scroll to zoom</p>
        </div>
      )}
    </>
  )

  return (
    <div className="tradingview-chart-container">
      {/* Loading State */}
      {loading && (
        <div className="chart-loading">
          <div className="loading-spinner"></div>
          <p>Loading price data from Massive API...</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="chart-error">
          <p>⚠️ {error}</p>
          <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginTop: '10px' }}>
            Check browser console for details
          </p>
        </div>
      )}

      {/* Normal View */}
      {!isFullscreen && chartContent}

      {/* Fullscreen Modal */}
      <FullscreenChartModal
        isOpen={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        title={`${symbol} - Price Chart with Signals`}
      >
        {chartContent}
      </FullscreenChartModal>
    </div>
  )
}

export default TradingViewChart
