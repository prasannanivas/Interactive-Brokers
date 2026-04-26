import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { tradingAPI, dataAPI, historyAPI, bondAPI } from '../api/api'
import TradingViewChart from '../components/TradingViewChart'
import ChartModal from '../components/ChartModal'
import CurrencyMatrix from '../components/CurrencyMatrix'
import InterestRateChart from '../components/InterestRateChart'
import CurrencyRateCorrelationChart from '../components/CurrencyRateCorrelationChart'
import BondYieldsChart from '../components/BondYieldsChart'
import ComprehensiveAnalysisChart from '../components/ComprehensiveAnalysisChart'
import DailySignalVolumeChart from '../components/DailySignalVolumeChart'
import ErrorBoundary from '../components/ErrorBoundary'
import LoginHistory from '../components/LoginHistory'
import './Dashboard.css'

const Dashboard = () => {
  const navigate = useNavigate()
  const { logout, user } = useAuth()
  const [status, setStatus] = useState({})
  const [watchlist, setWatchlist] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pairFilter, setPairFilter] = useState('')
  const [selectedSymbol, setSelectedSymbol] = useState(null)
  const [signalHistory, setSignalHistory] = useState([])
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [showChartModal, setShowChartModal] = useState(false)
  const [chartSymbol, setChartSymbol] = useState(null)
  const [signalMarkers, setSignalMarkers] = useState([]) // For marking signals on chart
  const [signalVolumeData, setSignalVolumeData] = useState([]) // For volume bars showing signal counts
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showColumnFilter, setShowColumnFilter] = useState(false)
  const [bollingerBands, setBollingerBands] = useState({
    upper: true,
    middle: true,
    lower: true
  })
  const [macdComponents, setMacdComponents] = useState({
    line: true,
    signal: true,
    histogram: true
  })
  const [showSignals, setShowSignals] = useState({
    ema100_hourly: true,
    rsi9_daily: true,
    ema9_daily: true,
    ema20_daily: true,
    ema50_daily: true,
    ema200_daily: true,
    macross_daily: true,
    macd_daily: true,
    bollinger_weekly: true,
    ema20_weekly: true
  })
  const [showTimestamps, setShowTimestamps] = useState({
    ema100_hourly: true,
    rsi9_daily: true,
    ema9_daily: true,
    ema20_daily: true,
    ema50_daily: true,
    ema200_daily: true,
    macross_daily: true,
    macd_daily: true,
    bollinger_weekly: true,
    ema20_weekly: true
  })
  const [interestRateData, setInterestRateData] = useState([])
  const [loadingInterestRates, setLoadingInterestRates] = useState(false)
  const [selectedCurrencyPair, setSelectedCurrencyPair] = useState('USDCAD')
  const [showLoginHistory, setShowLoginHistory] = useState(false)
  const wsRef = useRef(null)

  // Column configuration - all available columns
  const allColumns = [
    { id: 'symbol', label: 'Symbol', fixed: true },
    { id: 'price', label: 'Price', fixed: true },
    { id: 'signals', label: 'Signals', fixed: true },
    { id: 'ema100_hourly', label: 'EMA 100 (Hourly)', timeframe: '⏰ Hourly' },
    { id: 'rsi9_daily', label: 'RSI 9 (Daily)', timeframe: '📅 Daily' },
    { id: 'ema9_daily', label: 'EMA 9 (Daily)', timeframe: '📅 Daily' },
    { id: 'ema20_daily', label: 'EMA 20 (Daily)', timeframe: '📅 Daily' },
    { id: 'ema50_daily', label: 'EMA 50 (Daily)', timeframe: '📅 Daily' },
    { id: 'ema200_daily', label: 'EMA 200 (Daily)', timeframe: '📅 Daily' },
    { id: 'macross_daily', label: 'MA Cross (Daily)', timeframe: '📅 Daily' },
    { id: 'macd_daily', label: 'MACD (Daily)', timeframe: '📅 Daily' },
    { id: 'bollinger_weekly', label: 'Bollinger (Weekly)', timeframe: '📆 Weekly' },
    { id: 'ema20_weekly', label: 'EMA 20 (Weekly)', timeframe: '📆 Weekly' },
    { id: 'action', label: 'Action', fixed: true }
  ]

  // Load visible columns from localStorage or default to all
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('visibleColumns')
    if (saved) {
      try {
        const savedColumns = JSON.parse(saved)
        // Check if new bollinger_weekly column exists, if not add it
        const allColumnIds = allColumns.map(col => col.id)
        const missingColumns = allColumnIds.filter(id => !savedColumns.includes(id))
        if (missingColumns.length > 0) {
          // Add missing columns to saved list
          return [...savedColumns, ...missingColumns]
        }
        return savedColumns
      } catch {
        return allColumns.map(col => col.id)
      }
    }
    return allColumns.map(col => col.id)
  })

  // Save visible columns to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('visibleColumns', JSON.stringify(visibleColumns))
  }, [visibleColumns])

  const toggleColumn = (columnId) => {
    // Don't allow toggling fixed columns
    const column = allColumns.find(col => col.id === columnId)
    if (column?.fixed) return

    setVisibleColumns(prev => 
      prev.includes(columnId) 
        ? prev.filter(id => id !== columnId)
        : [...prev, columnId]
    )
  }

  const isColumnVisible = (columnId) => visibleColumns.includes(columnId)

  useEffect(() => {
    loadStatus()
    loadWatchlist()
    loadInterestRates()
    connectWebSocket()

    const statusInterval = setInterval(loadStatus, 10000)
    // Refresh interest rates every 30 minutes
    const interestRateInterval = setInterval(loadInterestRates, 30 * 60 * 1000)

    return () => {
      clearInterval(statusInterval)
      clearInterval(interestRateInterval)
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  const loadStatus = async () => {
    try {
      const response = await tradingAPI.getStatus()
      setStatus(response.data)
    } catch (error) {
      console.error('Failed to load status:', error)
    }
  }

  const loadWatchlist = async () => {
    console.log('📊 Loading watchlist data...')
    try {
      const response = await dataAPI.getWatchlist()
      console.log('Watchlist API response:', response)
      console.log('Response data type:', typeof response.data)
      console.log('Response data:', response.data)
      
      const watchlistData = response.data || []
      console.log('Setting watchlist with', watchlistData.length, 'items')
      
      if (watchlistData.length > 0) {
        console.log('First watchlist item:', watchlistData[0])
        console.log('First item has daily_indicators?', !!watchlistData[0]?.daily_indicators)
        console.log('First item has ema_9?', !!watchlistData[0]?.daily_indicators?.ema_9)
      }
      
      setWatchlist(watchlistData)
    } catch (error) {
      console.error('❌ Failed to load watchlist:', error)
    }
  }

  const loadInterestRates = async () => {
    setLoadingInterestRates(true)
    try {
      const response = await bondAPI.getInterestRates()
      setInterestRateData(response.data || [])
    } catch (error) {
      console.error('Failed to load interest rates:', error)
      setInterestRateData([])
    } finally {
      setLoadingInterestRates(false)
    }
  }

  const connectWebSocket = () => {
    const ws = new WebSocket('ws://localhost:8000/ws')

    ws.onopen = () => {
      console.log('WebSocket connected')
    }

    ws.onmessage = (event) => {
      // Ignore ping/pong messages
      if (event.data === 'pong' || event.data === 'ping') return
      
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'update') {
          loadWatchlist()
        }
      } catch (err) {
        console.error('WebSocket message parse error:', err)
      }
    }

    ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting...')
      setTimeout(connectWebSocket, 3000)
    }

    wsRef.current = ws

    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send('ping')
      }
    }, 30000)

    return () => {
      clearInterval(pingInterval)
      ws.close()
    }
  }

  const handleSearch = async (query) => {
    setSearchQuery(query)
    
    if (query.length < 1) {
      setShowSearchResults(false)
      return
    }

    try {
      const response = await dataAPI.searchSymbols(query)
      setSearchResults(response.data)
      setShowSearchResults(true)
    } catch (error) {
      console.error('Search failed:', error)
    }
  }

  const addSymbol = async (symbol, exchange = 'SMART', currency = 'USD') => {
    try {
      await dataAPI.addToWatchlist({ symbol, exchange, currency })
      setSearchQuery('')
      setShowSearchResults(false)
      loadWatchlist()
      loadStatus()
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to add symbol')
    }
  }

  const removeSymbol = async (symbol) => {
    if (!window.confirm(`Remove ${symbol.replace(/^C:/, '')} from watchlist?`)) return

    try {
      await dataAPI.removeFromWatchlist(symbol)
      loadWatchlist()
      loadStatus()
    } catch (error) {
      alert('Failed to remove symbol')
    }
  }

  const getSignalClass = (signal) => {
    if (!signal) return 'neutral'
    return signal.toLowerCase()
  }

  const viewSignalHistory = async (symbol, indicator = null) => {
    setSelectedSymbol(indicator ? `${symbol} - ${indicator}` : symbol)
    setShowHistoryModal(true)
    setLoadingHistory(true)

    try {
      const response = await historyAPI.getSignalChanges(symbol)
      let changes = response.data.changes || []
      
      // Filter by indicator if specified
      if (indicator) {
        console.log('Filtering for indicator:', indicator)
        console.log('Available indicators in response:', changes.map(c => c.indicator))
        
        changes = changes.filter(change => {
          const changeIndicator = change.indicator?.toLowerCase() || ''
          const targetIndicator = indicator.toLowerCase()
          
          // Normalize both strings by removing extra spaces and special characters
          const normalizeString = (str) => str.replace(/[\s()]/g, '_').replace(/_+/g, '_').trim()
          
          const normalizedChange = normalizeString(changeIndicator)
          const normalizedTarget = normalizeString(targetIndicator)
          
          // Try multiple matching strategies
          const exactMatch = normalizedChange === normalizedTarget
          const containsMatch = normalizedChange.includes(normalizedTarget) || normalizedTarget.includes(normalizedChange)
          
          // For EMA indicators, also try matching just the number and timeframe
          const emaMatch = changeIndicator.includes('ema') && targetIndicator.includes('ema') &&
                          changeIndicator.match(/\d+/) && targetIndicator.match(/\d+/) &&
                          changeIndicator.match(/\d+/)[0] === targetIndicator.match(/\d+/)[0]
          
          const matches = exactMatch || containsMatch || emaMatch
          
          if (matches) {
            console.log(`Match found: "${change.indicator}" matches "${indicator}"`)
          }
          
          return matches
        })
        
        console.log('Filtered changes count:', changes.length)
      }
      
      setSignalHistory(changes)
    } catch (error) {
      console.error('Failed to load signal changes:', error)
      setSignalHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }

  const closeHistoryModal = () => {
    setShowHistoryModal(false)
    setSelectedSymbol(null)
    setSignalHistory([])
  }

  const openChartModal = (symbol) => {
    setChartSymbol(symbol)
    setSignalMarkers([]) // Clear markers for regular chart view
    setSignalVolumeData([]) // Clear volume data
    setShowChartModal(true)
  }

  const closeChartModal = () => {
    setShowChartModal(false)
    setChartSymbol(null)
    setSignalMarkers([])
    setSignalVolumeData([])
  }

  // New function to handle matrix clicks - opens chart with signal markers
  const openChartWithSignals = async (symbol, signalType) => {
    console.log('🎯 Opening chart with signals:', { symbol, signalType })
    
    setChartSymbol(symbol)
    setShowChartModal(true)

    // Also sync the ComprehensiveAnalysisChart pair selector
    const normalised = symbol.startsWith('C:') ? symbol.slice(2) : symbol
    setSelectedCurrencyPair(normalised)
    
    try {
      // First, get the watchlist item for this symbol to check current signals
      const watchlistItem = watchlist.find(item => item.symbol === symbol)
      console.log('📊 Watchlist item:', watchlistItem)
      
      if (watchlistItem) {
        console.log('📊 Buy signals:', watchlistItem.buy_signals)
        console.log('📊 Sell signals:', watchlistItem.sell_signals)
      }
      
      // Fetch signal changes for this pair - get more history
      const response = await historyAPI.getSignalChanges(symbol, 500)
      const allChanges = response.data.changes || []
      
      console.log('📊 All signal changes count:', allChanges.length)
      console.log('📊 First 3 changes:', allChanges.slice(0, 3))
      
      // Count signal types for debugging
      const signalCounts = {
        BUY: allChanges.filter(c => c.new_signal === 'BUY').length,
        SELL: allChanges.filter(c => c.new_signal === 'SELL').length,
        NEUTRAL: allChanges.filter(c => !c.new_signal || c.new_signal === 'NEUTRAL').length
      }
      console.log('📊 Signal type counts:', signalCounts)
      console.log('📊 Full first change object:', JSON.stringify(allChanges[0], null, 2))
      
      // Get all unique 'to' values to see what we're working with
      const uniqueToValues = [...new Set(allChanges.map(c => c.to))]
      console.log('📊 Unique TO values:', uniqueToValues)
      
      // Check all available fields in the first change
      if (allChanges[0]) {
        console.log('📊 Available fields:', Object.keys(allChanges[0]))
      }
      
      // Normalize indicator name to match between API and watchlist
      // API: "MACD", "EMA 100", "RSI 9"
      // Watchlist: "MACD_Daily", "EMA_100_Hourly", "RSI_9_Daily"
      const normalizeIndicatorName = (apiIndicator, timeframe) => {
        // Remove spaces and convert to format: "INDICATOR_TIMEFRAME"
        const indicator = apiIndicator.replace(/\s+/g, '_').toUpperCase()
        const tf = timeframe ? timeframe.toUpperCase() : ''
        return `${indicator}_${tf.replace('LY', '')}` // "Daily" -> "DAILY" -> "DAIL" but we want exact match
      }
      
      // Group signals by day and count them for volume bars
      const dailySignalCounts = {}
      const dailyIndicatorSignals = {} // Group by day + indicator for deduplication
      
      // Process all changes and filter based on signal type
      allChanges.forEach((change, index) => {
        const newSignal = (change.new_signal || '').toUpperCase().trim()
        const oldSignal = (change.old_signal || '').toUpperCase().trim()
        const timestamp = change.timestamp
        
        let unixTime
        if (typeof timestamp === 'string') {
          unixTime = new Date(timestamp).getTime() / 1000
        } else if (typeof timestamp === 'number') {
          unixTime = timestamp > 10000000000 ? timestamp / 1000 : timestamp
        } else {
          return
        }
        
        // Get the start of the day (midnight) for grouping
        const date = new Date(unixTime * 1000)
        date.setHours(0, 0, 0, 0)
        const dayStart = date.getTime() / 1000
        
        if (index < 5) {
          console.log(`⏰ Processing signal #${index}:`, {
            indicator: change.indicator,
            timeframe: change.timeframe,
            oldSignal,
            newSignal,
            timestamp,
            date: new Date(unixTime * 1000).toLocaleString()
          })
        }
        
        // Count signals based on matrix type
        let shouldCount = false
        let markerConfig = null
        
        // For bullish matrix, count BUY signals (changed TO BUY)
        if (signalType === 'bullish' && newSignal === 'BUY') {
          shouldCount = true
          markerConfig = {
            time: dayStart, // Use day start for grouping
            position: 'belowBar',
            color: '#10b981',
            shape: 'arrowUp',
            text: `📈 ${change.indicator}`,
            indicator: change.indicator,
            timeframe: change.timeframe,
            oldSignal,
            newSignal
          }
          if (index < 10) console.log('✅ Counting BUY signal:', change.indicator, change.timeframe)
        }
        // For bearish matrix, count SELL signals (changed TO SELL)
        else if (signalType === 'bearish' && newSignal === 'SELL') {
          shouldCount = true
          markerConfig = {
            time: dayStart, // Use day start for grouping
            position: 'aboveBar',
            color: '#ef4444',
            shape: 'arrowDown',
            text: `📉 ${change.indicator}`,
            indicator: change.indicator,
            timeframe: change.timeframe,
            oldSignal,
            newSignal
          }
          if (index < 10) console.log('✅ Counting SELL signal:', change.indicator, change.timeframe)
        }
        // For neutral matrix, count all neutral signals (changed TO NEUTRAL or empty)
        else if (signalType === 'neutral' && (newSignal === 'NEUTRAL' || newSignal === '' || !newSignal)) {
          shouldCount = true
          markerConfig = {
            time: dayStart, // Use day start for grouping
            position: 'belowBar',
            color: '#9ca3af',
            shape: 'circle',
            text: `⚪ ${change.indicator}`,
            indicator: change.indicator,
            timeframe: change.timeframe,
            oldSignal,
            newSignal
          }
          if (index < 10) console.log('✅ Counting NEUTRAL signal:', change.indicator, change.timeframe)
        }
        
        if (shouldCount && markerConfig) {
          // Add to daily count for volume bars
          if (!dailySignalCounts[dayStart]) {
            dailySignalCounts[dayStart] = 0
          }
          dailySignalCounts[dayStart]++
          
          // Group by day + indicator to avoid duplicates
          const key = `${dayStart}_${change.indicator}_${change.timeframe}`
          if (!dailyIndicatorSignals[key]) {
            dailyIndicatorSignals[key] = markerConfig
          }
        }
      })
      
      // Convert grouped signals to markers array
      const markers = Object.values(dailyIndicatorSignals).sort((a, b) => a.time - b.time)
      
      // Convert to volume data format for chart
      const volumeData = Object.entries(dailySignalCounts)
        .map(([timestamp, count]) => ({
          time: parseInt(timestamp),
          value: count,
          color: signalType === 'bullish' ? '#10b98180' : signalType === 'bearish' ? '#ef444480' : '#9ca3af80'
        }))
        .sort((a, b) => a.time - b.time)
      
      console.log('📊 Daily signal counts:', dailySignalCounts)
      console.log('🎯 Volume data:', volumeData)
      console.log('🎯 Volume bars count:', volumeData.length)
      console.log('🎯 Individual markers (deduplicated):', markers.length)
      console.log('🎯 Total signals:', volumeData.reduce((sum, d) => sum + d.value, 0))
      
      setSignalVolumeData(volumeData)
      setSignalMarkers(markers) // Provide both for toggle option
      
    } catch (error) {
      console.error('Failed to load signal changes:', error)
      setSignalMarkers([])
    }
  }

  const formatDateTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  const formatSignalTime = (timestamp) => {
    if (!timestamp) return null
    const date = new Date(timestamp)
    
    // Format: DD/MM/YYYY HH:mm:ss
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
  }

  const detectSignalChanges = (currentRecord, previousRecord) => {
    if (!previousRecord) return null // First record, show all
    
    const changes = []
    
    // Helper to check and record changes
    const checkIndicatorChange = (name, currentIndicator, previousIndicator, timeframe) => {
      if (!currentIndicator || !previousIndicator) return
      
      const currentSignal = currentIndicator.signal
      const previousSignal = previousIndicator.signal
      
      if (currentSignal !== previousSignal) {
        changes.push({
          name,
          timeframe,
          from: previousSignal || 'Neutral',
          to: currentSignal || 'Neutral',
          value: currentIndicator.ema_value || currentIndicator.rsi_value || currentIndicator.sma_value || null
        })
      }
    }
    
    // Check hourly indicators
    if (currentRecord.hourly_indicators && previousRecord.hourly_indicators) {
      checkIndicatorChange('EMA 100', 
        currentRecord.hourly_indicators.ema_100, 
        previousRecord.hourly_indicators.ema_100, 
        'Hourly')
    }
    
    // Check daily indicators
    if (currentRecord.daily_indicators && previousRecord.daily_indicators) {
      checkIndicatorChange('Bollinger Bands', 
        currentRecord.daily_indicators.bollinger_band, 
        previousRecord.daily_indicators.bollinger_band, 
        'Daily')
      checkIndicatorChange('RSI (9)', 
        currentRecord.daily_indicators.rsi_9, 
        previousRecord.daily_indicators.rsi_9, 
        'Daily')
      checkIndicatorChange('EMA 9', 
        currentRecord.daily_indicators.ema_9, 
        previousRecord.daily_indicators.ema_9, 
        'Daily')
      checkIndicatorChange('EMA 20', 
        currentRecord.daily_indicators.ema_20, 
        previousRecord.daily_indicators.ema_20, 
        'Daily')
      checkIndicatorChange('EMA 50', 
        currentRecord.daily_indicators.ema_50, 
        previousRecord.daily_indicators.ema_50, 
        'Daily')
      checkIndicatorChange('EMA 200', 
        currentRecord.daily_indicators.ema_200, 
        previousRecord.daily_indicators.ema_200, 
        'Daily')
      checkIndicatorChange('MA Crossover', 
        currentRecord.daily_indicators.ma_crossover, 
        previousRecord.daily_indicators.ma_crossover, 
        'Daily')
      checkIndicatorChange('MACD', 
        currentRecord.daily_indicators.macd, 
        previousRecord.daily_indicators.macd, 
        'Daily')
    }
    
    // Check weekly indicators
    if (currentRecord.weekly_indicators && previousRecord.weekly_indicators) {
      checkIndicatorChange('EMA 20', 
        currentRecord.weekly_indicators.ema_20, 
        previousRecord.weekly_indicators.ema_20, 
        'Weekly')
    }
    
    return changes
  }

  const countNeutralSignals = (item) => {
    // Total indicators we're tracking
    const totalIndicators = 10 // EMA 100 (Hourly), RSI, EMA 9, EMA 20, EMA 50, EMA 200, MA Cross, MACD (Daily), Bollinger, EMA 20 (Weekly)
    const buyCount = item.buy_signals?.length || 0
    const sellCount = item.sell_signals?.length || 0
    return totalIndicators - buyCount - sellCount
  }

  // Filter watchlist based on search
  const filteredWatchlist = watchlist.filter(item => 
    item.symbol.toLowerCase().includes(pairFilter.toLowerCase())
  )

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h1>Trading Signal Monitor</h1>
          <p className="welcome-text">Real-time Forex Trading Signals</p>
        </div>
        <div className="user-actions">
          <button className="login-history-btn" onClick={() => setShowLoginHistory(true)} title="View Login History">
            📋 History
          </button>
          <span className="user-info">👤 {user?.username || user?.email}</span>
          <button className="logout-button" onClick={handleLogout}>
            🚪 Logout
          </button>
        </div>
      </div>

      <div className="status-bar">
        <div className="status-item">
          <div className={`status-dot ${status.api_connected ? 'connected' : 'disconnected'}`}></div>
          <span>{status.api_provider || 'API'}: {status.api_connected ? 'Connected' : 'Disconnected'}</span>
        </div>
        <div className="status-item">
          <div className={`status-dot ${status.telegram_configured ? 'connected' : 'disconnected'}`}></div>
          <span>Telegram: {status.telegram_configured ? 'Active' : 'Not configured'}</span>
        </div>
        <div className="status-item">
          <span>Watchlist: {watchlist.length || 0} symbols</span>
        </div>
        <button 
          className="economic-calendar-button"
          onClick={() => navigate('/economic-calendar')}
          title="View Economic Calendar"
        >
          📅 Economic Calendar
        </button>
      </div>

      {/* Currency Signal Matrix */}
      <CurrencyMatrix watchlist={watchlist} onPairClick={openChartWithSignals} />

      {/* Daily Signal Volume Chart - NEW! Shows Bullish/Neutral/Bearish from daily snapshots */}
      {/* <div style={{ marginTop: '20px', marginBottom: '20px' }}>
        <ErrorBoundary>
          <DailySignalVolumeChart days={30} />
        </ErrorBoundary>
      </div> */}

      {/* Comprehensive Analysis Chart - New TradingView-style Layout */}
      <ErrorBoundary>
        <ComprehensiveAnalysisChart 
          selectedCurrencyPair={selectedCurrencyPair}
          onPairChange={setSelectedCurrencyPair}
          watchlist={watchlist}
        />
      </ErrorBoundary>

      {/* Stacked Charts Section - Original Charts (Can be toggled/hidden) */}
      <div className="stacked-charts-container" style={{ display: 'none' }}>
        {/* Interest Rate Chart */}
        <div className="stacked-chart-item">
          <InterestRateChart 
            interestRateData={interestRateData}
            loading={loadingInterestRates}
            onRefresh={loadInterestRates}
            selectedCurrencyPair={selectedCurrencyPair}
          />
        </div>

        {/* Currency vs Interest Rate Correlation Chart */}
        <div className="stacked-chart-item">
          <ErrorBoundary>
            <CurrencyRateCorrelationChart 
              interestRateData={interestRateData}
              selectedCurrencyPair={selectedCurrencyPair}
              onPairChange={setSelectedCurrencyPair}
            />
          </ErrorBoundary>
        </div>

        {/* Bond Yields Chart */}
        <div className="stacked-chart-item">
          <ErrorBoundary>
            <BondYieldsChart 
              selectedCurrencyPair={selectedCurrencyPair}
            />
          </ErrorBoundary>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <h2>➕ Add Symbols</h2>
          <div className="search-box">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search symbols (e.g., AAPL, TSLA)..."
              className="search-input"
            />
            {showSearchResults && (
              <div className="search-results">
                {searchResults.length === 0 ? (
                  <div className="search-empty">No results found</div>
                ) : (
                  searchResults.map((result, index) => (
                    <div
                      key={index}
                      className="search-result-item"
                      onClick={() => addSymbol(result.symbol, result.exchange, result.currency)}
                    >
                      <div className="search-result-symbol">
                        {result.symbol} ({result.currency})
                      </div>
                      <div className="search-result-name">{result.name}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="panel watchlist-panel">
          <div className="panel-header">
            <h2>📈 Watchlist ({watchlist.length})</h2>
            <div className="watchlist-controls">
              <input
                type="text"
                value={pairFilter}
                onChange={(e) => setPairFilter(e.target.value)}
                placeholder="🔍 Filter pairs..."
                className="pair-filter-input"
              />
              <button 
                className="column-filter-button"
                onClick={() => setShowColumnFilter(!showColumnFilter)}
                title="Configure visible columns"
              >
                ⚙️ Columns
              </button>
            </div>
          </div>

          {/* Column Filter Dropdown */}
          {showColumnFilter && (
            <div className="column-filter-dropdown">
              <h4>Show/Hide Columns</h4>
              <div className="column-checkboxes">
                {allColumns.map(column => (
                  <label 
                    key={column.id} 
                    className={`column-checkbox ${column.fixed ? 'fixed' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isColumnVisible(column.id)}
                      onChange={() => toggleColumn(column.id)}
                      disabled={column.fixed}
                    />
                    <span>{column.label}</span>
                    {column.timeframe && (
                      <span className="column-timeframe">{column.timeframe}</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          {watchlist.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <p>No symbols in watchlist</p>
              <p className="empty-subtitle">Search and add symbols to start monitoring</p>
            </div>
          ) : filteredWatchlist.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🔍</div>
              <p>No pairs match "{pairFilter}"</p>
              <p className="empty-subtitle">Try a different search term</p>
            </div>
          ) : (
            <div className="watchlist-table-container">
              <table className="watchlist-table">
                <thead>
                  <tr>
                    {isColumnVisible('symbol') && <th>Symbol</th>}
                    {isColumnVisible('price') && <th>Price</th>}
                    {isColumnVisible('signals') && <th>Signals</th>}
                    {isColumnVisible('ema100_hourly') && (
                      <th>
                        EMA 100<br/>
                        <span style={{fontSize: '10px', fontWeight: 'normal'}}>⏰ Hourly</span>
                        <div className="bollinger-toggles" style={{marginTop: '4px'}}>
                          <button
                            className={`bb-toggle ${showSignals.ema100_hourly ? 'active' : ''}`}
                            onClick={() => setShowSignals(prev => ({...prev, ema100_hourly: !prev.ema100_hourly}))}
                            title="Toggle Signal"
                          >
                            Signal
                          </button>
                          <button
                            className={`bb-toggle ${showTimestamps.ema100_hourly ? 'active' : ''}`}
                            onClick={() => setShowTimestamps(prev => ({...prev, ema100_hourly: !prev.ema100_hourly}))}
                            title="Toggle Timestamp"
                          >
                            Time
                          </button>
                        </div>
                      </th>
                    )}
                    {isColumnVisible('rsi9_daily') && (
                      <th>
                        RSI 9<br/>
                        <span style={{fontSize: '10px', fontWeight: 'normal'}}>📅 Daily</span>
                        <div className="bollinger-toggles" style={{marginTop: '4px'}}>
                          <button
                            className={`bb-toggle ${showSignals.rsi9_daily ? 'active' : ''}`}
                            onClick={() => setShowSignals(prev => ({...prev, rsi9_daily: !prev.rsi9_daily}))}
                            title="Toggle Signal"
                          >
                            Signal
                          </button>
                          <button
                            className={`bb-toggle ${showTimestamps.rsi9_daily ? 'active' : ''}`}
                            onClick={() => setShowTimestamps(prev => ({...prev, rsi9_daily: !prev.rsi9_daily}))}
                            title="Toggle Timestamp"
                          >
                            Time
                          </button>
                        </div>
                      </th>
                    )}
                    {isColumnVisible('ema9_daily') && (
                      <th>
                        EMA 9<br/>
                        <span style={{fontSize: '10px', fontWeight: 'normal'}}>📅 Daily</span>
                        <div className="bollinger-toggles" style={{marginTop: '4px'}}>
                          <button
                            className={`bb-toggle ${showSignals.ema9_daily ? 'active' : ''}`}
                            onClick={() => setShowSignals(prev => ({...prev, ema9_daily: !prev.ema9_daily}))}
                            title="Toggle Signal"
                          >
                            Signal
                          </button>
                          <button
                            className={`bb-toggle ${showTimestamps.ema9_daily ? 'active' : ''}`}
                            onClick={() => setShowTimestamps(prev => ({...prev, ema9_daily: !prev.ema9_daily}))}
                            title="Toggle Timestamp"
                          >
                            Time
                          </button>
                        </div>
                      </th>
                    )}
                    {isColumnVisible('ema20_daily') && (
                      <th>
                        EMA 20<br/>
                        <span style={{fontSize: '10px', fontWeight: 'normal'}}>📅 Daily</span>
                        <div className="bollinger-toggles" style={{marginTop: '4px'}}>
                          <button
                            className={`bb-toggle ${showSignals.ema20_daily ? 'active' : ''}`}
                            onClick={() => setShowSignals(prev => ({...prev, ema20_daily: !prev.ema20_daily}))}
                            title="Toggle Signal"
                          >
                            Signal
                          </button>
                          <button
                            className={`bb-toggle ${showTimestamps.ema20_daily ? 'active' : ''}`}
                            onClick={() => setShowTimestamps(prev => ({...prev, ema20_daily: !prev.ema20_daily}))}
                            title="Toggle Timestamp"
                          >
                            Time
                          </button>
                        </div>
                      </th>
                    )}
                    {isColumnVisible('ema50_daily') && (
                      <th>
                        EMA 50<br/>
                        <span style={{fontSize: '10px', fontWeight: 'normal'}}>📅 Daily</span>
                        <div className="bollinger-toggles" style={{marginTop: '4px'}}>
                          <button
                            className={`bb-toggle ${showSignals.ema50_daily ? 'active' : ''}`}
                            onClick={() => setShowSignals(prev => ({...prev, ema50_daily: !prev.ema50_daily}))}
                            title="Toggle Signal"
                          >
                            Signal
                          </button>
                          <button
                            className={`bb-toggle ${showTimestamps.ema50_daily ? 'active' : ''}`}
                            onClick={() => setShowTimestamps(prev => ({...prev, ema50_daily: !prev.ema50_daily}))}
                            title="Toggle Timestamp"
                          >
                            Time
                          </button>
                        </div>
                      </th>
                    )}
                    {isColumnVisible('ema200_daily') && (
                      <th>
                        EMA 200<br/>
                        <span style={{fontSize: '10px', fontWeight: 'normal'}}>📅 Daily</span>
                        <div className="bollinger-toggles" style={{marginTop: '4px'}}>
                          <button
                            className={`bb-toggle ${showSignals.ema200_daily ? 'active' : ''}`}
                            onClick={() => setShowSignals(prev => ({...prev, ema200_daily: !prev.ema200_daily}))}
                            title="Toggle Signal"
                          >
                            Signal
                          </button>
                          <button
                            className={`bb-toggle ${showTimestamps.ema200_daily ? 'active' : ''}`}
                            onClick={() => setShowTimestamps(prev => ({...prev, ema200_daily: !prev.ema200_daily}))}
                            title="Toggle Timestamp"
                          >
                            Time
                          </button>
                        </div>
                      </th>
                    )}
                    {isColumnVisible('macross_daily') && (
                      <th>
                        MA Cross<br/>
                        <span style={{fontSize: '10px', fontWeight: 'normal'}}>📅 Daily</span>
                        <div className="bollinger-toggles" style={{marginTop: '4px'}}>
                          <button
                            className={`bb-toggle ${showSignals.macross_daily ? 'active' : ''}`}
                            onClick={() => setShowSignals(prev => ({...prev, macross_daily: !prev.macross_daily}))}
                            title="Toggle Signal"
                          >
                            Signal
                          </button>
                          <button
                            className={`bb-toggle ${showTimestamps.macross_daily ? 'active' : ''}`}
                            onClick={() => setShowTimestamps(prev => ({...prev, macross_daily: !prev.macross_daily}))}
                            title="Toggle Timestamp"
                          >
                            Time
                          </button>
                        </div>
                      </th>
                    )}
                    {isColumnVisible('macd_daily') && (
                      <th>
                        MACD<br/>
                        <span style={{fontSize: '10px', fontWeight: 'normal'}}>📅 Daily</span>
                        <div className="bollinger-toggles">
                          <button
                            className={`bb-toggle ${macdComponents.line ? 'active' : ''}`}
                            onClick={() => setMacdComponents(prev => ({...prev, line: !prev.line}))}
                            title="Toggle MACD Line"
                          >
                            L
                          </button>
                          <button
                            className={`bb-toggle ${macdComponents.signal ? 'active' : ''}`}
                            onClick={() => setMacdComponents(prev => ({...prev, signal: !prev.signal}))}
                            title="Toggle Signal Line"
                          >
                            S
                          </button>
                          <button
                            className={`bb-toggle ${macdComponents.histogram ? 'active' : ''}`}
                            onClick={() => setMacdComponents(prev => ({...prev, histogram: !prev.histogram}))}
                            title="Toggle Histogram"
                          >
                            H
                          </button>
                        </div>
                        <div className="bollinger-toggles" style={{marginTop: '4px'}}>
                          <button
                            className={`bb-toggle ${showSignals.macd_daily ? 'active' : ''}`}
                            onClick={() => setShowSignals(prev => ({...prev, macd_daily: !prev.macd_daily}))}
                            title="Toggle Signal"
                          >
                            Signal
                          </button>
                          <button
                            className={`bb-toggle ${showTimestamps.macd_daily ? 'active' : ''}`}
                            onClick={() => setShowTimestamps(prev => ({...prev, macd_daily: !prev.macd_daily}))}
                            title="Toggle Timestamp"
                          >
                            Time
                          </button>
                        </div>
                      </th>
                    )}
                    {isColumnVisible('bollinger_weekly') && (
                      <th>
                        Bollinger<br/>
                        <span style={{fontSize: '10px', fontWeight: 'normal'}}>📆 Weekly</span>
                        <div className="bollinger-toggles">
                          <button
                            className={`bb-toggle ${bollingerBands.upper ? 'active' : ''}`}
                            onClick={() => setBollingerBands(prev => ({...prev, upper: !prev.upper}))}
                            title="Toggle Upper Band"
                          >
                            U
                          </button>
                          <button
                            className={`bb-toggle ${bollingerBands.middle ? 'active' : ''}`}
                            onClick={() => setBollingerBands(prev => ({...prev, middle: !prev.middle}))}
                            title="Toggle Middle Band"
                          >
                            M
                          </button>
                          <button
                            className={`bb-toggle ${bollingerBands.lower ? 'active' : ''}`}
                            onClick={() => setBollingerBands(prev => ({...prev, lower: !prev.lower}))}
                            title="Toggle Lower Band"
                          >
                            L
                          </button>
                        </div>
                        <div className="bollinger-toggles" style={{marginTop: '4px'}}>
                          <button
                            className={`bb-toggle ${showSignals.bollinger_weekly ? 'active' : ''}`}
                            onClick={() => setShowSignals(prev => ({...prev, bollinger_weekly: !prev.bollinger_weekly}))}
                            title="Toggle Signal"
                          >
                            Signal
                          </button>
                          <button
                            className={`bb-toggle ${showTimestamps.bollinger_weekly ? 'active' : ''}`}
                            onClick={() => setShowTimestamps(prev => ({...prev, bollinger_weekly: !prev.bollinger_weekly}))}
                            title="Toggle Timestamp"
                          >
                            Time
                          </button>
                        </div>
                      </th>
                    )}
                    {isColumnVisible('ema20_weekly') && (
                      <th>
                        EMA 20<br/>
                        <span style={{fontSize: '10px', fontWeight: 'normal'}}>📆 Weekly</span>
                        <div className="bollinger-toggles" style={{marginTop: '4px'}}>
                          <button
                            className={`bb-toggle ${showSignals.ema20_weekly ? 'active' : ''}`}
                            onClick={() => setShowSignals(prev => ({...prev, ema20_weekly: !prev.ema20_weekly}))}
                            title="Toggle Signal"
                          >
                            Signal
                          </button>
                          <button
                            className={`bb-toggle ${showTimestamps.ema20_weekly ? 'active' : ''}`}
                            onClick={() => setShowTimestamps(prev => ({...prev, ema20_weekly: !prev.ema20_weekly}))}
                            title="Toggle Timestamp"
                          >
                            Time
                          </button>
                        </div>
                      </th>
                    )}
                    {isColumnVisible('action') && <th>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredWatchlist.map((item, index) => (
                    <tr key={index} className="symbol-row">
                      {/* Symbol - Make it clickable */}
                      {isColumnVisible('symbol') && (
                        <td className="symbol-cell">
                          <div className="symbol-actions">
                            <div 
                              className="symbol-name clickable-symbol" 
                              onClick={() => openChartModal(item.symbol)}
                              title="Click to view detailed chart"
                            >
                              {item.symbol.replace(/^C:/, '')} 📊
                            </div>
                            <button
                              onClick={() => viewSignalHistory(item.symbol)}
                              className="history-button"
                              title="View signal history"
                            >
                              📜
                            </button>
                          </div>
                        </td>
                      )}

                      {/* Price */}
                      {isColumnVisible('price') && (
                        <td className="price-cell">
                          ${(item.last_price || item.price || 0).toFixed(5)}
                        </td>
                      )}

                      {/* Signals Summary */}
                      {isColumnVisible('signals') && (
                        <td className="signals-cell">
                          <div className="signal-badges">
                            <span className="signal-badge bullish">
                              {item.buy_signals?.length || 0} 🟢
                            </span>
                            <span className="signal-badge bearish">
                              {item.sell_signals?.length || 0} 🔴
                            </span>
                            <span className="signal-badge neutral">
                              {countNeutralSignals(item)} ⚪
                            </span>
                          </div>
                        </td>
                      )}

                      {/* 1. EMA 100 Hourly */}
                      {isColumnVisible('ema100_hourly') && (
                        <td className="indicator-cell">
                          {item.hourly_indicators?.ema_100 ? (
                            <>
                              <button
                                onClick={() => viewSignalHistory(item.symbol, 'EMA 100 Hourly')}
                                className="indicator-history-btn"
                                title="View EMA 100 Hourly history"
                              >
                                📜
                              </button>
                              <div className="indicator-value">
                                {item.hourly_indicators.ema_100.ema_value?.toFixed(5)}
                              </div>
                              {showSignals.ema100_hourly && (
                                item.hourly_indicators.ema_100.signal ? (
                                  <span className={`signal-badge-mini ${item.hourly_indicators.ema_100.signal === 'BUY' ? 'buy' : 'sell'}`}>
                                    {item.hourly_indicators.ema_100.signal}
                                  </span>
                                ) : (
                                  <span className="signal-badge-mini neutral">Neutral</span>
                                )
                              )}
                              {showTimestamps.ema100_hourly && item.hourly_indicators.ema_100.signal_timestamp && (
                                <div className="signal-time">{formatSignalTime(item.hourly_indicators.ema_100.signal_timestamp)}</div>
                              )}
                            </>
                          ) : (
                            <span className="signal-badge-mini neutral">N/A</span>
                          )}
                        </td>
                      )}

                      {/* 2. RSI Daily */}
                      {isColumnVisible('rsi9_daily') && (
                        <td className="indicator-cell">
                          {item.daily_indicators?.rsi_9 && (
                            <button
                              onClick={() => viewSignalHistory(item.symbol, 'RSI (9)')}
                              className="indicator-history-btn"
                              title="View RSI 9 history"
                            >
                              📜
                            </button>
                          )}
                          <div className="indicator-value">
                            {item.daily_indicators?.rsi_9?.rsi_value?.toFixed(0)}
                          </div>
                          {showSignals.rsi9_daily && (
                            item.daily_indicators?.rsi_9?.signal ? (
                              <span className={`signal-badge-mini ${item.daily_indicators.rsi_9.signal === 'BUY' ? 'buy' : 'sell'}`}>
                                {item.daily_indicators.rsi_9.signal}
                              </span>
                            ) : (
                              <span className="signal-badge-mini neutral">Neutral</span>
                            )
                          )}
                          {showTimestamps.rsi9_daily && item.daily_indicators?.rsi_9?.signal_timestamp && (
                            <div className="signal-time">{formatSignalTime(item.daily_indicators.rsi_9.signal_timestamp)}</div>
                          )}
                        </td>
                      )}

                      {/* 4. EMA 9 Daily */}
                      {isColumnVisible('ema9_daily') && (
                        <td className="indicator-cell">
                          {item.daily_indicators?.ema_9 ? (
                            <>
                              <button
                                onClick={() => viewSignalHistory(item.symbol, 'EMA 9')}
                                className="indicator-history-btn"
                                title="View EMA 9 history"
                              >
                                📜
                              </button>
                              <div className="indicator-value">
                                {item.daily_indicators.ema_9.ema_value?.toFixed(5)}
                              </div>
                              {showSignals.ema9_daily && (
                                item.daily_indicators.ema_9.signal ? (
                                  <span className={`signal-badge-mini ${item.daily_indicators.ema_9.signal === 'BUY' ? 'buy' : 'sell'}`}>
                                    {item.daily_indicators.ema_9.signal}
                                  </span>
                                ) : (
                                  <span className="signal-badge-mini neutral">Neutral</span>
                                )
                              )}
                              {showTimestamps.ema9_daily && item.daily_indicators.ema_9.signal_timestamp && (
                                <div className="signal-time">{formatSignalTime(item.daily_indicators.ema_9.signal_timestamp)}</div>
                              )}
                            </>
                          ) : (
                            <span className="signal-badge-mini neutral">N/A</span>
                          )}
                        </td>
                      )}

                      {/* 5. EMA 20 Daily */}
                      {isColumnVisible('ema20_daily') && (
                        <td className="indicator-cell">
                          {item.daily_indicators?.ema_20 ? (
                            <>
                              <button
                                onClick={() => viewSignalHistory(item.symbol, 'EMA 20')}
                                className="indicator-history-btn"
                                title="View EMA 20 history"
                              >
                                📜
                              </button>
                              <div className="indicator-value">
                                {item.daily_indicators.ema_20.ema_value?.toFixed(5)}
                              </div>
                              {showSignals.ema20_daily && (
                                item.daily_indicators.ema_20.signal ? (
                                  <span className={`signal-badge-mini ${item.daily_indicators.ema_20.signal === 'BUY' ? 'buy' : 'sell'}`}>
                                    {item.daily_indicators.ema_20.signal}
                                  </span>
                                ) : (
                                  <span className="signal-badge-mini neutral">Neutral</span>
                                )
                              )}
                              {showTimestamps.ema20_daily && item.daily_indicators.ema_20.signal_timestamp && (
                                <div className="signal-time">{formatSignalTime(item.daily_indicators.ema_20.signal_timestamp)}</div>
                              )}
                            </>
                          ) : (
                            <span className="signal-badge-mini neutral">N/A</span>
                          )}
                        </td>
                      )}

                      {/* 6. EMA 50 Daily */}
                      {isColumnVisible('ema50_daily') && (
                        <td className="indicator-cell">
                          {item.daily_indicators?.ema_50 ? (
                            <>
                              <button
                                onClick={() => viewSignalHistory(item.symbol, 'EMA 50')}
                                className="indicator-history-btn"
                                title="View EMA 50 history"
                              >
                                📜
                              </button>
                              <div className="indicator-value">
                                {item.daily_indicators.ema_50.ema_value?.toFixed(5)}
                              </div>
                              {showSignals.ema50_daily && (
                                item.daily_indicators.ema_50.signal ? (
                                  <span className={`signal-badge-mini ${item.daily_indicators.ema_50.signal === 'BUY' ? 'buy' : 'sell'}`}>
                                    {item.daily_indicators.ema_50.signal}
                                  </span>
                                ) : (
                                  <span className="signal-badge-mini neutral">Neutral</span>
                                )
                              )}
                              {showTimestamps.ema50_daily && item.daily_indicators.ema_50.signal_timestamp && (
                                <div className="signal-time">{formatSignalTime(item.daily_indicators.ema_50.signal_timestamp)}</div>
                              )}
                            </>
                          ) : (
                            <span className="signal-badge-mini neutral">N/A</span>
                          )}
                        </td>
                      )}

                      {/* 7. EMA 200 Daily */}
                      {isColumnVisible('ema200_daily') && (
                        <td className="indicator-cell">
                          {item.daily_indicators?.ema_200 ? (
                            <>
                              <button
                                onClick={() => viewSignalHistory(item.symbol, 'EMA 200')}
                                className="indicator-history-btn"
                                title="View EMA 200 history"
                              >
                                📜
                              </button>
                              <div className="indicator-value">
                                {item.daily_indicators.ema_200.ema_value?.toFixed(5)}
                              </div>
                              {showSignals.ema200_daily && (
                                item.daily_indicators.ema_200.signal ? (
                                  <span className={`signal-badge-mini ${item.daily_indicators.ema_200.signal === 'BUY' ? 'buy' : 'sell'}`}>
                                    {item.daily_indicators.ema_200.signal}
                                  </span>
                                ) : (
                                  <span className="signal-badge-mini neutral">Neutral</span>
                                )
                              )}
                              {showTimestamps.ema200_daily && item.daily_indicators.ema_200.signal_timestamp && (
                                <div className="signal-time">{formatSignalTime(item.daily_indicators.ema_200.signal_timestamp)}</div>
                              )}
                            </>
                          ) : (
                            <span className="signal-badge-mini neutral">N/A</span>
                          )}
                        </td>
                      )}

                      {/* 8. MA Crossover Daily */}
                      {isColumnVisible('macross_daily') && (
                        <td className="indicator-cell">
                          {item.daily_indicators?.ma_crossover ? (
                            <>
                              <button
                                onClick={() => viewSignalHistory(item.symbol, 'MA Crossover')}
                                className="indicator-history-btn"
                                title="View MA Crossover history"
                              >
                                📜
                              </button>
                              <div className="indicator-value" style={{fontSize: '10px', marginBottom: '2px'}}>
                                Fast: {item.daily_indicators.ma_crossover.fast_ema?.toFixed(5)}<br/>
                                Slow: {item.daily_indicators.ma_crossover.slow_ema?.toFixed(5)}
                              </div>
                              {item.daily_indicators.ma_crossover.signal ? (
                                <>
                                  <span className={`signal-badge-mini ${item.daily_indicators.ma_crossover.signal === 'BUY' ? 'buy' : 'sell'}`}>
                                    {item.daily_indicators.ma_crossover.signal}
                                  </span>
                                  {item.daily_indicators.ma_crossover.signal_timestamp && (
                                    <div className="signal-time">{formatSignalTime(item.daily_indicators.ma_crossover.signal_timestamp)}</div>
                                  )}
                                </>
                              ) : (
                                <span className="signal-badge-mini neutral">Neutral</span>
                              )}
                            </>
                          ) : (
                            <span className="signal-badge-mini neutral">N/A</span>
                          )}
                        </td>
                      )}

                      {/* 9. MACD Daily */}
                      {isColumnVisible('macd_daily') && (
                        <td className="indicator-cell">
                          {item.daily_indicators?.macd ? (
                            <>
                              <button
                                onClick={() => viewSignalHistory(item.symbol, 'MACD')}
                                className="indicator-history-btn"
                                title="View MACD history"
                              >
                                📜
                              </button>
                              <div className="indicator-value" style={{fontSize: '10px', marginBottom: '2px'}}>
                                {macdComponents.line && <span>Line: {item.daily_indicators.macd.macd_line?.toFixed(6)}<br/></span>}
                                {macdComponents.signal && <span>Sig: {item.daily_indicators.macd.signal_line?.toFixed(6)}<br/></span>}
                                {macdComponents.histogram && <span>Hist: {item.daily_indicators.macd.histogram?.toFixed(6)}</span>}
                              </div>
                              {showSignals.macd_daily && (
                                item.daily_indicators.macd.signal ? (
                                  <span className={`signal-badge-mini ${item.daily_indicators.macd.signal === 'BUY' ? 'buy' : 'sell'}`}>
                                    {item.daily_indicators.macd.signal}
                                  </span>
                                ) : (
                                  <span className="signal-badge-mini neutral">Neutral</span>
                                )
                              )}
                              {showTimestamps.macd_daily && item.daily_indicators.macd.signal_timestamp && (
                                <div className="signal-time">{formatSignalTime(item.daily_indicators.macd.signal_timestamp)}</div>
                              )}
                            </>
                          ) : (
                            <span className="signal-badge-mini neutral">N/A</span>
                          )}
                        </td>
                      )}

                      {/* 10. Bollinger Bands Weekly */}
                      {isColumnVisible('bollinger_weekly') && (
                        <td className="indicator-cell">
                          {item.weekly_indicators?.bollinger_band ? (
                            <>
                              <button
                                onClick={() => viewSignalHistory(item.symbol, 'Bollinger Bands Weekly')}
                                className="indicator-history-btn"
                                title="View Bollinger Bands Weekly history"
                              >
                                📜
                              </button>
                              <div className="indicator-value" style={{fontSize: '10px', marginBottom: '2px'}}>
                                {bollingerBands.upper && <span>U: {item.weekly_indicators.bollinger_band.upper_band?.toFixed(5)}<br/></span>}
                                {bollingerBands.middle && <span>M: {item.weekly_indicators.bollinger_band.middle_band?.toFixed(5)}<br/></span>}
                                {bollingerBands.lower && <span>L: {item.weekly_indicators.bollinger_band.lower_band?.toFixed(5)}</span>}
                              </div>
                              {showSignals.bollinger_weekly && (
                                item.weekly_indicators.bollinger_band.signal ? (
                                  <span className={`signal-badge-mini ${item.weekly_indicators.bollinger_band.signal === 'BUY' ? 'buy' : 'sell'}`}>
                                    {item.weekly_indicators.bollinger_band.signal}
                                  </span>
                                ) : (
                                  <span className="signal-badge-mini neutral">Neutral</span>
                                )
                              )}
                              {showTimestamps.bollinger_weekly && item.weekly_indicators.bollinger_band.signal_timestamp && (
                                <div className="signal-time">{formatSignalTime(item.weekly_indicators.bollinger_band.signal_timestamp)}</div>
                              )}
                            </>
                          ) : (
                            <span className="signal-badge-mini neutral">N/A</span>
                          )}
                        </td>
                      )}

                      {/* 11. EMA 20 Weekly */}
                      {isColumnVisible('ema20_weekly') && (
                        <td className="indicator-cell">
                          {item.weekly_indicators?.ema_20 ? (
                            <>
                              <button
                                onClick={() => viewSignalHistory(item.symbol, 'EMA 20 Weekly')}
                                className="indicator-history-btn"
                                title="View EMA 20 Weekly history"
                              >
                                📜
                              </button>
                              <div className="indicator-value">
                                {item.weekly_indicators.ema_20.ema_value?.toFixed(5)}
                              </div>
                              {showSignals.ema20_weekly && (
                                item.weekly_indicators.ema_20.signal ? (
                                  <span className={`signal-badge-mini ${item.weekly_indicators.ema_20.signal === 'BUY' ? 'buy' : 'sell'}`}>
                                    {item.weekly_indicators.ema_20.signal}
                                  </span>
                                ) : (
                                  <span className="signal-badge-mini neutral">Neutral</span>
                                )
                              )}
                              {showTimestamps.ema20_weekly && item.weekly_indicators.ema_20.signal_timestamp && (
                                <div className="signal-time">{formatSignalTime(item.weekly_indicators.ema_20.signal_timestamp)}</div>
                              )}
                            </>
                          ) : (
                            <span className="signal-badge-mini neutral">N/A</span>
                          )}
                        </td>
                      )}

                      {/* Action */}
                      {isColumnVisible('action') && (
                        <td className="action-cell">
                          <button
                            onClick={() => removeSymbol(item.symbol)}
                            className="remove-button"
                            title="Remove"
                          >
                            🗑️
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Signal History Modal */}
      {showHistoryModal && (
        <div className="modal-overlay" onClick={closeHistoryModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📊 {selectedSymbol?.replace(/^C:/, '')} - Signal History</h2>
              <button className="modal-close" onClick={closeHistoryModal}>✕</button>
            </div>
            
            <div className="modal-body">
              {loadingHistory ? (
                <div className="loading-state">Loading history...</div>
              ) : signalHistory.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📭</div>
                  <p>No signal history found</p>
                  <p className="empty-subtitle">Signals will appear here when generated</p>
                </div>
              ) : (
                <>
                  {/* Signal Changes Timeline */}
                  <h3 style={{ marginTop: '20px', marginBottom: '15px', color: '#111827' }}>
                    📋 Signal Changes History ({signalHistory.length} changes)
                  </h3>
                  <div className="changes-timeline">
                    {signalHistory.map((change, index) => {
                      const dateStr = new Date(change.timestamp).toLocaleDateString('en-GB', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric' 
                      })
                      const timeStr = new Date(change.timestamp).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })
                      
                      // Split indicator and timeframe if they're combined (e.g., "EMA_9_Daily")
                      const indicatorName = change.indicator || ''
                      const timeframe = change.timeframe || ''
                      
                      // Use the correct field names from the API response
                      const oldSignal = change.old_signal || 'Neutral'
                      const newSignal = change.new_signal || 'Neutral'
                      
                      return (
                        <div key={index} className="change-entry">
                          <div className="change-date">{dateStr}</div>
                          <div className="change-content">
                            <div className="change-text">
                              <strong>{indicatorName}{timeframe ? ` (${timeframe})` : ''}</strong> changed from{' '}
                              <span className={`signal-inline ${oldSignal === 'BUY' ? 'buy' : oldSignal === 'SELL' ? 'sell' : 'neutral'}`}>
                                {oldSignal}
                              </span>
                              {' '}to{' '}
                              <span className={`signal-inline ${newSignal === 'BUY' ? 'buy' : newSignal === 'SELL' ? 'sell' : 'neutral'}`}>
                                {newSignal}
                              </span>
                            </div>
                            <div className="change-meta">Price: ${change.price?.toFixed(5)} at {timeStr}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Advanced Chart Modal */}
      {showChartModal && (
        <ChartModal 
          symbol={chartSymbol} 
          signalMarkers={signalMarkers}
          signalVolumeData={signalVolumeData}
          onClose={closeChartModal}
        />
      )}

      {/* Login History Modal */}
      {showLoginHistory && (
        <LoginHistory onClose={() => setShowLoginHistory(false)} />
      )}
    </div>
  )
}

export default Dashboard
