// Shared technical indicator calculations — same logic as ChartModal.jsx
// Used by CurrencyMatrix to compute "Δ vs 7 days ago" from raw OHLC price data.

export const calculateEMA = (prices, period) => {
  const ema = []
  const multiplier = 2 / (period + 1)
  let sum = 0
  for (let i = 0; i < period; i++) sum += prices[i]
  let current = sum / period
  ema.push(current)
  for (let i = period; i < prices.length; i++) {
    current = (prices[i] - current) * multiplier + current
    ema.push(current)
  }
  return ema
}

export const calculateRSI = (prices, period) => {
  const rsi = []
  let gains = 0, losses = 0
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1]
    if (change > 0) gains += change
    else losses -= change
  }
  let avgGain = gains / period
  let avgLoss = losses / period
  rsi.push(100 - (100 / (1 + avgGain / (avgLoss || 0.0001))))
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1]
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? -change : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    rsi.push(100 - (100 / (1 + avgGain / (avgLoss || 0.0001))))
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

export const calculateMACD = (prices, fastPeriod, slowPeriod, signalPeriod) => {
  const fastEMA = calculateEMA(prices, fastPeriod)
  const slowEMA = calculateEMA(prices, slowPeriod)
  const offset = slowPeriod - fastPeriod
  const macdLine = slowEMA.map((_, i) => fastEMA[i + offset] - slowEMA[i])
  const signalLine = calculateEMA(macdLine, signalPeriod)
  const sigOffset = macdLine.length - signalLine.length
  const histogram = signalLine.map((sig, i) => macdLine[i + sigOffset] - sig)
  return { macd: macdLine, signal: signalLine, histogram }
}

export const calculateMACross = (prices, shortPeriod, longPeriod) => {
  const shortMA = calculateSMA(prices, shortPeriod)
  const longMA = calculateSMA(prices, longPeriod)
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

/**
 * Given a sorted array of daily OHLC candles (already sliced up to the target date),
 * runs the same 7 daily indicators as ChartModal and returns { bullish, bearish } counts.
 * Mirrors the DAILY branch of computeVolumeFromChartData exactly.
 */
export const getSignalCountsFromCandles = (candles) => {
  if (!candles || candles.length < 25) return { bullish: 0, bearish: 0 }

  const closes = candles.map(c => c.close)
  const n = closes.length
  const price = closes[n - 1]  // last candle = target date

  const rsi9     = calculateRSI(closes, 9)
  const ema9     = calculateEMA(closes, 9)
  const ema20    = calculateEMA(closes, 20)
  const ema50    = calculateEMA(closes, 50)
  const ema200   = calculateEMA(closes, 200)
  const macd     = calculateMACD(closes, 12, 26, 9)
  const maCross  = calculateMACross(closes, 9, 21)

  let buy = 0, sell = 0

  // RSI9 — offset: candle i+9
  const ci = n - 1
  if (ci >= 9) {
    const rsi = rsi9[ci - 9]
    if (Number.isFinite(rsi)) {
      if (rsi < 30) buy++
      else if (rsi > 70) sell++
    }
  }
  // EMA9 — offset: candle i+8
  if (ci >= 8) {
    const ema = ema9[ci - 8]
    if (Number.isFinite(ema)) { price > ema ? buy++ : sell++ }
  }
  // EMA20 — offset: candle i+19
  if (ci >= 19) {
    const ema = ema20[ci - 19]
    if (Number.isFinite(ema)) { price > ema ? buy++ : sell++ }
  }
  // EMA50 — offset: candle i+49
  if (ci >= 49) {
    const ema = ema50[ci - 49]
    if (Number.isFinite(ema)) { price > ema ? buy++ : sell++ }
  }
  // EMA200 — offset: candle i+199
  if (ci >= 199) {
    const ema = ema200[ci - 199]
    if (Number.isFinite(ema)) { price > ema ? buy++ : sell++ }
  }
  // MACD histogram — offset: candle i+33
  if (ci >= 33) {
    const hist = macd.histogram[ci - 33]
    if (Number.isFinite(hist)) { hist > 0 ? buy++ : sell++ }
  }
  // MA Cross SMA9 vs SMA21
  if (ci >= 20) {
    const short = maCross.shortMA[ci - 8]
    const long  = maCross.longMA[ci - 20]
    if (Number.isFinite(short) && Number.isFinite(long)) {
      short > long ? buy++ : sell++
    }
  }

  return { bullish: buy, bearish: sell }
}

/**
 * Same computation as getSignalCountsFromCandles, but returns which named
 * indicators fired on each side instead of just the counts — used where the
 * caller needs to show the individual signals (e.g. a hover tooltip), not
 * just a number. Keep this in sync with getSignalCountsFromCandles above.
 */
export const getSignalNamesFromCandles = (candles) => {
  if (!candles || candles.length < 25) return { buy: [], sell: [] }

  const closes = candles.map(c => c.close)
  const n = closes.length
  const price = closes[n - 1]  // last candle = target date

  const rsi9     = calculateRSI(closes, 9)
  const ema9     = calculateEMA(closes, 9)
  const ema20    = calculateEMA(closes, 20)
  const ema50    = calculateEMA(closes, 50)
  const ema200   = calculateEMA(closes, 200)
  const macd     = calculateMACD(closes, 12, 26, 9)
  const maCross  = calculateMACross(closes, 9, 21)

  const buy = [], sell = []
  const vote = (name, isBuy) => (isBuy ? buy : sell).push(name)

  const ci = n - 1
  if (ci >= 9) {
    const rsi = rsi9[ci - 9]
    if (Number.isFinite(rsi)) {
      if (rsi < 30) vote('RSI_9', true)
      else if (rsi > 70) vote('RSI_9', false)
    }
  }
  if (ci >= 8) {
    const ema = ema9[ci - 8]
    if (Number.isFinite(ema)) vote('EMA_9', price > ema)
  }
  if (ci >= 19) {
    const ema = ema20[ci - 19]
    if (Number.isFinite(ema)) vote('EMA_20', price > ema)
  }
  if (ci >= 49) {
    const ema = ema50[ci - 49]
    if (Number.isFinite(ema)) vote('EMA_50', price > ema)
  }
  if (ci >= 199) {
    const ema = ema200[ci - 199]
    if (Number.isFinite(ema)) vote('EMA_200', price > ema)
  }
  if (ci >= 33) {
    const hist = macd.histogram[ci - 33]
    if (Number.isFinite(hist)) vote('MACD', hist > 0)
  }
  if (ci >= 20) {
    const short = maCross.shortMA[ci - 8]
    const long  = maCross.longMA[ci - 20]
    if (Number.isFinite(short) && Number.isFinite(long)) vote('MA_Crossover', short > long)
  }

  return { buy, sell }
}
