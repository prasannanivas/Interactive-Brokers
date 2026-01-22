import React, { useEffect, useRef, useState } from 'react'
import { createChart } from 'lightweight-charts'
import { historyAPI } from '../api/api'
import './ChartModal.css'

const ChartModal = ({ symbol, onClose }) => {
  const chartContainerRef = useRef(null)
  const rsiChartContainerRef = useRef(null)
  const macdChartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const rsiChartRef = useRef(null)
  const macdChartRef = useRef(null)
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

  useEffect(() => {
    if (!symbol) return

    // Reset visible indicators based on timeframe
    const availableIndicators = indicatorAvailability[timeframe] || []
    const newVisibleState = {}
    Object.keys(visibleIndicators).forEach(key => {
      newVisibleState[key] = availableIndicators.includes(key)
    })
    setVisibleIndicators(newVisibleState)

    fetchChartData()

    // Cleanup on unmount
    return () => {
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
      if (rsiChartRef.current) {
        rsiChartRef.current.remove()
        rsiChartRef.current = null
      }
      if (macdChartRef.current) {
        macdChartRef.current.remove()
        macdChartRef.current = null
      }
    }
  }, [symbol, timeframe]) // Re-fetch when timeframe changes

  // Re-render chart when visible indicators change
  useEffect(() => {
    if (chartData && indicators && Object.keys(indicators).length > 0) {
      renderChart(chartData, indicators)
    }
  }, [visibleIndicators, chartData, indicators])

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

  const fetchChartData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Check cache first (5 minute expiry)
      const now = Date.now()
      const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes in milliseconds
      
      if (cache[timeframe] && (now - cache[timeframe].timestamp) < CACHE_DURATION) {
        console.log(`📦 Using cached ${timeframe} data`)
        const cached = cache[timeframe]
        setChartData(cached.data)
        setIndicators(cached.indicators)
        setLoading(false)
        return
      }

      console.log(`🔄 Fetching fresh ${timeframe} data...`)

      // Determine days and timespan based on timeframe
      let days, timespan
      switch(timeframe) {
        case 'hourly':
          days = 42      // 42 days * 24 hours = ~1000 candles
          timespan = 'hour'
          break
        case 'daily':
          days = 365     // 365 days = 1 year
          timespan = 'day'
          break
        case 'weekly':
          days = 1825    // 5 years = ~260 weeks
          timespan = 'week'
          break
        default:
          days = 365
          timespan = 'day'
      }

      // Fetch candles with correct timespan from Massive API
      const response = await historyAPI.getPriceHistory(symbol, days, timespan)
      const candles = response.data.candles

      if (!candles || candles.length === 0) {
        setError('No price data available')
        setLoading(false)
        return
      }

      // Sort candles by time
      const sortedCandles = [...candles].sort((a, b) => a.time - b.time)
      
      // Use all candles for proper indicator calculation
      const candlesToUse = sortedCandles

      // Calculate technical indicators on full dataset
      const calculatedIndicators = calculateIndicators(candlesToUse)
      
      // Update cache for this timeframe
      setCache(prevCache => ({
        ...prevCache,
        [timeframe]: {
          data: candlesToUse,
          indicators: calculatedIndicators,
          timestamp: now
        }
      }))
      
      setIndicators(calculatedIndicators)
      setChartData(candlesToUse)
      setLoading(false)
    } catch (err) {
      console.error('Failed to fetch chart data:', err)
      setError(err.response?.data?.detail || 'Failed to load chart data')
      setLoading(false)
    }
  }

  const calculateIndicators = (candles) => {
    const closes = candles.map(c => c.close)
    const highs = candles.map(c => c.high)
    const lows = candles.map(c => c.low)
    
    // Adjust indicator periods based on timeframe (per Boss's rules)
    let indicators = {}
    
    if (timeframe === 'hourly') {
      // HOURLY: Rule 1 - EMA 100 only
      const ema100 = calculateEMA(closes, 100)
      const currentPrice = closes[closes.length - 1]
      const currentEMA100 = ema100[ema100.length - 1]
      
      return {
        ema100: { 
          value: currentEMA100?.toFixed(2), 
          signal: currentPrice > currentEMA100 ? 'buy' : 'sell', 
          data: ema100, 
          label: 'EMA 100' 
        },
        price: currentPrice,
        change: candles.length > 1 ? ((currentPrice - candles[0].close) / candles[0].close * 100).toFixed(2) : 0
      }
    } else if (timeframe === 'weekly') {
      // WEEKLY: Bollinger Bands + EMA 20
      const bbPeriod = 20
      const bb = calculateBollingerBands(closes, bbPeriod, 2)
      const ema20 = calculateEMA(closes, 20)
      const currentPrice = closes[closes.length - 1]
      const currentEMA20 = ema20[ema20.length - 1]
      const currentBBUpper = bb.upper[bb.upper.length - 1]
      const currentBBMiddle = bb.middle[bb.middle.length - 1]
      const currentBBLower = bb.lower[bb.lower.length - 1]
      
      const bbSignal = currentPrice > currentBBUpper ? 'sell' : currentPrice < currentBBLower ? 'buy' : 'neutral'
      
      return {
        bollingerBands: {
          upper: currentBBUpper?.toFixed(2),
          middle: currentBBMiddle?.toFixed(2),
          lower: currentBBLower?.toFixed(2),
          signal: bbSignal,
          upperData: bb.upper,
          middleData: bb.middle,
          lowerData: bb.lower,
          label: 'Bollinger Bands (20,2)'
        },
        ema20: { 
          value: currentEMA20?.toFixed(2), 
          signal: currentPrice > currentEMA20 ? 'buy' : 'sell', 
          data: ema20, 
          label: 'EMA 20' 
        },
        price: currentPrice,
        change: candles.length > 1 ? ((currentPrice - candles[0].close) / candles[0].close * 100).toFixed(2) : 0
      }
    }
    
    // DAILY: Rules 3-9 - 7 indicators (removed BB)
    const rsiPeriod = 9
    const macdFast = 12
    const macdSlow = 26
    const macdSignalPeriod = 9
    const maCrossShort = 9
    const maCrossLong = 21
    
    // RSI (Rule 3)
    const rsi9 = calculateRSI(closes, rsiPeriod)
    
    // EMAs (Rules 4-7)
    const ema9 = calculateEMA(closes, 9)
    const ema20 = calculateEMA(closes, 20)
    const ema50 = calculateEMA(closes, 50)
    const ema200 = calculateEMA(closes, 200)
    
    // MACD (Rule 9)
    const macd = calculateMACD(closes, macdFast, macdSlow, macdSignalPeriod)
    
    // MA Cross (Rule 8)
    const maCross = calculateMACross(closes, maCrossShort, maCrossLong)

    // Current values (last candle)
    const currentPrice = closes[closes.length - 1]
    const currentRSI = rsi9[rsi9.length - 1]
    const currentEMA9 = ema9[ema9.length - 1]
    const currentEMA20 = ema20[ema20.length - 1]
    const currentEMA50 = ema50[ema50.length - 1]
    const currentEMA200 = ema200[ema200.length - 1]
    const currentMACD = macd.macd[macd.macd.length - 1]
    const currentSignal = macd.signal[macd.signal.length - 1]
    const currentHistogram = macd.histogram[macd.histogram.length - 1]

    // Generate signals
    const rsiSignal = currentRSI > 70 ? 'sell' : currentRSI < 30 ? 'buy' : 'neutral'
    const ema9Signal = currentPrice > currentEMA9 ? 'buy' : 'sell'
    const ema20Signal = currentPrice > currentEMA20 ? 'buy' : 'sell'
    const ema50Signal = currentPrice > currentEMA50 ? 'buy' : 'sell'
    const ema200Signal = currentPrice > currentEMA200 ? 'buy' : 'sell'
    const macdSignal = currentMACD > currentSignal ? 'buy' : 'sell'
    const maCrossSignal = maCross.signal

    return {
      rsi: { value: currentRSI?.toFixed(2), signal: rsiSignal, data: rsi9 },
      ema9: { value: currentEMA9?.toFixed(2), signal: ema9Signal, data: ema9, label: 'EMA 9' },
      ema20: { value: currentEMA20?.toFixed(2), signal: ema20Signal, data: ema20, label: 'EMA 20' },
      ema50: { value: currentEMA50?.toFixed(2), signal: ema50Signal, data: ema50, label: 'EMA 50' },
      ema200: { value: currentEMA200?.toFixed(2), signal: ema200Signal, data: ema200, label: 'EMA 200' },
      macd: {
        macd: currentMACD?.toFixed(4),
        signal: currentSignal?.toFixed(4),
        histogram: currentHistogram?.toFixed(4),
        signal: macdSignal,
        data: macd
      },
      maCross: { signal: maCrossSignal, data: maCross },
      price: currentPrice,
      change: candles.length > 1 ? ((currentPrice - candles[0].close) / candles[0].close * 100).toFixed(2) : 0
    }
  }

  const calculateRSI = (prices, period) => {
    const rsi = []
    let gains = 0
    let losses = 0

    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1]
      if (change > 0) gains += change
      else losses -= change
    }

    let avgGain = gains / period
    let avgLoss = losses / period
    rsi.push(100 - (100 / (1 + avgGain / avgLoss)))

    for (let i = period + 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1]
      const gain = change > 0 ? change : 0
      const loss = change < 0 ? -change : 0

      avgGain = (avgGain * (period - 1) + gain) / period
      avgLoss = (avgLoss * (period - 1) + loss) / period

      rsi.push(100 - (100 / (1 + avgGain / avgLoss)))
    }

    return rsi
  }

  const calculateSMA = (prices, period) => {
    const sma = []
    for (let i = period - 1; i < prices.length; i++) {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
      sma.push(sum / period)
    }
    return sma
  }

  const calculateEMA = (prices, period) => {
    const ema = []
    const multiplier = 2 / (period + 1)
    
    // Start with SMA
    let sum = 0
    for (let i = 0; i < period; i++) {
      sum += prices[i]
    }
    let currentEMA = sum / period
    ema.push(currentEMA)

    // Calculate EMA
    for (let i = period; i < prices.length; i++) {
      currentEMA = (prices[i] - currentEMA) * multiplier + currentEMA
      ema.push(currentEMA)
    }

    return ema
  }

  const calculateBollingerBands = (prices, period, stdDev) => {
    const upper = []
    const middle = []
    const lower = []

    for (let i = period - 1; i < prices.length; i++) {
      // Get the slice of prices for this period
      const slice = prices.slice(i - period + 1, i + 1)
      
      // Calculate mean (SMA)
      const mean = slice.reduce((sum, val) => sum + val, 0) / period
      
      // Calculate standard deviation
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period
      const std = Math.sqrt(variance)

      middle.push(mean)
      upper.push(mean + stdDev * std)
      lower.push(mean - stdDev * std)
    }

    return { upper, middle, lower }
  }

  const calculateMACD = (prices, fastPeriod, slowPeriod, signalPeriod) => {
    const fastEMA = calculateEMA(prices, fastPeriod)
    const slowEMA = calculateEMA(prices, slowPeriod)
    
    const macdLine = []
    const startIndex = slowPeriod - fastPeriod
    
    for (let i = 0; i < slowEMA.length; i++) {
      macdLine.push(fastEMA[i + startIndex] - slowEMA[i])
    }

    const signalLine = calculateEMA(macdLine, signalPeriod)
    const histogram = []
    
    const signalStartIndex = macdLine.length - signalLine.length
    for (let i = 0; i < signalLine.length; i++) {
      histogram.push(macdLine[i + signalStartIndex] - signalLine[i])
    }

    return { macd: macdLine, signal: signalLine, histogram }
  }

  const calculateMACross = (prices, shortPeriod, longPeriod) => {
    const shortMA = calculateSMA(prices, shortPeriod)
    const longMA = calculateSMA(prices, longPeriod)
    
    const offset = longPeriod - shortPeriod
    const currentShort = shortMA[shortMA.length - 1]
    const currentLong = longMA[longMA.length - 1]
    const prevShort = shortMA[shortMA.length - 2]
    const prevLong = longMA[longMA.length - 2]

    let signal = 'neutral'
    if (currentShort > currentLong && prevShort <= prevLong) signal = 'buy'
    else if (currentShort < currentLong && prevShort >= prevLong) signal = 'sell'
    else if (currentShort > currentLong) signal = 'buy'
    else signal = 'sell'

    return { shortMA, longMA, signal }
  }

  const renderChart = (candles, indicators) => {
    if (!chartContainerRef.current) return

    // Remove existing charts
    if (chartRef.current) {
      chartRef.current.remove()
    }
    if (rsiChartRef.current) {
      rsiChartRef.current.remove()
    }
    if (macdChartRef.current) {
      macdChartRef.current.remove()
    }

    // Create main price chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#1f2937' },
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
      height: 400,
    })

    chartRef.current = chart

    // Add candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: true,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    })
    candleSeries.setData(candles)

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
          color: '#8b5cf6',
          lineWidth: 2,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        })
        upperBandSeries.setData(bbData.upper.map((val, i) => ({
          time: candles[bbStartIndex + i].time,
          value: val
        })))

        const middleBandSeries = chart.addLineSeries({
          color: '#6366f1',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        })
        middleBandSeries.setData(bbData.middle.map((val, i) => ({
          time: candles[bbStartIndex + i].time,
          value: val
        })))

        const lowerBandSeries = chart.addLineSeries({
          color: '#8b5cf6',
          lineWidth: 2,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        })
        lowerBandSeries.setData(bbData.lower.map((val, i) => ({
          time: candles[bbStartIndex + i].time,
          value: val
        })))
      }
    }

    // Add EMA 9 (Daily)
    if (visibleIndicators.ema9 && indicators.ema9 && indicators.ema9.data) {
      const ema9StartIndex = candles.length - indicators.ema9.data.length
      const ema9Series = chart.addLineSeries({
        color: '#10b981',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      ema9Series.setData(indicators.ema9.data.map((val, i) => ({
        time: candles[ema9StartIndex + i].time,
        value: val
      })))
    }

    // Add EMA 20 (Daily or Weekly)
    if (visibleIndicators.ema20 && indicators.ema20 && indicators.ema20.data) {
      const ema20StartIndex = candles.length - indicators.ema20.data.length
      const ema20Series = chart.addLineSeries({
        color: '#3b82f6',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      ema20Series.setData(indicators.ema20.data.map((val, i) => ({
        time: candles[ema20StartIndex + i].time,
        value: val
      })))
    }

    // Add EMA 50 (Daily)
    if (visibleIndicators.ema50 && indicators.ema50 && indicators.ema50.data) {
      const ema50StartIndex = candles.length - indicators.ema50.data.length
      const ema50Series = chart.addLineSeries({
        color: '#f59e0b',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      ema50Series.setData(indicators.ema50.data.map((val, i) => ({
        time: candles[ema50StartIndex + i].time,
        value: val
      })))
    }

    // Add EMA 100 (Hourly)
    if (visibleIndicators.ema100 && indicators.ema100 && indicators.ema100.data) {
      const ema100StartIndex = candles.length - indicators.ema100.data.length
      const ema100Series = chart.addLineSeries({
        color: '#06b6d4',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      ema100Series.setData(indicators.ema100.data.map((val, i) => ({
        time: candles[ema100StartIndex + i].time,
        value: val
      })))
    }

    // Add EMA 200 (Daily)
    if (visibleIndicators.ema200 && indicators.ema200 && indicators.ema200.data) {
      const ema200StartIndex = candles.length - indicators.ema200.data.length
      const ema200Series = chart.addLineSeries({
        color: '#ef4444',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      ema200Series.setData(indicators.ema200.data.map((val, i) => ({
        time: candles[ema200StartIndex + i].time,
        value: val
      })))
    }

    // Fit content
    chart.timeScale().fitContent()

    // Create RSI chart if visible
    if (visibleIndicators.rsi && rsiChartContainerRef.current && indicators.rsi && indicators.rsi.data) {
      const rsiChart = createChart(rsiChartContainerRef.current, {
        layout: {
          background: { color: '#1f2937' },
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
          visible: false,
        },
        width: rsiChartContainerRef.current.clientWidth,
        height: 150,
      })

      rsiChartRef.current = rsiChart

      // Add RSI line
      const rsiSeries = rsiChart.addLineSeries({
        color: '#a855f7',
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true,
      })

      const rsiStartIndex = candles.length - indicators.rsi.data.length
      rsiSeries.setData(indicators.rsi.data.map((val, i) => ({
        time: candles[rsiStartIndex + i].time,
        value: val
      })))

      // Add horizontal lines at 30 and 70
      const oversoldLine = rsiChart.addLineSeries({
        color: '#10b981',
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      oversoldLine.setData(candles.map(c => ({ time: c.time, value: 30 })))

      const overboughtLine = rsiChart.addLineSeries({
        color: '#ef4444',
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      overboughtLine.setData(candles.map(c => ({ time: c.time, value: 70 })))

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
        layout: {
          background: { color: '#1f2937' },
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
          visible: false,
        },
        width: macdChartContainerRef.current.clientWidth,
        height: 150,
      })

      macdChartRef.current = macdChart

      const macdData = indicators.macd.data
      const macdStartIndex = candles.length - macdData.macd.length

      // Add MACD line
      const macdSeries = macdChart.addLineSeries({
        color: '#3b82f6',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      })
      macdSeries.setData(macdData.macd.map((val, i) => ({
        time: candles[macdStartIndex + i].time,
        value: val
      })))

      // Add Signal line
      const signalStartIndex = candles.length - macdData.signal.length
      const signalSeries = macdChart.addLineSeries({
        color: '#f59e0b',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      })
      signalSeries.setData(macdData.signal.map((val, i) => ({
        time: candles[signalStartIndex + i].time,
        value: val
      })))

      // Add Histogram
      const histogramStartIndex = candles.length - macdData.histogram.length
      const histogramSeries = macdChart.addHistogramSeries({
        color: '#10b981',
        priceLineVisible: false,
        lastValueVisible: false,
      })
      histogramSeries.setData(macdData.histogram.map((val, i) => ({
        time: candles[histogramStartIndex + i].time,
        value: val,
        color: val >= 0 ? '#10b981' : '#ef4444'
      })))

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
            <h2>📊 Technical Analysis</h2>
            <span className="chart-symbol-badge">{symbol}</span>
            <span className="chart-timeframe-badge">{getTimeframeLabel()}</span>
          </div>
          <button className="chart-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="chart-modal-body">
          {/* Timeframe Selector */}
          <div className="timeframe-selector">
            <div className="timeframe-label">📅 Timeframe</div>
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
              <div className="chart-error-icon">⚠️</div>
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

              {/* Indicator Toggle Checkboxes - Show only relevant indicators for timeframe */}
              <div className="indicator-toggles">
                <div className="toggle-header">
                  <span className="toggle-title">📊 {timeframe.charAt(0).toUpperCase() + timeframe.slice(1)} Indicators</span>
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
                        <span className="toggle-color" style={{ background: '#06b6d4' }}></span>
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
                          <span className="toggle-color" style={{ background: '#8b5cf6' }}></span>
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
                          <span className="toggle-color" style={{ background: '#3b82f6' }}></span>
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
                          <span className="toggle-color" style={{ background: '#a855f7' }}></span>
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
                          <span className="toggle-color" style={{ background: '#10b981' }}></span>
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
                          <span className="toggle-color" style={{ background: '#3b82f6' }}></span>
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
                          <span className="toggle-color" style={{ background: '#f59e0b' }}></span>
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
                          <span className="toggle-color" style={{ background: '#ef4444' }}></span>
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
                          <span className="toggle-color" style={{ background: '#14b8a6' }}></span>
                          MA Crossover
                        </span>
                      </label>

                      <label className="toggle-item">
                        <input
                          type="checkbox"
                          checked={visibleIndicators.macd}
                          onChange={() => toggleIndicator('macd')}
                        />
                        <span className="toggle-label">
                          <span className="toggle-color" style={{ background: '#3b82f6' }}></span>
                          MACD Panel
                        </span>
                      </label>
                    </>
                  )}
                </div>
              </div>

              {/* Chart */}
              <div className="chart-container-wrapper">
                <div className="chart-label">Price Chart</div>
                <div ref={chartContainerRef} className="chart-container" style={{ height: '400px' }} />
              </div>

              {/* RSI Chart */}
              {visibleIndicators.rsi && (
                <div className="chart-container-wrapper">
                  <div className="chart-label">RSI (9)</div>
                  <div ref={rsiChartContainerRef} className="chart-container" style={{ height: '150px' }} />
                </div>
              )}

              {/* MACD Chart */}
              {visibleIndicators.macd && (
                <div className="chart-container-wrapper">
                  <div className="chart-label">MACD (12, 26, 9)</div>
                  <div ref={macdChartContainerRef} className="chart-container" style={{ height: '150px' }} />
                </div>
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
