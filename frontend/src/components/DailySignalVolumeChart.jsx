import React, { useState, useEffect } from 'react'
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
import axios from 'axios'
import FullscreenChartModal from './FullscreenChartModal'

// Use environment variable or default to production URL
const API_URL = import.meta.env.VITE_TRADING_API_URL || 'http://167.172.215.78:8000'

const DailySignalVolumeChart = ({ days = 30 }) => {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    fetchSnapshotData()
  }, [days])

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

  const fetchSnapshotData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch snapshots
      const snapshotsResponse = await axios.get(
        `${API_URL}/api/signals/daily-snapshots?days=${days}&limit=${days}`
      )

      // Fetch stats
      const statsResponse = await axios.get(
        `${API_URL}/api/signals/daily-snapshots/stats?days=${days}`
      )

      const snapshots = snapshotsResponse.data.snapshots || []
      
      // Transform data for stacked bar chart
      // Reverse to show oldest first (left to right)
      const chartData = snapshots.reverse().map(snapshot => ({
        date: new Date(snapshot.snapshot_date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        }),
        fullDate: new Date(snapshot.snapshot_date).toLocaleDateString(),
        bullish: snapshot.bullish_count,
        neutral: snapshot.neutral_count,
        bearish: snapshot.bearish_count,
        total: snapshot.total_symbols
      }))

      setData(chartData)
      setStats(statsResponse.data)
      setLoading(false)
    } catch (err) {
      console.error('Error fetching snapshot data:', err)
      setError(err.message)
      setLoading(false)
    }
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const total = payload[0].payload.total
      const bullish = payload[0].payload.bullish
      const neutral = payload[0].payload.neutral
      const bearish = payload[0].payload.bearish

      return (
        <div className="bg-gray-800 border border-gray-600 rounded-lg p-3 shadow-lg">
          <p className="text-white font-semibold mb-2">{payload[0].payload.fullDate}</p>
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 bg-green-500 rounded"></span>
                <span className="text-gray-300">Bullish:</span>
              </span>
              <span className="text-white font-medium">
                {bullish} ({((bullish / total) * 100).toFixed(1)}%)
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 bg-gray-400 rounded"></span>
                <span className="text-gray-300">Neutral:</span>
              </span>
              <span className="text-white font-medium">
                {neutral} ({((neutral / total) * 100).toFixed(1)}%)
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 bg-red-500 rounded"></span>
                <span className="text-gray-300">Bearish:</span>
              </span>
              <span className="text-white font-medium">
                {bearish} ({((bearish / total) * 100).toFixed(1)}%)
              </span>
            </div>
            <div className="pt-2 mt-2 border-t border-gray-600">
              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-300">Total:</span>
                <span className="text-white font-bold">{total}</span>
              </div>
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  const getTrendEmoji = (trend) => {
    switch (trend) {
      case 'INCREASINGLY_BULLISH':
        return '📈'
      case 'INCREASINGLY_BEARISH':
        return '📉'
      case 'STABLE':
        return '➡️'
      default:
        return '❓'
    }
  }

  const getTrendColor = (trend) => {
    switch (trend) {
      case 'INCREASINGLY_BULLISH':
        return 'text-green-400'
      case 'INCREASINGLY_BEARISH':
        return 'text-red-400'
      case 'STABLE':
        return 'text-gray-400'
      default:
        return 'text-gray-400'
    }
  }

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-400">Loading signal volume data...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
        <div className="flex items-center justify-center h-64">
          <div className="text-red-400">Error: {error}</div>
        </div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-400">
            No signal data available. Wait for the daily 5pm EST capture.
          </div>
        </div>
      </div>
    )
  }

  const renderChartContent = () => (
    <>
      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 bg-green-500 rounded"></span>
              <span className="text-sm text-gray-300">Avg Bullish</span>
            </div>
            <div className="text-2xl font-bold text-green-400">
              {stats.avg_bullish}
            </div>
          </div>
          <div className="bg-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 bg-gray-400 rounded"></span>
              <span className="text-sm text-gray-300">Avg Neutral</span>
            </div>
            <div className="text-2xl font-bold text-gray-300">
              {stats.avg_neutral}
            </div>
          </div>
          <div className="bg-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 bg-red-500 rounded"></span>
              <span className="text-sm text-gray-300">Avg Bearish</span>
            </div>
            <div className="text-2xl font-bold text-red-400">
              {stats.avg_bearish}
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={400}>
        <BarChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="date"
            stroke="#9CA3AF"
            angle={-45}
            textAnchor="end"
            height={80}
            tick={{ fill: '#9CA3AF', fontSize: 12 }}
          />
          <YAxis
            stroke="#9CA3AF"
            tick={{ fill: '#9CA3AF' }}
            label={{
              value: 'Number of Symbols',
              angle: -90,
              position: 'insideLeft',
              style: { fill: '#9CA3AF' }
            }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }} />
          <Legend
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="square"
          />
          
          {/* Stacked bars: Bullish (bottom), Neutral (middle), Bearish (top) */}
          <Bar
            dataKey="bullish"
            stackId="a"
            fill="#10B981"
            name="Bullish"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="neutral"
            stackId="a"
            fill="#9CA3AF"
            name="Neutral"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="bearish"
            stackId="a"
            fill="#EF4444"
            name="Bearish"
            radius={[8, 8, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>

      {/* Footer Info */}
      <div className="mt-4 pt-4 border-t border-gray-700">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>
            📊 Showing {data.length} days of data
          </span>
          <span>
            Last updated: {data[data.length - 1]?.fullDate || 'N/A'}
          </span>
        </div>
      </div>
    </>
  )

  return (
    <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white mb-1">
              Daily Signal Volume
            </h2>
            <button 
              className="zoom-chart-btn-volume"
              onClick={() => setIsFullscreen(true)}
              title="View Fullscreen"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-400">
            Captured daily at 5:00 PM EST
          </p>
        </div>
        {stats && (
          <div className="text-right">
            <div className={`text-2xl font-bold ${getTrendColor(stats.trend)}`}>
              {getTrendEmoji(stats.trend)} {stats.trend.replace(/_/g, ' ')}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {stats.days}-day trend
            </div>
          </div>
        )}
      </div>

      {renderChartContent()}

      {/* Fullscreen Modal */}
      <FullscreenChartModal
        isOpen={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        title="Daily Signal Volume"
      >
        {renderChartContent()}
      </FullscreenChartModal>
    </div>
  )
}

export default DailySignalVolumeChart
