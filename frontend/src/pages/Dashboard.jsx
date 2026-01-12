import React, { useState, useEffect, useRef } from 'react'
import { tradingAPI, dataAPI, historyAPI } from '../api/api'
import TradingViewChart from '../components/TradingViewChart'
import ChartModal from '../components/ChartModal'
import './Dashboard.css'

const Dashboard = () => {
  const [status, setStatus] = useState({})
  const [watchlist, setWatchlist] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedSymbol, setSelectedSymbol] = useState(null)
  const [signalHistory, setSignalHistory] = useState([])
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [showChartModal, setShowChartModal] = useState(false)
  const [chartSymbol, setChartSymbol] = useState(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const wsRef = useRef(null)

  useEffect(() => {
    loadStatus()
    loadWatchlist()
    connectWebSocket()

    const statusInterval = setInterval(loadStatus, 10000)

    return () => {
      clearInterval(statusInterval)
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
    try {
      const response = await dataAPI.getWatchlist()
      setWatchlist(response.data || [])
    } catch (error) {
      console.error('Failed to load watchlist:', error)
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
    if (!window.confirm(`Remove ${symbol} from watchlist?`)) return

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

  const viewSignalHistory = async (symbol) => {
    setSelectedSymbol(symbol)
    setShowHistoryModal(true)
    setLoadingHistory(true)

    try {
      const response = await historyAPI.getSignalHistory(symbol)
      setSignalHistory(response.data.signals || [])
    } catch (error) {
      console.error('Failed to load signal history:', error)
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
    setShowChartModal(true)
  }

  const closeChartModal = () => {
    setShowChartModal(false)
    setChartSymbol(null)
  }

  const formatDateTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  const countNeutralSignals = (item) => {
    // Total indicators we're tracking
    const totalIndicators = 10 // EMA 100 (Hourly), Bollinger, RSI, EMA 9, EMA 20, EMA 50, EMA 200, MA Cross, MACD (Daily), EMA 20 (Weekly)
    const buyCount = item.buy_signals?.length || 0
    const sellCount = item.sell_signals?.length || 0
    return totalIndicators - buyCount - sellCount
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h1>📊 Trading Signal Monitor</h1>
          <p className="welcome-text">Real-time Forex Trading Signals</p>
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
          <span>Watchlist: {status.watchlist_count || 0} symbols</span>
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
          <h2>📈 Watchlist ({watchlist.length})</h2>
          {watchlist.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <p>No symbols in watchlist</p>
              <p className="empty-subtitle">Search and add symbols to start monitoring</p>
            </div>
          ) : (
            <div className="watchlist-table-container">
              <table className="watchlist-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Price</th>
                    <th>Signals</th>
                    <th>EMA 100<br/><span style={{fontSize: '10px', fontWeight: 'normal'}}>⏰ Hourly</span></th>
                    <th>Bollinger<br/><span style={{fontSize: '10px', fontWeight: 'normal'}}>📅 Daily</span></th>
                    <th>RSI (9)<br/><span style={{fontSize: '10px', fontWeight: 'normal'}}>📅 Daily</span></th>
                    <th>EMA 9<br/><span style={{fontSize: '10px', fontWeight: 'normal'}}>📅 Daily</span></th>
                    <th>EMA 20<br/><span style={{fontSize: '10px', fontWeight: 'normal'}}>📅 Daily</span></th>
                    <th>EMA 50<br/><span style={{fontSize: '10px', fontWeight: 'normal'}}>📅 Daily</span></th>
                    <th>EMA 200<br/><span style={{fontSize: '10px', fontWeight: 'normal'}}>📅 Daily</span></th>
                    <th>MA Cross<br/><span style={{fontSize: '10px', fontWeight: 'normal'}}>📅 Daily</span></th>
                    <th>MACD<br/><span style={{fontSize: '10px', fontWeight: 'normal'}}>📅 Daily</span></th>
                    <th>EMA 20<br/><span style={{fontSize: '10px', fontWeight: 'normal'}}>📆 Weekly</span></th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {watchlist.map((item, index) => (
                    <tr key={index} className="symbol-row">
                      {/* Symbol - Make it clickable */}
                      <td className="symbol-cell">
                        <div 
                          className="symbol-name clickable-symbol" 
                          onClick={() => openChartModal(item.symbol)}
                          title="Click to view detailed chart"
                        >
                          {item.symbol} 📊
                        </div>
                      </td>

                      {/* Price */}
                      <td className="price-cell">
                        ${(item.last_price || item.price || 0).toFixed(5)}
                      </td>

                      {/* Signals Summary */}
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

                      {/* 1. EMA 100 Hourly */}
                      <td className="indicator-cell">
                        {item.hourly_indicators?.ema_100 ? (
                          <>
                            <div className="indicator-value">
                              {item.hourly_indicators.ema_100.ema_value?.toFixed(5)}
                            </div>
                            {item.hourly_indicators.ema_100.signal ? (
                              <span className={`signal-badge-mini ${item.hourly_indicators.ema_100.signal === 'BUY' ? 'buy' : 'sell'}`}>
                                {item.hourly_indicators.ema_100.signal}
                              </span>
                            ) : (
                              <span className="signal-badge-mini neutral">Neutral</span>
                            )}
                          </>
                        ) : (
                          <span className="signal-badge-mini neutral">N/A</span>
                        )}
                      </td>

                      {/* 2. Bollinger Bands Daily */}
                      <td className="indicator-cell">
                        {item.daily_indicators?.bollinger_band ? (
                          <>
                            <div className="indicator-value" style={{fontSize: '10px', marginBottom: '2px'}}>
                              U: {item.daily_indicators.bollinger_band.upper_band?.toFixed(5)}<br/>
                              M: {item.daily_indicators.bollinger_band.middle_band?.toFixed(5)}<br/>
                              L: {item.daily_indicators.bollinger_band.lower_band?.toFixed(5)}
                            </div>
                            {item.daily_indicators.bollinger_band.signal ? (
                              <span className={`signal-badge-mini ${item.daily_indicators.bollinger_band.signal === 'BUY' ? 'buy' : 'sell'}`}>
                                {item.daily_indicators.bollinger_band.signal}
                              </span>
                            ) : (
                              <span className="signal-badge-mini neutral">Neutral</span>
                            )}
                          </>
                        ) : (
                          <span className="signal-badge-mini neutral">N/A</span>
                        )}
                      </td>

                      {/* 3. RSI Daily */}
                      <td className="indicator-cell">
                        <div className="indicator-value">
                          {item.daily_indicators?.rsi_9?.rsi_value?.toFixed(0)}
                        </div>
                        {item.daily_indicators?.rsi_9?.signal ? (
                          <span className={`signal-badge-mini ${item.daily_indicators.rsi_9.signal === 'BUY' ? 'buy' : 'sell'}`}>
                            {item.daily_indicators.rsi_9.signal}
                          </span>
                        ) : (
                          <span className="signal-badge-mini neutral">Neutral</span>
                        )}
                      </td>

                      {/* 4. EMA 9 Daily */}
                      <td className="indicator-cell">
                        {item.daily_indicators?.ema_9 ? (
                          <>
                            <div className="indicator-value">
                              {item.daily_indicators.ema_9.ema_value?.toFixed(5)}
                            </div>
                            {item.daily_indicators.ema_9.signal ? (
                              <span className={`signal-badge-mini ${item.daily_indicators.ema_9.signal === 'BUY' ? 'buy' : 'sell'}`}>
                                {item.daily_indicators.ema_9.signal}
                              </span>
                            ) : (
                              <span className="signal-badge-mini neutral">Neutral</span>
                            )}
                          </>
                        ) : (
                          <span className="signal-badge-mini neutral">N/A</span>
                        )}
                      </td>

                      {/* 5. EMA 20 Daily */}
                      <td className="indicator-cell">
                        {item.daily_indicators?.ema_20 ? (
                          <>
                            <div className="indicator-value">
                              {item.daily_indicators.ema_20.ema_value?.toFixed(5)}
                            </div>
                            {item.daily_indicators.ema_20.signal ? (
                              <span className={`signal-badge-mini ${item.daily_indicators.ema_20.signal === 'BUY' ? 'buy' : 'sell'}`}>
                                {item.daily_indicators.ema_20.signal}
                              </span>
                            ) : (
                              <span className="signal-badge-mini neutral">Neutral</span>
                            )}
                          </>
                        ) : (
                          <span className="signal-badge-mini neutral">N/A</span>
                        )}
                      </td>

                      {/* 6. EMA 50 Daily */}
                      <td className="indicator-cell">
                        {item.daily_indicators?.ema_50 ? (
                          <>
                            <div className="indicator-value">
                              {item.daily_indicators.ema_50.ema_value?.toFixed(5)}
                            </div>
                            {item.daily_indicators.ema_50.signal ? (
                              <span className={`signal-badge-mini ${item.daily_indicators.ema_50.signal === 'BUY' ? 'buy' : 'sell'}`}>
                                {item.daily_indicators.ema_50.signal}
                              </span>
                            ) : (
                              <span className="signal-badge-mini neutral">Neutral</span>
                            )}
                          </>
                        ) : (
                          <span className="signal-badge-mini neutral">N/A</span>
                        )}
                      </td>

                      {/* 7. EMA 200 Daily */}
                      <td className="indicator-cell">
                        {item.daily_indicators?.ema_200 ? (
                          <>
                            <div className="indicator-value">
                              {item.daily_indicators.ema_200.ema_value?.toFixed(5)}
                            </div>
                            {item.daily_indicators.ema_200.signal ? (
                              <span className={`signal-badge-mini ${item.daily_indicators.ema_200.signal === 'BUY' ? 'buy' : 'sell'}`}>
                                {item.daily_indicators.ema_200.signal}
                              </span>
                            ) : (
                              <span className="signal-badge-mini neutral">Neutral</span>
                            )}
                          </>
                        ) : (
                          <span className="signal-badge-mini neutral">N/A</span>
                        )}
                      </td>

                      {/* 8. MA Crossover Daily */}
                      <td className="indicator-cell">
                        {item.daily_indicators?.ma_crossover ? (
                          <>
                            <div className="indicator-value" style={{fontSize: '10px', marginBottom: '2px'}}>
                              Fast: {item.daily_indicators.ma_crossover.fast_ema?.toFixed(5)}<br/>
                              Slow: {item.daily_indicators.ma_crossover.slow_ema?.toFixed(5)}
                            </div>
                            {item.daily_indicators.ma_crossover.signal ? (
                              <span className={`signal-badge-mini ${item.daily_indicators.ma_crossover.signal === 'BUY' ? 'buy' : 'sell'}`}>
                                {item.daily_indicators.ma_crossover.signal}
                              </span>
                            ) : (
                              <span className="signal-badge-mini neutral">Neutral</span>
                            )}
                          </>
                        ) : (
                          <span className="signal-badge-mini neutral">N/A</span>
                        )}
                      </td>

                      {/* 9. MACD Daily */}
                      <td className="indicator-cell">
                        {item.daily_indicators?.macd ? (
                          <>
                            <div className="indicator-value" style={{fontSize: '10px', marginBottom: '2px'}}>
                              Line: {item.daily_indicators.macd.macd_line?.toFixed(6)}<br/>
                              Sig: {item.daily_indicators.macd.signal_line?.toFixed(6)}<br/>
                              Hist: {item.daily_indicators.macd.histogram?.toFixed(6)}
                            </div>
                            {item.daily_indicators.macd.signal ? (
                              <span className={`signal-badge-mini ${item.daily_indicators.macd.signal === 'BUY' ? 'buy' : 'sell'}`}>
                                {item.daily_indicators.macd.signal}
                              </span>
                            ) : (
                              <span className="signal-badge-mini neutral">Neutral</span>
                            )}
                          </>
                        ) : (
                          <span className="signal-badge-mini neutral">N/A</span>
                        )}
                      </td>

                      {/* 10. EMA 20 Weekly */}
                      <td className="indicator-cell">
                        {item.weekly_indicators?.ema_20 ? (
                          <>
                            <div className="indicator-value">
                              {item.weekly_indicators.ema_20.ema_value?.toFixed(5)}
                            </div>
                            {item.weekly_indicators.ema_20.signal ? (
                              <span className={`signal-badge-mini ${item.weekly_indicators.ema_20.signal === 'BUY' ? 'buy' : 'sell'}`}>
                                {item.weekly_indicators.ema_20.signal}
                              </span>
                            ) : (
                              <span className="signal-badge-mini neutral">Neutral</span>
                            )}
                          </>
                        ) : (
                          <span className="signal-badge-mini neutral">N/A</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="action-cell">
                        <button
                          onClick={() => removeSymbol(item.symbol)}
                          className="remove-button"
                          title="Remove"
                        >
                          🗑️
                        </button>
                      </td>
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
              <h2>📊 {selectedSymbol} - Signal History</h2>
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
                  {/* TradingView-style Price Chart with Signal Markers */}
                  <TradingViewChart symbol={selectedSymbol} signalHistory={signalHistory} />
                  
                  {/* Signal History List */}
                  <h3 style={{ marginTop: '30px', marginBottom: '15px', color: '#111827' }}>
                    📋 Signal Details
                  </h3>
                  <div className="history-list">
                  {signalHistory.map((signal, index) => (
                    <div key={index} className={`history-item signal-${getSignalClass(signal.signal_type)}`}>
                      <div className="history-header">
                        <span className={`signal-badge signal-${getSignalClass(signal.signal_type)}`}>
                          {signal.signal_type}
                        </span>
                        <span className="history-time">{formatDateTime(signal.timestamp)}</span>
                      </div>
                      <div className="history-details">
                        <div className="detail-row">
                          <span className="detail-label">Price:</span>
                          <span className="detail-value">${signal.price?.toFixed(4) || 'N/A'}</span>
                        </div>
                        {signal.ema_200 && (
                          <div className="detail-row">
                            <span className="detail-label">EMA 200:</span>
                            <span className="detail-value">{signal.ema_200.toFixed(4)}</span>
                          </div>
                        )}
                        {signal.rsi && (
                          <div className="detail-row">
                            <span className="detail-label">RSI:</span>
                            <span className="detail-value">{signal.rsi.toFixed(2)}</span>
                          </div>
                        )}
                        {signal.details && (
                          <div className="detail-row">
                            <span className="detail-label">Difference:</span>
                            <span className="detail-value">
                              {signal.details.diff ? signal.details.diff.toFixed(4) : 'N/A'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
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
          onClose={closeChartModal}
        />
      )}
    </div>
  )
}

export default Dashboard
