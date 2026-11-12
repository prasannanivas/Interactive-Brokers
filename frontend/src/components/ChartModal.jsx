import React, { useEffect, useRef, useState } from 'react'
import { createChart } from 'lightweight-charts'
import { historyAPI } from '../api/api'
import { computeChartIndicators } from '../utils/chartIndicators'
import { fetchCloseSnapshots, volumeBarsFromSnapshots } from '../utils/signalViews'
import { DAILY_WINDOW_DAYS, HOURLY_WINDOW_DAYS, WEEKLY_WINDOW_DAYS } from '../utils/signalEngine'
import axios from 'axios'
import FullscreenChartModal from './FullscreenChartModal'
import './ChartModal.css'
import { applyChartTheme, useTheme } from '../theme'
import { ChartCandlestick, ChartColumn, ChartColumnBig, ChartColumnStacked, Clock, MapPin, SlidersHorizontal, TriangleAlert, X } from 'lucide-react'

const API_URL = import.meta.env.VITE_TRADING_API_URL || 'http://167.172.215.78:8000'

const ChartModal = ({ symbol, signalMarkers = [], signalVolumeData = [], onClose, liveItem = null }) => {
  const chartContainerRef = useRef(null)
  const rsiChartContainerRef = useRef(null)
  const macdChartContainerRef = useRef(null)
  const volumeChartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const rsiChartRef = useRef(null)
  const macdChartRef = useRef(null)
  const volumeChartRef = useRef(null)
  const theme = useTheme()

  useEffect(() => {
    applyChartTheme(chartRef.current, rsiChartRef.current, macdChartRef.current, volumeChartRef.current)
  }, [theme])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [chartData, setChartData] = useState(null)
  const [indicators, setIndicators] = useState({})
  const [timeframe, setTimeframe] = useState('daily') // 'hourly', 'daily', 'weekly'
  const [cache, setCache] = useState({}) // Cache for each timeframe: { hourly: { data, timestamp }, daily: {...}, weekly: {...} }
  
  // Define which indicators are available for each timeframe (based on Boss's rules)
  const indicatorAvailability = {
    hourly: ['ema100'], // Rule 1: EMA 100 Hourly only
    daily: ['rsi', 'ema9', 'ema20', 'ema50', 'ema200', 'maCross', 'macd'], // Rules 3-9 (7 indicators)
    weekly: ['bollingerBands', 'ema20'] // Rules: Bollinger Bands Weekly + EMA 20 Weekly
  }
  
  const [visibleIndicators, setVisibleIndicators] = useState({
    bollingerBands: true,
    ema9: true,
    ema20: true,
    ema50: true,
    ema100: true,
    ema200: true,
    rsi: true,
    macd: true,
    maCross: true
  })
  
  // Toggle between volume bars and individual signal markers
  const [showVolumeMode, setShowVolumeMode] = useState(true) // true = volume bars, false = individual markers
  const [volumeBarMode, setVolumeBarMode] = useState('stacked') // 'individual' or 'stacked'
  const [dailySnapshotVolume, setDailySnapshotVolume] = useState([]) // Daily snapshot volume data
  const [stackedVolumeData, setStackedVolumeData] = useState(null) // Stacked volume data (bullish/neutral/bearish)
  const [closeSnapshots, setCloseSnapshots] = useState(null) // 10-rule signals at every daily close (signalViews)

  // Volume bars = signal counts at each close, from the same close snapshots as the signal
  // calendar, matrix delta and history popup; the live bar uses the dashboard table row.
  useEffect(() => {
    let cancelled = false
    setCloseSnapshots(null)
    fetchCloseSnapshots(symbol)
      .then(r => { if (!cancelled) setCloseSnapshots(r.snapshots) })
      .catch(err => console.error('Close snapshots failed:', err))
    return () => { cancelled = true }
  }, [symbol])

  useEffect(() => {
    if (!chartData) return
    const { stackedData, individualData } = volumeBarsFromSnapshots(chartData, closeSnapshots, timeframe, liveItem)
    setStackedVolumeData(stackedData)
    setDailySnapshotVolume(individualData)
  }, [chartData, closeSnapshots, timeframe, liveItem?.buy_signals?.join(), liveItem?.sell_signals?.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  
  // Fullscreen states for each chart
  const [isPriceChartFullscreen, setIsPriceChartFullscreen] = useState(false)
  const [isRsiChartFullscreen, setIsRsiChartFullscreen] = useState(false)
  const [isMacdChartFullscreen, setIsMacdChartFullscreen] = useState(false)

  useEffect(() => {
    if (!symbol) return

    // Reset visible indicators based on timeframe
    const availableIndicators = indicatorAvailability[timeframe] || []
    const newVisibleState = {}
    Object.keys(visibleIndicators).forEach(key => {
      newVisibleState[key] = availableIndicators.includes(key)
    })
    setVisibleIndicators(newVisibleState)

    console.log('🔄 ChartModal useEffect triggered for symbol:', symbol, 'timeframe:', timeframe)
    fetchChartData() // Volume bars are computed from chart data (no separate API call)

    // Cleanup on unmount
    return () => {
      if (chartRef.current) {
        try { chartRef.current.remove() } catch (e) {}
        chartRef.current = null
      }
      if (rsiChartRef.current) {
        try { rsiChartRef.current.remove() } catch (e) {}
        rsiChartRef.current = null
      }
      if (macdChartRef.current) {
        try { macdChartRef.current.remove() } catch (e) {}
        macdChartRef.current = null
      }
    }
  }, [symbol, timeframe]) // Re-fetch when timeframe changes

  // Re-render chart when visible indicators change
  useEffect(() => {
    if (chartData && indicators && Object.keys(indicators).length > 0) {
      renderChart(chartData, indicators)
    }
  }, [visibleIndicators, chartData, indicators, signalMarkers, dailySnapshotVolume, stackedVolumeData, showVolumeMode, volumeBarMode, isPriceChartFullscreen, isRsiChartFullscreen, isMacdChartFullscreen])

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        })
      }
      if (rsiChartRef.current && rsiChartContainerRef.current) {
        rsiChartRef.current.applyOptions({
          width: rsiChartContainerRef.current.clientWidth,
        })
      }
      if (macdChartRef.current && macdChartContainerRef.current) {
        macdChartRef.current.applyOptions({
          width: macdChartContainerRef.current.clientWidth,
        })
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Handle ESC key to close fullscreen charts
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (isPriceChartFullscreen) setIsPriceChartFullscreen(false)
        if (isRsiChartFullscreen) setIsRsiChartFullscreen(false)
        if (isMacdChartFullscreen) setIsMacdChartFullscreen(false)
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isPriceChartFullscreen, isRsiChartFullscreen, isMacdChartFullscreen])

  // Resize charts when fullscreen state changes
  useEffect(() => {
    const resizeCharts = () => {
      setTimeout(() => {
        if (chartRef.current && chartContainerRef.current) {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: isPriceChartFullscreen ? Math.floor(window.innerHeight * 0.65) : 400,
          })
          chartRef.current.timeScale().fitContent()
        }
        if (rsiChartRef.current && rsiChartContainerRef.current) {
          rsiChartRef.current.applyOptions({
            width: rsiChartContainerRef.current.clientWidth,
            height: isRsiChartFullscreen ? Math.floor(window.innerHeight * 0.65) : 150,
          })
          rsiChartRef.current.timeScale().fitContent()
        }
        if (macdChartRef.current && macdChartContainerRef.current) {
          macdChartRef.current.applyOptions({
            width: macdChartContainerRef.current.clientWidth,
            height: isMacdChartFullscreen ? Math.floor(window.innerHeight * 0.65) : 150,
          })
          macdChartRef.current.timeScale().fitContent()
        }
      }, 100)
    }
    
    if (!loading && !error) {
      resizeCharts()
    }
  }, [isPriceChartFullscreen, isRsiChartFullscreen, isMacdChartFullscreen, loading, error])

  const fetchChartData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Check cache first (5 minute expiry)
      const now = Date.now()
      const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes in milliseconds
      
      if (cache[timeframe] && (now - cache[timeframe].timestamp) < CACHE_DURATION && cache[timeframe].data?.length > 0) {
        console.log(`📦 Using cached ${timeframe} data`)
        const cached = cache[timeframe]
        setChartData(cached.data)
        setIndicators(cached.indicators)
        const { stackedData, individualData } = computeVolumeFromChartData(cached.data, cached.indicators, timeframe)
        setStackedVolumeData(stackedData)
        setDailySnapshotVolume(individualData)
        setLoading(false)
        return
      }

      console.log(`🔄 Fetching fresh ${timeframe} data...`)

      // Determine days and timespan based on timeframe
      let days, timespan
      switch(timeframe) {
        case 'hourly':
          days = HOURLY_WINDOW_DAYS   // same window as the signal engine (~1000 candles)
          timespan = 'hour'
          break
        case 'daily':
          days = DAILY_WINDOW_DAYS    // same window as the signal engine (5 years)
          timespan = 'day'
          break
        case 'weekly':
          days = WEEKLY_WINDOW_DAYS   // same window as the signal engine (~260 weeks)
          timespan = 'week'
          break
        default:
          days = 365
          timespan = 'day'
      }

      // Fetch candles with correct timespan from Massive API
      console.log(`[WEEKLY DBG] Requesting: symbol=${symbol} days=${days} timespan=${timespan}`)
      const response = await historyAPI.getPriceHistory(symbol, days, timespan)
      console.log(`[WEEKLY DBG] Raw response status=${response.status} candles=${response.data?.candles?.length}`)
      const candles = response.data.candles

      if (!candles || candles.length === 0) {
        console.warn('[WEEKLY DBG] No candles returned — setting error')
        setError('No price data available')
        setLoading(false)
        return
      }

      // Sort candles by time (handles both 'YYYY-MM-DD' strings and Unix-second numbers)
      const sortedCandles = [...candles].sort((a, b) => {
        if (typeof a.time === 'string') return a.time.localeCompare(b.time)
        return a.time - b.time
      })
      
      // Filter out weekend daily candles (Saturday=6, Sunday=0) for forex markets, exactly like
      // the signal engine. Weekly bars are full weeks and hourly bars are kept as-is (the
      // Sunday-evening session is real trading) - both unfiltered, same as the backend.
      const filteredCandles = timeframe !== 'daily' ? sortedCandles : sortedCandles.filter(candle => {
        const date = typeof candle.time === 'string'
          ? new Date(candle.time + 'T00:00:00Z')
          : new Date(candle.time * 1000)
        const dayOfWeek = date.getUTCDay()
        return dayOfWeek !== 0 && dayOfWeek !== 6  // Exclude Sunday (0) and Saturday (6)
      })
      
      // Use filtered candles for proper indicator calculation
      const candlesToUse = filteredCandles
      
      console.log(`📊 Filtered ${sortedCandles.length - filteredCandles.length} weekend candles (${sortedCandles.length} → ${filteredCandles.length})`)
      console.log(`[WEEKLY DBG] candlesToUse.length=${candlesToUse.length}, first=${JSON.stringify(candlesToUse[0])}, last=${JSON.stringify(candlesToUse[candlesToUse.length-1])}`)

      // Calculate technical indicators on full dataset
      const calculatedIndicators = calculateIndicators(candlesToUse)
      console.log(`[WEEKLY DBG] calculatedIndicators keys:`, Object.keys(calculatedIndicators))

      // Compute volume bars directly from indicator arrays (no DB snapshot API call needed)
      console.log(`[WEEKLY DBG] calling computeVolumeFromChartData tf=${timeframe}`)
      const { stackedData, individualData } = computeVolumeFromChartData(candlesToUse, calculatedIndicators, timeframe)
      console.log(`[WEEKLY DBG] stackedData=${stackedData ? 'yes len='+stackedData.bullish?.length : 'null'} individualData.length=${individualData?.length}`)

      // Update cache for this timeframe
      setCache(prevCache => ({
        ...prevCache,
        [timeframe]: {
          data: candlesToUse,
          indicators: calculatedIndicators,
          stackedData,
          individualData,
          timestamp: now
        }
      }))

      setIndicators(calculatedIndicators)
      setChartData(candlesToUse)
      setStackedVolumeData(stackedData)
      setDailySnapshotVolume(individualData)
      console.log(`[WEEKLY DBG] setLoading(false) — chart should render now`)
      setLoading(false)
    } catch (err) {
      console.error('[WEEKLY DBG] fetchChartData CATCH:', err)
      setError(err.response?.data?.detail || 'Failed to load chart data')
      setLoading(false)
    }
  }

  const fetchDailySnapshotVolume = async () => {
    try {
      console.log('📊 Fetching daily snapshot volume data for', symbol, 'timeframe:', timeframe)
      
      // Match the snapshot period to the chart timeframe
      let snapshotDays
      switch(timeframe) {
        case 'hourly':
          snapshotDays = HOURLY_WINDOW_DAYS  // Match hourly chart period
          break
        case 'daily':
          snapshotDays = DAILY_WINDOW_DAYS  // Match daily chart period
          break
        case 'weekly':
          snapshotDays = WEEKLY_WINDOW_DAYS  // Match weekly chart period
          break
        default:
          snapshotDays = 365
      }
      
      // Fetch snapshots matching the chart timeframe
      const response = await axios.get(`${API_URL}/api/signals/daily-snapshots?days=${snapshotDays}&limit=${snapshotDays}`)
      console.log('📥 API Response:', response.data)
      const snapshots = response.data.snapshots || []
      console.log('📦 Total snapshots received:', snapshots.length, 'for', snapshotDays, 'days period')
      
      // Log the first snapshot structure for debugging
      if (snapshots.length > 0) {
        console.log('🔍 FIRST SNAPSHOT FULL STRUCTURE:', JSON.stringify(snapshots[0], null, 2))
      }
      
      if (snapshots.length === 0) {
        console.log('⚠️ No snapshot data available')
        setDailySnapshotVolume([])
        setStackedVolumeData(null)
        return
      }

      // Process snapshots for STACKED mode (aggregate counts per day)
      const stackedData = {
        bullish: [],
        neutral: [],
        bearish: []
      }

      snapshots.reverse().forEach((snapshot, idx) => {
        // Force UTC parsing — MongoDB returns naive datetimes without 'Z', so browsers
        // parse them as local time which shifts the date in non-UTC timezones (e.g. BST/IST)
        const rawDate = snapshot.snapshot_date
        const utcStr = typeof rawDate === 'string' && !rawDate.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(rawDate)
          ? rawDate + 'Z'
          : rawDate
        const date = new Date(utcStr)
        // Use the same time format as the candles: date string for daily/weekly, Unix seconds for hourly
        const timestamp = timeframe === 'hourly'
          ? (() => { date.setUTCHours(0, 0, 0, 0); return Math.floor(date.getTime() / 1000) })()
          : date.toISOString().split('T')[0]  // 'YYYY-MM-DD' matches daily/weekly candles
        
        // Find this symbol's data
        const symbolData = snapshot.signals?.find(s => s.symbol === symbol)
        
        if (idx === 0) {
          console.log('🔍 DEBUGGING FIRST SNAPSHOT:')
          console.log('  - snapshot.signals array length:', snapshot.signals?.length)
          console.log('  - Looking for symbol:', symbol)
          console.log('  - Available symbols in snapshot:', snapshot.signals?.map(s => s.symbol).join(', '))
          console.log('  - Found symbolData:', symbolData)
          if (symbolData) {
            console.log('  - symbolData keys:', Object.keys(symbolData))
            console.log('  - daily_indicators:', symbolData.daily_indicators)
            console.log('  - hourly_indicators:', symbolData.hourly_indicators)
            console.log('  - weekly_indicators:', symbolData.weekly_indicators)
          }
        }
        
        if (!symbolData) {
          // No data for this symbol on this day
          stackedData.bullish.push({ time: timestamp, value: 0 })
          stackedData.neutral.push({ time: timestamp, value: 0 })
          stackedData.bearish.push({ time: timestamp, value: 0 })
          return
        }
        
        // Count individual indicator signals using buy_signals and sell_signals arrays
        // buy_signals = bullish indicators, sell_signals = bearish indicators
        const buySignals = symbolData.buy_signals || []
        const sellSignals = symbolData.sell_signals || []
        
        let bullishCount = buySignals.length
        let bearishCount = sellSignals.length
        let neutralCount = 0 // We don't have neutral signals directly, so we'll leave it as 0
        
        if (idx === 0) {
          console.log('🔍 DEBUGGING FIRST SNAPSHOT:')
          console.log('  - Looking for symbol:', symbol)
          console.log('  - Found symbolData:', !!symbolData)
          console.log('  - buy_signals:', buySignals)
          console.log('  - sell_signals:', sellSignals)
          console.log('  - FINAL COUNTS:', { bullishCount, bearishCount, neutralCount })
        }
        
        // For stacked bars: create cumulative values
        // Bottom layer: bullish only
        // Middle layer: bullish + neutral
        // Top layer: bullish + neutral + bearish
        stackedData.bullish.push({
          time: timestamp,
          value: bullishCount
        })
        stackedData.neutral.push({
          time: timestamp,
          value: bullishCount + neutralCount
        })
        stackedData.bearish.push({
          time: timestamp,
          value: bullishCount + neutralCount + bearishCount
        })
      })

      console.log('📊 Stacked volume data prepared:', stackedData.bullish.length, 'days')
      console.log('📊 Sample stacked data (first day):', {
        bullish: stackedData.bullish[0],
        neutral: stackedData.neutral[0],
        bearish: stackedData.bearish[0]
      })
      console.log('📊 Total across all days:', {
        bullish: stackedData.bullish.reduce((sum, d) => sum + d.value, 0),
        neutral: stackedData.neutral.reduce((sum, d) => sum + d.value, 0) - stackedData.bullish.reduce((sum, d) => sum + d.value, 0),
        bearish: stackedData.bearish.reduce((sum, d) => sum + d.value, 0) - stackedData.neutral.reduce((sum, d) => sum + d.value, 0)
      })

      // Filter out days with no data for this symbol (same as Net Signal filter)
      const activeDays = stackedData.bearish.map(d => d.value > 0)
      stackedData.bullish = stackedData.bullish.filter((_, i) => activeDays[i])
      stackedData.neutral = stackedData.neutral.filter((_, i) => activeDays[i])
      stackedData.bearish = stackedData.bearish.filter((_, i) => activeDays[i])
      console.log('📊 Active days after filtering zeros:', stackedData.bullish.length)

      setStackedVolumeData(stackedData)

      // Process snapshots for INDIVIDUAL mode (one bar per day with color)
      const volumeData = snapshots.map(snapshot => {
        // Force UTC parsing — same fix as stacked mode above
        const rawDate = snapshot.snapshot_date
        const utcStr = typeof rawDate === 'string' && !rawDate.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(rawDate)
          ? rawDate + 'Z'
          : rawDate
        const date = new Date(utcStr)
        // Use the same time format as the candles: date string for daily/weekly, Unix seconds for hourly
        const timestamp = timeframe === 'hourly'
          ? (() => { date.setUTCHours(0, 0, 0, 0); return Math.floor(date.getTime() / 1000) })()
          : date.toISOString().split('T')[0]  // 'YYYY-MM-DD' matches daily/weekly candles
        
        // Find this symbol's data in the snapshot
        const symbolData = snapshot.signals?.find(s => s.symbol === symbol)
        
        if (!symbolData) {
          return {
            time: timestamp,
            value: 0,
            color: '#d6dbd3' // gray if no data
          }
        }

        // Determine color based on signal type
        let color
        if (symbolData.signal_type === 'BULLISH') {
          color = '#16794a' // green
        } else if (symbolData.signal_type === 'BEARISH') {
          color = '#b4232a' // red
        } else {
          color = '#d6dbd3' // gray for neutral
        }

        // Use signal strength as the value
        const value = Math.abs(symbolData.signal_strength) || 0.5

        return {
          time: timestamp,
          value: value,
          color: color
        }
      }).filter(d => d.value > 0) // Remove entries with no data

      console.log('📊 Individual volume bars for', symbol, ':', volumeData.length, 'days')
      console.log('📊 Sample volume data:', volumeData.slice(0, 3))
      setDailySnapshotVolume(volumeData)
      console.log('✅ Volume data state updated')
      
    } catch (error) {
      console.error('Error fetching daily snapshot volume:', error)
      setDailySnapshotVolume([])
      setStackedVolumeData(null)
    }
  }

  const calculateIndicators = (candles) => computeChartIndicators(candles, timeframe)

  // Compute stacked + individual volume bar data from already-calculated indicator arrays.
  // This replaces the daily-snapshots DB API call — full history, always in sync with the chart.
  const computeVolumeFromChartData = (candles, indics, tf) =>
    volumeBarsFromSnapshots(candles, closeSnapshots, tf, liveItem)

  const renderChart = (candles, indicators) => {
    console.log(`[WEEKLY DBG] renderChart called: candles=${candles?.length} tf=${timeframe} chartContainerRef=${!!chartContainerRef.current}`)
    if (!chartContainerRef.current) { console.warn('[WEEKLY DBG] renderChart bailed — no chartContainerRef'); return }
    if (!candles || candles.length === 0) { console.warn('[WEEKLY DBG] renderChart bailed — empty candles'); return }

    // Safe mapper: aligns an indicator array to candle times, skipping any out-of-bounds entries.
    // This guards against transient state mismatches when switching timeframes.
    const safeMap = (data, startIndex) =>
      data.reduce((acc, val, i) => {
        const candle = candles[startIndex + i]
        if (candle && val != null) acc.push({ time: candle.time, value: val })
        return acc
      }, [])

    // Remove existing charts — wrap in try/catch because the container DOM node
    // may already be unmounted (e.g. when closing a fullscreen modal) which causes
    // lightweight-charts to throw, crashing the entire React component tree.
    if (chartRef.current) {
      try { chartRef.current.remove() } catch (e) { /* container already gone */ }
      chartRef.current = null
    }
    if (rsiChartRef.current) {
      try { rsiChartRef.current.remove() } catch (e) { /* container already gone */ }
      rsiChartRef.current = null
    }
    if (macdChartRef.current) {
      try { macdChartRef.current.remove() } catch (e) { /* container already gone */ }
      macdChartRef.current = null
    }

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const estTimeFormatter = (time) => {
      if (typeof time === 'object' && time !== null) {
        // BusinessDay {year, month, day}
        return `${months[time.month - 1]} ${time.day}, ${time.year}`
      }
      if (typeof time === 'string') {
        // 'YYYY-MM-DD' passed directly by lightweight-charts v4
        const [year, month, day] = time.split('-')
        return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`
      }
      // UTCTimestamp (number) — hourly intraday bars
      const d = new Date(time * 1000)
      if (isNaN(d.getTime())) return String(time)
      return d.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
      }) + ' ET'
    }

    // Create main price chart
    const chart = createChart(chartContainerRef.current, {
      localization: { timeFormatter: estTimeFormatter },
      layout: {
        background: { color: '#d6dbd3' },
        textColor: '#43524c',
      },
      grid: {
        vertLines: { color: '#d6dbd3' },
        horzLines: { color: '#d6dbd3' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#d6dbd3',
        scaleMargins: {
          top: 0.05,
          bottom: isPriceChartFullscreen ? 0.15 : (showVolumeMode ? 0.4 : 0.05),
        },
      },
      leftPriceScale: {
        visible: showVolumeMode,  // Only show when volume bars are active
        borderColor: '#d6dbd3',
        scaleMargins: {
          top: isPriceChartFullscreen ? 0.6 : 0.75,
          bottom: 0.05,
        },
      },
      timeScale: {
        borderColor: '#d6dbd3',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 6,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: true,
        rightBarStaysOnScroll: true,
        borderVisible: true,
        visible: true,
        timeVisible: true,
      },
      width: chartContainerRef.current.clientWidth,
      height: isPriceChartFullscreen ? Math.floor(window.innerHeight * 0.65) : 400,
    })

    chartRef.current = chart
    applyChartTheme(chart)

    // Add candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#16794a',
      downColor: '#b4232a',
      borderVisible: true,
      wickUpColor: '#16794a',
      wickDownColor: '#b4232a',
    })
    
    // Debug: Log first few candle timestamps
    candleSeries.setData(candles)

    // MA Cross (EMA 9, EMA 21) arrows: green up = EMA9 crossed above EMA21 (buy),
    // red down = EMA9 crossed below EMA21 (sell)
    const maCrossMarkers = []
    if (visibleIndicators.maCross && indicators.maCross?.data?.shortMA && indicators.maCross?.data?.longMA) {
      const { shortMA, longMA } = indicators.maCross.data
      const shortStart = candles.length - shortMA.length
      const longStart = candles.length - longMA.length
      let prevSide = 0
      for (let ci = longStart; ci < candles.length; ci++) {
        const s = shortMA[ci - shortStart]
        const l = longMA[ci - longStart]
        if (!Number.isFinite(s) || !Number.isFinite(l)) continue
        const side = s > l ? 1 : s < l ? -1 : 0
        if (side !== 0 && prevSide !== 0 && side !== prevSide) {
          maCrossMarkers.push(side > 0
            ? { time: candles[ci].time, position: 'belowBar', color: '#16794a', shape: 'arrowUp', text: 'BUY', size: 2 }
            : { time: candles[ci].time, position: 'aboveBar', color: '#b4232a', shape: 'arrowDown', text: 'SELL', size: 2 })
        }
        if (side !== 0) prevSide = side
      }
    }

    // Add signal markers if not in volume mode, plus MA Cross arrows
    const showSignalMarkers = !showVolumeMode && signalMarkers && signalMarkers.length > 0
    if (showSignalMarkers || maCrossMarkers.length > 0) {
      const toTs = (t) => typeof t === 'number' ? t
        : typeof t === 'string' ? Date.parse(t) / 1000
        : Date.UTC(t.year, t.month - 1, t.day) / 1000
      const allMarkers = [...(showSignalMarkers ? signalMarkers : []), ...maCrossMarkers]
        .sort((a, b) => toTs(a.time) - toTs(b.time))
      candleSeries.setMarkers(allMarkers)
    }

    // Add volume histogram bars if in volume mode (not for hourly)
    if (showVolumeMode && timeframe !== 'hourly') {
      console.log('🔍 Adding volume bars to main chart - volumeBarMode:', volumeBarMode)

      // Build a set of all valid candle times to ensure volume bars never introduce extra timeline slots
      const validCandleTimes = new Set(candles.map(c => c.time))
      
      if (volumeBarMode === 'stacked' && stackedVolumeData) {
        // STACKED MODE - Show Bullish UP (green) and Bearish DOWN (red) from zero line
        console.log('📊 Adding STACKED volume bars:', stackedVolumeData)
        
        // Create two separate histograms: one for bullish (up) and one for bearish (down)
        const bullishHistogramData = []
        const bearishHistogramData = []
        
        stackedVolumeData.bullish.forEach((bullishItem, idx) => {
          const bearishItem = stackedVolumeData.bearish[idx]
          const neutralItem = stackedVolumeData.neutral[idx]

          // Skip dates that have no corresponding candle (weekends, holidays)
          if (!validCandleTimes.has(bullishItem.time)) return
          
          // Extract individual counts from cumulative values
          const bullishCount = bullishItem.value
          const bearishCount = bearishItem ? (bearishItem.value - (neutralItem ? neutralItem.value : 0)) : 0
          
          // Use small actual values - will be tiny compared to price scale
          
          // Only add if there's actual data (skip holidays/empty days)
          if (bullishCount > 0 || bearishCount > 0) {
            // Bullish bars go UP (positive)
            bullishHistogramData.push({
              time: bullishItem.time,
              value: bullishCount,  // Use actual count
              color: '#16794a'
            })
            
            // Bearish bars go DOWN (negative)
            bearishHistogramData.push({
              time: bullishItem.time,
              value: -bearishCount,  // Negative value
              color: '#b4232a'
            })
          }
        })
        
        // Add bullish histogram (green bars going up)
        const bullishSeries = chart.addHistogramSeries({
          priceFormat: {
            type: 'volume',
          },
          priceScaleId: 'left',  // Use left scale for volume
        })
        bullishSeries.setData(bullishHistogramData)
        
        // Add bearish histogram (red bars going down)
        const bearishSeries = chart.addHistogramSeries({
          priceFormat: {
            type: 'volume',
          },
          priceScaleId: 'left',  // Use left scale for volume
        })
        bearishSeries.setData(bearishHistogramData)
        
        // Set fixed visible range for volume scale to prevent auto-scale compression
        const maxVolume = Math.max(
          ...bullishHistogramData.map(d => Math.abs(d.value)),
          ...bearishHistogramData.map(d => Math.abs(d.value))
        )
        chart.priceScale('left').applyOptions({
          scaleMargins: {
            top: 0.75,
            bottom: 0.05,
          },
          autoScale: false,
        })
        // Force the min/max range
        setTimeout(() => {
          chart.priceScale('left').applyOptions({
            autoScale: true,  // Let it scale within the margin
          })
        }, 100)
        
      } else if (volumeBarMode === 'individual' && dailySnapshotVolume && dailySnapshotVolume.length > 0) {
        // INDIVIDUAL MODE - Show signal strength: positive if bullish, negative if bearish
        console.log('📊 Adding INDIVIDUAL volume bars:', dailySnapshotVolume.length, 'days')
        
        const scaleFactor = 1  // Use actual values
        
        // Convert to histogram format based on signal type, filter out empty days and non-candle dates
        const volumeHistogramData = dailySnapshotVolume
          .filter(item => item.value > 0 && validCandleTimes.has(item.time))  // Skip days with no signals or no candle
          .map(item => {
            // If color is green/bullish, make positive; if red/bearish, make negative
            const isPositive = item.color === '#16794a' || item.color === '#16794a'
            return {
              time: item.time,
              value: (isPositive ? item.value : -item.value) * scaleFactor,
              color: item.color
            }
          })
        
        const volumeSeries = chart.addHistogramSeries({
          priceFormat: {
            type: 'custom',
            formatter: (price) => `Signal: ${Math.abs(price).toFixed(1)}`
          },
          priceScaleId: 'left',  // Use left scale for volume
        })
        volumeSeries.setData(volumeHistogramData)
        
        // Set fixed visible range for volume scale
        chart.priceScale('left').applyOptions({
          scaleMargins: {
            top: 0.75,
            bottom: 0.05,
          },
          autoScale: true,
        })
      }
    }

    // Add Bollinger Bands (support both daily and weekly data structures)
    if (visibleIndicators.bollingerBands) {
      // Daily uses indicators.bollinger.data, Weekly uses indicators.bollingerBands with direct arrays
      const bbData = indicators.bollinger?.data || 
                     (indicators.bollingerBands?.upperData ? {
                       upper: indicators.bollingerBands.upperData,
                       middle: indicators.bollingerBands.middleData,
                       lower: indicators.bollingerBands.lowerData
                     } : null)
      
      if (bbData) {
        const bbStartIndex = candles.length - bbData.upper.length

        const upperBandSeries = chart.addLineSeries({
          color: '#6a4a8c',
          lineWidth: 2,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        })
        upperBandSeries.setData(safeMap(bbData.upper, bbStartIndex))

        const middleBandSeries = chart.addLineSeries({
          color: '#2f5f9e',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        })
        middleBandSeries.setData(safeMap(bbData.middle, bbStartIndex))

        const lowerBandSeries = chart.addLineSeries({
          color: '#6a4a8c',
          lineWidth: 2,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        })
        lowerBandSeries.setData(safeMap(bbData.lower, bbStartIndex))
      }
    }

    // Add EMA 9 (Daily)
    if (visibleIndicators.ema9 && indicators.ema9 && indicators.ema9.data) {
      const ema9StartIndex = candles.length - indicators.ema9.data.length
      const ema9Series = chart.addLineSeries({
        color: '#16794a',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      ema9Series.setData(safeMap(indicators.ema9.data, ema9StartIndex))
    }

    // Add MA Cross lines (Daily): EMA 9 fast (green) and EMA 21 slow (red)
    if (visibleIndicators.maCross && indicators.maCross?.data?.shortMA && indicators.maCross?.data?.longMA) {
      const { shortMA, longMA } = indicators.maCross.data
      const fastSeries = chart.addLineSeries({
        color: '#16794a',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        title: 'EMA9',
      })
      fastSeries.setData(safeMap(shortMA, candles.length - shortMA.length))
      const slowSeries = chart.addLineSeries({
        color: '#b4232a',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        title: 'EMA21',
      })
      slowSeries.setData(safeMap(longMA, candles.length - longMA.length))
    }

    // Add EMA 20 (Daily or Weekly)
    if (visibleIndicators.ema20 && indicators.ema20 && indicators.ema20.data) {
      const ema20StartIndex = candles.length - indicators.ema20.data.length
      const ema20Series = chart.addLineSeries({
        color: '#2f5f9e',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      ema20Series.setData(safeMap(indicators.ema20.data, ema20StartIndex))
    }

    // Add EMA 50 (Daily)
    if (visibleIndicators.ema50 && indicators.ema50 && indicators.ema50.data) {
      const ema50StartIndex = candles.length - indicators.ema50.data.length
      const ema50Series = chart.addLineSeries({
        color: '#b8661a',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      ema50Series.setData(safeMap(indicators.ema50.data, ema50StartIndex))
    }

    // Add EMA 100 (Hourly)
    if (visibleIndicators.ema100 && indicators.ema100 && indicators.ema100.data) {
      const ema100StartIndex = candles.length - indicators.ema100.data.length
      const ema100Series = chart.addLineSeries({
        color: '#2e7f80',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      ema100Series.setData(safeMap(indicators.ema100.data, ema100StartIndex))
    }

    // Add EMA 200 (Daily)
    if (visibleIndicators.ema200 && indicators.ema200 && indicators.ema200.data) {
      const ema200StartIndex = candles.length - indicators.ema200.data.length
      const ema200Series = chart.addLineSeries({
        color: '#b4232a',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      ema200Series.setData(safeMap(indicators.ema200.data, ema200StartIndex))
    }

    // Fit content
    chart.timeScale().fitContent()

    // Create RSI chart if visible
    if (visibleIndicators.rsi && rsiChartContainerRef.current && indicators.rsi && indicators.rsi.data) {
      const rsiChart = createChart(rsiChartContainerRef.current, {
        localization: { timeFormatter: estTimeFormatter },
        layout: {
          background: { color: '#d6dbd3' },
          textColor: '#43524c',
        },
        grid: {
          vertLines: { color: '#d6dbd3' },
          horzLines: { color: '#d6dbd3' },
        },
        crosshair: {
          mode: 1,
        },
        rightPriceScale: {
          borderColor: '#d6dbd3',
        },
        timeScale: {
          borderColor: '#d6dbd3',
          timeVisible: true,
          secondsVisible: false,
          visible: isRsiChartFullscreen ? true : false,
        },
        width: rsiChartContainerRef.current.clientWidth,
        height: isRsiChartFullscreen ? Math.floor(window.innerHeight * 0.65) : 150,
      })

      rsiChartRef.current = rsiChart
      applyChartTheme(rsiChart)

      // Add RSI line
      const rsiSeries = rsiChart.addLineSeries({
        color: '#6a4a8c',
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true,
      })

      const rsiStartIndex = candles.length - indicators.rsi.data.length
      rsiSeries.setData(safeMap(indicators.rsi.data, rsiStartIndex))

      // Signal thresholds per Trading Rules: BUY < 40, SELL > 80
      const oversoldLine = rsiChart.addLineSeries({
        color: '#16794a',
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      oversoldLine.setData(candles.map(c => ({ time: c.time, value: 40 })))

      const overboughtLine = rsiChart.addLineSeries({
        color: '#b4232a',
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      overboughtLine.setData(candles.map(c => ({ time: c.time, value: 80 })))

      rsiChart.timeScale().fitContent()

      // Sync time scales
      chart.timeScale().subscribeVisibleTimeRangeChange(() => {
        const timeRange = chart.timeScale().getVisibleRange()
        if (timeRange) {
          rsiChart.timeScale().setVisibleRange(timeRange)
        }
      })
    }

    // Create MACD chart if visible
    if (visibleIndicators.macd && macdChartContainerRef.current && indicators.macd && indicators.macd.data) {
      const macdChart = createChart(macdChartContainerRef.current, {
        localization: { timeFormatter: estTimeFormatter },
        layout: {
          background: { color: '#d6dbd3' },
          textColor: '#43524c',
        },
        grid: {
          vertLines: { color: '#d6dbd3' },
          horzLines: { color: '#d6dbd3' },
        },
        crosshair: {
          mode: 1,
        },
        rightPriceScale: {
          borderColor: '#d6dbd3',
        },
        timeScale: {
          borderColor: '#d6dbd3',
          timeVisible: true,
          secondsVisible: false,
          visible: isMacdChartFullscreen ? true : false,
        },
        width: macdChartContainerRef.current.clientWidth,
        height: isMacdChartFullscreen ? Math.floor(window.innerHeight * 0.65) : 150,
      })

      macdChartRef.current = macdChart
      applyChartTheme(macdChart)

      const macdData = indicators.macd.data
      const macdStartIndex = candles.length - macdData.macd.length

      // Add MACD line
      const macdSeries = macdChart.addLineSeries({
        color: '#2f5f9e',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      })
      macdSeries.setData(safeMap(macdData.macd, macdStartIndex))

      // Add Signal line
      const signalStartIndex = candles.length - macdData.signal.length
      const signalSeries = macdChart.addLineSeries({
        color: '#b8661a',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      })
      signalSeries.setData(safeMap(macdData.signal, signalStartIndex))

      // Add Histogram
      const histogramStartIndex = candles.length - macdData.histogram.length
      const histogramSeries = macdChart.addHistogramSeries({
        color: '#16794a',
        priceLineVisible: false,
        lastValueVisible: false,
      })
      histogramSeries.setData(macdData.histogram.reduce((acc, val, i) => {
        const candle = candles[histogramStartIndex + i]
        if (candle && val != null) acc.push({ time: candle.time, value: val, color: val >= 0 ? '#16794a' : '#b4232a' })
        return acc
      }, []))

      macdChart.timeScale().fitContent()

      // Sync time scales
      chart.timeScale().subscribeVisibleTimeRangeChange(() => {
        const timeRange = chart.timeScale().getVisibleRange()
        if (timeRange) {
          macdChart.timeScale().setVisibleRange(timeRange)
        }
      })
    }

  }

  const handleOverlayClick = (e) => {
    // Removed - only close via X button now
  }

  const handleEscapeKey = (e) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  // Add ESC key listener
  useEffect(() => {
    document.addEventListener('keydown', handleEscapeKey)
    return () => {
      document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [])

  const toggleIndicator = (indicatorName) => {
    setVisibleIndicators(prev => ({
      ...prev,
      [indicatorName]: !prev[indicatorName]
    }))
  }

  if (!symbol) return null

  const getTimeframeLabel = () => {
    switch(timeframe) {
      case 'hourly': return '1H'
      case 'daily': return '1D'
      case 'weekly': return '1W'
      default: return '1D'
    }
  }

  return (
    <div className="chart-modal-overlay">
      <div className="chart-modal">
        <div className="chart-modal-header">
          <div className="chart-modal-title">
            <h2><ChartCandlestick size={18} /> Technical Analysis</h2>
            <span className="chart-symbol-badge">{symbol}</span>
            <span className="chart-timeframe-badge">{getTimeframeLabel()}</span>
          </div>
          <button className="chart-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="chart-modal-body">
          {/* Timeframe Selector */}
          <div className="timeframe-selector">
            <div className="timeframe-label"><Clock size={14} /> Timeframe</div>
            <div className="timeframe-buttons">
              <button 
                className={`timeframe-btn ${timeframe === 'hourly' ? 'active' : ''}`}
                onClick={() => setTimeframe('hourly')}
              >
                Hourly
              </button>
              <button 
                className={`timeframe-btn ${timeframe === 'daily' ? 'active' : ''}`}
                onClick={() => setTimeframe('daily')}
              >
                Daily
              </button>
              <button 
                className={`timeframe-btn ${timeframe === 'weekly' ? 'active' : ''}`}
                onClick={() => setTimeframe('weekly')}
              >
                Weekly
              </button>
            </div>
          </div>

          {loading ? (
            <div className="chart-loading">
              <div className="chart-loading-spinner"></div>
              <p>Loading chart data...</p>
            </div>
          ) : error ? (
            <div className="chart-error">
              <div className="chart-error-icon"><TriangleAlert size={36} strokeWidth={1.5} /></div>
              <p>{error}</p>
            </div>
          ) : (
            <>
              {/* Price Info */}
              <div className="chart-info-grid">
                <div className="chart-info-item">
                  <div className="chart-info-label">Current Price</div>
                  <div className="chart-info-value">${indicators.price?.toFixed(2)}</div>
                </div>
                <div className="chart-info-item">
                  <div className="chart-info-label">Change</div>
                  <div className={`chart-info-value price-change ${parseFloat(indicators.change) >= 0 ? 'positive' : 'negative'}`}>
                    {parseFloat(indicators.change) >= 0 ? '+' : ''}{indicators.change}%
                  </div>
                </div>
                <div className="chart-info-item">
                  <div className="chart-info-label">Candles</div>
                  <div className="chart-info-value">{chartData?.length || 0}</div>
                </div>
              </div>

              {/* Signal Display Toggle - Show when signal data is available */}
              {(() => {
                console.log('🔍 Toggle visibility check - dailySnapshotVolume:', dailySnapshotVolume?.length, 'signalMarkers:', signalMarkers?.length)
                return (dailySnapshotVolume?.length > 0 || signalMarkers?.length > 0)
              })() && (
                <>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  gap: '12px',
                  marginBottom: '16px',
                  padding: '12px',
                  background: 'var(--paper)',
                  border: '1px solid #374151',
                  borderRadius: '8px'
                }}>
                  <span style={{ color: 'var(--text-2)', fontSize: '14px', fontWeight: '500' }}>
                    Signal Display:
                  </span>
                  {timeframe !== 'hourly' && (
                  <button
                    onClick={() => setShowVolumeMode(true)}
                    style={{
                      padding: '6px 16px',
                      borderRadius: '4px',
                      border: showVolumeMode ? '2px solid #3b82f6' : '1px solid #4b5563',
                      background: showVolumeMode ? '#2f5f9e' : '#d6dbd3',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: showVolumeMode ? '600' : '400',
                      transition: 'all 0.2s'
                    }}
                  >
                    <ChartColumn size={14} /> Volume Bars
                  </button>
                  )}
                  <button
                    onClick={() => setShowVolumeMode(false)}
                    style={{
                      padding: '6px 16px',
                      borderRadius: '4px',
                      border: !showVolumeMode ? '2px solid #3b82f6' : '1px solid #4b5563',
                      background: !showVolumeMode ? '#2f5f9e' : '#d6dbd3',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: !showVolumeMode ? '600' : '400',
                      transition: 'all 0.2s'
                    }}
                  >
                    <MapPin size={14} /> Individual Signals
                  </button>
                </div>

                {/* Volume Bar Mode Toggle - Show when in volume mode */}
                {showVolumeMode && (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    gap: '12px',
                    marginBottom: '16px',
                    padding: '12px',
                    background: 'var(--paper)',
                    border: '1px solid #374151',
                    borderRadius: '8px'
                  }}>
                    <span style={{ color: 'var(--text-2)', fontSize: '14px', fontWeight: '500' }}>
                      Volume Style:
                    </span>
                    <button
                      onClick={() => setVolumeBarMode('stacked')}
                      style={{
                        padding: '6px 16px',
                        borderRadius: '4px',
                        border: volumeBarMode === 'stacked' ? '2px solid #10B981' : '1px solid #4b5563',
                        background: volumeBarMode === 'stacked' ? '#16794a' : '#d6dbd3',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: volumeBarMode === 'stacked' ? '600' : '400',
                        transition: 'all 0.2s'
                      }}
                    >
                      <ChartColumnStacked size={14} /> Total Signal
                    </button>
                    <button
                      onClick={() => setVolumeBarMode('individual')}
                      style={{
                        padding: '6px 16px',
                        borderRadius: '4px',
                        border: volumeBarMode === 'individual' ? '2px solid #10B981' : '1px solid #4b5563',
                        background: volumeBarMode === 'individual' ? '#16794a' : '#d6dbd3',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: volumeBarMode === 'individual' ? '600' : '400',
                        transition: 'all 0.2s'
                      }}
                    >
                      <ChartColumnBig size={14} /> Net Signal
                    </button>
                  </div>
                )}
                </>
              )}

              {/* Signal Volume Panel - Show when in volume mode */}
              {(() => {
                console.log('🔍 Volume panel check - showVolumeMode:', showVolumeMode, 'dailySnapshotVolume:', dailySnapshotVolume?.length)
                return showVolumeMode && (dailySnapshotVolume?.length > 0 || stackedVolumeData)
              })() && (
                <div className="signal-markers-panel" style={{
                  background: 'var(--paper)',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-2)' }}>
                    <ChartColumn size={14} /> Daily Signal Volume - {volumeBarMode === 'stacked' ? `${stackedVolumeData?.bullish?.length || 0} Days` : `${dailySnapshotVolume.length} Days`}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                    {volumeBarMode === 'stacked' 
                      ? <>Total Signal bars show signal counts: <span className="dot dot-bull" /> Bullish · <span className="dot dot-neutral" /> Neutral · <span className="dot dot-bear" /> Bearish</>
                      : <>Net Signal bars show signal strength by type: <span className="dot dot-bull" /> Bullish · <span className="dot dot-neutral" /> Neutral · <span className="dot dot-bear" /> Bearish</>}
                  </div>
                </div>
              )}

              {/* Signal Markers Panel - Show when in marker mode */}
              {!showVolumeMode && signalMarkers && signalMarkers.length > 0 && (
                <div className="signal-markers-panel" style={{
                  background: 'var(--paper)',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-2)' }}>
                    <MapPin size={14} /> {signalMarkers.length} Signal{signalMarkers.length !== 1 ? 's' : ''} Marked on Chart
                  </div>
                  <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                    {signalMarkers.map((marker, idx) => (
                      <div key={idx} style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '6px 8px',
                        marginBottom: '4px',
                        background: 'var(--paper-3)',
                        borderRadius: '4px',
                        fontSize: '12px'
                      }}>
                        <span style={{ marginRight: '8px' }}>{marker.text}</span>
                        <span style={{ 
                          marginLeft: 'auto',
                          marginRight: '8px',
                          color: 'var(--text-3)',
                          fontSize: '11px'
                        }}>
                          {marker.timeframe || ''}
                        </span>
                        <span style={{ 
                          color: 'var(--text-3)',
                          fontSize: '11px'
                        }}>
                          {new Date(marker.time * 1000).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Indicator Toggle Checkboxes - Show only relevant indicators for timeframe */}
              <div className="indicator-toggles">
                <div className="toggle-header">
                  <span className="toggle-title"><SlidersHorizontal size={14} /> {timeframe.charAt(0).toUpperCase() + timeframe.slice(1)} Indicators</span>
                  <span className="toggle-subtitle">Available for this timeframe</span>
                </div>
                <div className="toggle-grid">
                  {/* Hourly: EMA 100 only */}
                  {timeframe === 'hourly' && (
                    <label className="toggle-item">
                      <input
                        type="checkbox"
                        checked={visibleIndicators.ema100}
                        onChange={() => toggleIndicator('ema100')}
                      />
                      <span className="toggle-label">
                        <span className="toggle-color" style={{ background: 'var(--series-teal)' }}></span>
                        EMA 100
                      </span>
                    </label>
                  )}

                  {/* Weekly: Bollinger Bands + EMA 20 */}
                  {timeframe === 'weekly' && (
                    <>
                      <label className="toggle-item">
                        <input
                          type="checkbox"
                          checked={visibleIndicators.bollingerBands}
                          onChange={() => toggleIndicator('bollingerBands')}
                        />
                        <span className="toggle-label">
                          <span className="toggle-color" style={{ background: 'var(--series-violet)' }}></span>
                          Bollinger Bands
                        </span>
                      </label>
                      
                      <label className="toggle-item">
                        <input
                          type="checkbox"
                          checked={visibleIndicators.ema20}
                          onChange={() => toggleIndicator('ema20')}
                        />
                        <span className="toggle-label">
                          <span className="toggle-color" style={{ background: 'var(--info)' }}></span>
                          EMA 20
                        </span>
                      </label>
                    </>
                  )}

                  {/* Daily: 7 indicators (removed BB) */}
                  {timeframe === 'daily' && (
                    <>
                      <label className="toggle-item">
                        <input
                          type="checkbox"
                          checked={visibleIndicators.rsi}
                          onChange={() => toggleIndicator('rsi')}
                        />
                        <span className="toggle-label">
                          <span className="toggle-color" style={{ background: 'var(--series-violet)' }}></span>
                          RSI Panel
                        </span>
                      </label>
                      
                      <label className="toggle-item">
                        <input
                          type="checkbox"
                          checked={visibleIndicators.ema9}
                          onChange={() => toggleIndicator('ema9')}
                        />
                        <span className="toggle-label">
                          <span className="toggle-color" style={{ background: 'var(--bull)' }}></span>
                          EMA 9
                        </span>
                      </label>

                      <label className="toggle-item">
                        <input
                          type="checkbox"
                          checked={visibleIndicators.ema20}
                          onChange={() => toggleIndicator('ema20')}
                        />
                        <span className="toggle-label">
                          <span className="toggle-color" style={{ background: 'var(--info)' }}></span>
                          EMA 20
                        </span>
                      </label>

                      <label className="toggle-item">
                        <input
                          type="checkbox"
                          checked={visibleIndicators.ema50}
                          onChange={() => toggleIndicator('ema50')}
                        />
                        <span className="toggle-label">
                          <span className="toggle-color" style={{ background: 'var(--series-orange)' }}></span>
                          EMA 50
                        </span>
                      </label>

                      <label className="toggle-item">
                        <input
                          type="checkbox"
                          checked={visibleIndicators.ema200}
                          onChange={() => toggleIndicator('ema200')}
                        />
                        <span className="toggle-label">
                          <span className="toggle-color" style={{ background: 'var(--bear)' }}></span>
                          EMA 200
                        </span>
                      </label>

                      <label className="toggle-item">
                        <input
                          type="checkbox"
                          checked={visibleIndicators.maCross}
                          onChange={() => toggleIndicator('maCross')}
                        />
                        <span className="toggle-label">
                          <span className="toggle-color" style={{ background: 'linear-gradient(90deg, #22c55e 50%, #f87171 50%)' }}></span>
                          MA Cross (EMA 9, EMA 21)
                        </span>
                      </label>

                      <label className="toggle-item">
                        <input
                          type="checkbox"
                          checked={visibleIndicators.macd}
                          onChange={() => toggleIndicator('macd')}
                        />
                        <span className="toggle-label">
                          <span className="toggle-color" style={{ background: 'var(--info)' }}></span>
                          MACD Panel
                        </span>
                      </label>
                    </>
                  )}
                </div>
              </div>

              {/* Chart */}
              {!isPriceChartFullscreen ? (
                <div className="chart-container-wrapper">
                  <div className="chart-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Price Chart</span>
                    <button 
                      className="chart-zoom-btn"
                      onClick={() => setIsPriceChartFullscreen(true)}
                      title="Expand to fullscreen"
                      style={{
                        padding: '6px 12px',
                        background: 'var(--info)',
                        border: '1px solid #2563eb',
                        borderRadius: '6px',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.85rem',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#2f5f9e'
                        e.currentTarget.style.transform = 'translateY(-1px)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#2f5f9e'
                        e.currentTarget.style.transform = 'translateY(0)'
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                      </svg>
                      Fullscreen
                    </button>
                  </div>
                  <div ref={chartContainerRef} className="chart-container-two" style={{ height: '400px' }} />
                </div>
              ) : (
                <FullscreenChartModal
                  isOpen={isPriceChartFullscreen}
                  onClose={() => setIsPriceChartFullscreen(false)}
                  title={`${symbol} - Price Chart (${timeframe.charAt(0).toUpperCase() + timeframe.slice(1)})`}
                >
                  <div className="chart-container-wrapper">
                    <div ref={chartContainerRef} className="chart-container" style={{ height: `${Math.floor(window.innerHeight * 0.65)}px`, width: '100%' }} />
                  </div>
                </FullscreenChartModal>
              )}

              {/* RSI Chart */}
              {visibleIndicators.rsi && !isRsiChartFullscreen && (
                <div className="chart-container-wrapper">
                  <div className="chart-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>RSI (9)</span>
                    <button 
                      className="chart-zoom-btn"
                      onClick={() => setIsRsiChartFullscreen(true)}
                      title="Expand to fullscreen"
                      style={{
                        padding: '6px 12px',
                        background: 'var(--info)',
                        border: '1px solid #2563eb',
                        borderRadius: '6px',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.85rem',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#2f5f9e'
                        e.currentTarget.style.transform = 'translateY(-1px)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#2f5f9e'
                        e.currentTarget.style.transform = 'translateY(0)'
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                      </svg>
                      Fullscreen
                    </button>
                  </div>
                  <div ref={rsiChartContainerRef} className="chart-container-tt" style={{ height: '150px' }} />
                </div>
              )}

              {/* Fullscreen RSI Chart */}
              {visibleIndicators.rsi && isRsiChartFullscreen && (
                <FullscreenChartModal
                  isOpen={isRsiChartFullscreen}
                  onClose={() => setIsRsiChartFullscreen(false)}
                  title={`${symbol} - RSI (9) Chart (${timeframe.charAt(0).toUpperCase() + timeframe.slice(1)})`}
                >
                  <div className="chart-container-wrapper">
                    <div ref={rsiChartContainerRef} className="chart-container" style={{ height: `${Math.floor(window.innerHeight * 0.65)}px`, width: '100%' }} />
                  </div>
                </FullscreenChartModal>
              )}

              {/* MACD Chart */}
              {visibleIndicators.macd && !isMacdChartFullscreen && (
                <div className="chart-container-wrapper">
                  <div className="chart-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>MACD (12, 26, 9)</span>
                    <button 
                      className="chart-zoom-btn"
                      onClick={() => setIsMacdChartFullscreen(true)}
                      title="Expand to fullscreen"
                      style={{
                        padding: '6px 12px',
                        background: 'var(--info)',
                        border: '1px solid #2563eb',
                        borderRadius: '6px',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.85rem',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#2f5f9e'
                        e.currentTarget.style.transform = 'translateY(-1px)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#2f5f9e'
                        e.currentTarget.style.transform = 'translateY(0)'
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                      </svg>
                      Fullscreen
                    </button>
                  </div>
                  <div ref={macdChartContainerRef} className="chart-container-tt" style={{ height: '150px' }} />
                </div>
              )}

              {/* Fullscreen MACD Chart */}
              {visibleIndicators.macd && isMacdChartFullscreen && (
                <FullscreenChartModal
                  isOpen={isMacdChartFullscreen}
                  onClose={() => setIsMacdChartFullscreen(false)}
                  title={`${symbol} - MACD (12, 26, 9) Chart (${timeframe.charAt(0).toUpperCase() + timeframe.slice(1)})`}
                >
                  <div className="chart-container-wrapper">
                    <div ref={macdChartContainerRef} className="chart-container" style={{ height: `${Math.floor(window.innerHeight * 0.65)}px`, width: '100%' }} />
                  </div>
                </FullscreenChartModal>
              )}

              {/* Technical Indicators Cards - Show only relevant for timeframe */}
              <div className="chart-indicators-panel">
                {/* RSI (Daily only) */}
                {timeframe === 'daily' && visibleIndicators.rsi && indicators.rsi && (
                  <div className="indicator-card">
                    <div className="indicator-card-header">
                      <span className="indicator-name">RSI 9</span>
                      <span className={`indicator-signal ${indicators.rsi?.signal}`}>
                        {indicators.rsi?.signal}
                      </span>
                    </div>
                    <div className="indicator-value">{indicators.rsi?.value || 'N/A'}</div>
                  </div>
                )}

                {/* Bollinger Bands (Weekly only) */}
                {timeframe === 'weekly' && visibleIndicators.bollingerBands && (
                  <div className="indicator-card">
                    <div className="indicator-card-header">
                      <span className="indicator-name">Bollinger Bands</span>
                      <span className={`indicator-signal ${(indicators.bollinger?.signal || indicators.bollingerBands?.signal)}`}>
                        {indicators.bollinger?.signal || indicators.bollingerBands?.signal}
                      </span>
                    </div>
                    <div className="indicator-value">
                      U: {indicators.bollinger?.upper || indicators.bollingerBands?.upper || 'N/A'}<br/>
                      M: {indicators.bollinger?.middle || indicators.bollingerBands?.middle || 'N/A'}<br/>
                      L: {indicators.bollinger?.lower || indicators.bollingerBands?.lower || 'N/A'}
                    </div>
                  </div>
                )}

                {/* EMA 9 (Daily only) */}
                {timeframe === 'daily' && visibleIndicators.ema9 && indicators.ema9 && (
                  <div className="indicator-card">
                    <div className="indicator-card-header">
                      <span className="indicator-name">EMA 9</span>
                      <span className={`indicator-signal ${indicators.ema9?.signal}`}>
                        {indicators.ema9?.signal}
                      </span>
                    </div>
                    <div className="indicator-value">{indicators.ema9?.value || 'N/A'}</div>
                  </div>
                )}

                {/* EMA 20 (Daily or Weekly) */}
                {(timeframe === 'daily' || timeframe === 'weekly') && visibleIndicators.ema20 && indicators.ema20 && (
                  <div className="indicator-card">
                    <div className="indicator-card-header">
                      <span className="indicator-name">EMA 20</span>
                      <span className={`indicator-signal ${indicators.ema20?.signal}`}>
                        {indicators.ema20?.signal}
                      </span>
                    </div>
                    <div className="indicator-value">{indicators.ema20?.value || 'N/A'}</div>
                  </div>
                )}

                {/* EMA 50 (Daily only) */}
                {timeframe === 'daily' && visibleIndicators.ema50 && indicators.ema50 && (
                  <div className="indicator-card">
                    <div className="indicator-card-header">
                      <span className="indicator-name">EMA 50</span>
                      <span className={`indicator-signal ${indicators.ema50?.signal}`}>
                        {indicators.ema50?.signal}
                      </span>
                    </div>
                    <div className="indicator-value">{indicators.ema50?.value || 'N/A'}</div>
                  </div>
                )}

                {/* EMA 100 (Hourly only) */}
                {timeframe === 'hourly' && visibleIndicators.ema100 && indicators.ema100 && (
                  <div className="indicator-card">
                    <div className="indicator-card-header">
                      <span className="indicator-name">EMA 100</span>
                      <span className={`indicator-signal ${indicators.ema100?.signal}`}>
                        {indicators.ema100?.signal}
                      </span>
                    </div>
                    <div className="indicator-value">{indicators.ema100?.value || 'N/A'}</div>
                  </div>
                )}

                {/* EMA 200 (Daily only) */}
                {timeframe === 'daily' && visibleIndicators.ema200 && indicators.ema200 && (
                  <div className="indicator-card">
                    <div className="indicator-card-header">
                      <span className="indicator-name">EMA 200</span>
                      <span className={`indicator-signal ${indicators.ema200?.signal}`}>
                        {indicators.ema200?.signal}
                      </span>
                    </div>
                    <div className="indicator-value">{indicators.ema200?.value || 'N/A'}</div>
                  </div>
                )}

                {/* MACD (Daily only) */}
                {timeframe === 'daily' && visibleIndicators.macd && indicators.macd && (
                  <div className="indicator-card">
                    <div className="indicator-card-header">
                      <span className="indicator-name">MACD</span>
                      <span className={`indicator-signal ${indicators.macd?.signal}`}>
                        {indicators.macd?.signal}
                      </span>
                    </div>
                    <div className="indicator-value">
                      MACD: {indicators.macd?.macd || 'N/A'}<br/>
                      Signal: {indicators.macd?.signal || 'N/A'}<br/>
                      Hist: {indicators.macd?.histogram || 'N/A'}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChartModal
