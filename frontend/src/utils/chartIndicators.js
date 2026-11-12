// Indicator formulas the dashboard chart (ChartModal) draws - Trading Rules.xlsx,
// same definitions as backend/indicator_calculator.py and utils/signalEngine.js.
// The /test audit page runs this exact code and compares it with the table.

export const computeChartIndicators = (candles, timeframe) => {
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
      change: candles.length > 1 ? ((currentPrice - candles[candles.length - 2].close) / candles[candles.length - 2].close * 100).toFixed(2) : 0
    }
  } else if (timeframe === 'weekly') {
    // WEEKLY: Visual — Bollinger Bands + EMA 20
    //         Signal counting — same 7 indicators as daily (computed on weekly closes)
    const bbPeriod = 20
    const bb = calculateBollingerBands(closes, bbPeriod, 2)
    const ema20 = calculateEMA(closes, 20)
    const currentPrice = closes[closes.length - 1]
    const currentEMA20 = ema20[ema20.length - 1]
    const currentBBUpper = bb.upper[bb.upper.length - 1]
    const currentBBMiddle = bb.middle[bb.middle.length - 1]
    const currentBBLower = bb.lower[bb.lower.length - 1]
    const bbSignal = currentPrice > currentBBUpper ? 'sell' : currentPrice < currentBBLower ? 'buy' : 'neutral'

    // Compute all 7 signal-counting indicators on weekly closes
    const wRsi9      = calculateRSI(closes, 9)
    const wEma9      = calculateEMA(closes, 9)
    const wEma50     = calculateEMA(closes, 50)
    const wEma200    = calculateEMA(closes, 200)
    const wMacd      = calculateMACD(closes, 12, 26, 9)
    const wMaCross   = calculateMACross(closes, 9, 21)

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
      ema20: { value: currentEMA20?.toFixed(2), signal: currentPrice > currentEMA20 ? 'buy' : 'sell', data: ema20, label: 'EMA 20' },
      // Signal-counting arrays (not rendered as chart lines)
      rsi:     { data: wRsi9 },
      ema9:    { data: wEma9 },
      ema50:   { data: wEma50 },
      ema200:  { data: wEma200 },
      macd:    { data: wMacd },
      maCross: { data: wMaCross },
      price: currentPrice,
      change: candles.length > 1 ? ((currentPrice - candles[candles.length - 2].close) / candles[candles.length - 2].close * 100).toFixed(2) : 0
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
  const rsiSignal = currentRSI > 80 ? 'sell' : currentRSI < 40 ? 'buy' : 'neutral'
  const ema9Signal = currentPrice > currentEMA9 ? 'buy' : 'sell'
  const ema20Signal = currentPrice > currentEMA20 ? 'buy' : 'sell'
  const ema50Signal = currentPrice > currentEMA50 ? 'buy' : 'sell'
  const ema200Signal = currentPrice > currentEMA200 ? 'buy' : 'sell'
  const macdSignal = currentMACD > 0 ? 'buy' : 'sell'  // 12 EMA > 26 EMA
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
    change: candles.length > 1 ? ((currentPrice - candles[candles.length - 2].close) / candles[candles.length - 2].close * 100).toFixed(2) : 0
  }
}

export const calculateRSI = (prices, period) => {
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

export const calculateSMA = (prices, period) => {
  const sma = []
  for (let i = period - 1; i < prices.length; i++) {
    const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
    sma.push(sum / period)
  }
  return sma
}

export const calculateEMA = (prices, period) => {
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

// Trading Rules.xlsx: Bollinger (20, 2, 0) - EMA. Middle = EMA(period),
// bands = middle +/- stdDev * population std dev of the last `period` closes.
// Arrays start at candle period-1 (same alignment as calculateEMA).
export const calculateBollingerBands = (prices, period, stdDev) => {
  const upper = []
  const middle = calculateEMA(prices, period)
  const lower = []

  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1)
    const mean = slice.reduce((sum, val) => sum + val, 0) / period
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period
    const std = Math.sqrt(variance)
    const mid = middle[i - period + 1]
    upper.push(mid + stdDev * std)
    lower.push(mid - stdDev * std)
  }

  return { upper, middle, lower }
}

export const calculateMACD = (prices, fastPeriod, slowPeriod, signalPeriod) => {
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

// MA Cross (EMA 9, EMA 21): EMA9 > EMA21 = buy, EMA9 < EMA21 = sell
export const calculateMACross = (prices, shortPeriod, longPeriod) => {
  const shortMA = calculateEMA(prices, shortPeriod)
  const longMA = calculateEMA(prices, longPeriod)
  
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
