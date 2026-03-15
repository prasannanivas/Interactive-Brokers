import React, { useState, useEffect } from 'react'
import { authAPI } from '../api/api'
import './LoginHistory.css'

const LoginHistory = ({ onClose }) => {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortBy, setSortBy] = useState('time') // 'time', 'success', 'ip'
  const [sortOrder, setSortOrder] = useState('desc') // 'asc', 'desc'
  const [groupBy, setGroupBy] = useState('user') // 'none', 'user', 'date', 'success', 'ip'
  const [limit, setLimit] = useState(50)

  useEffect(() => {
    loadHistory()
  }, [limit])

  const loadHistory = async () => {
    try {
      setLoading(true)
      const response = await authAPI.getLoginHistory(limit)
      setHistory(response.data.history || [])
      setError('')
    } catch (err) {
      console.error('Failed to load login history:', err)
      setError('Failed to load login history')
    } finally {
      setLoading(false)
    }
  }

  const getRecordTime = (record) => {
    return record.timestamp || record.login_time
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const getDateKey = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const sortHistory = (data) => {
    const sorted = [...data]
    
    sorted.sort((a, b) => {
      let compareA, compareB
      
      switch (sortBy) {
        case 'time':
          compareA = new Date(getRecordTime(a))
          compareB = new Date(getRecordTime(b))
          break
        case 'success':
          compareA = a.success ? 1 : 0
          compareB = b.success ? 1 : 0
          break
        case 'ip':
          compareA = a.ip_address || ''
          compareB = b.ip_address || ''
          break
        default:
          return 0
      }
      
      if (sortOrder === 'asc') {
        return compareA > compareB ? 1 : -1
      } else {
        return compareA < compareB ? 1 : -1
      }
    })
    
    return sorted
  }

  const groupHistory = (data) => {
    if (groupBy === 'none') {
      return { 'All Records': data }
    }
    
    const grouped = {}
    
    data.forEach(record => {
      let key
      
      switch (groupBy) {
        case 'date':
          key = getDateKey(getRecordTime(record))
          break
        case 'success':
          key = record.success ? '✅ Successful' : '❌ Failed'
          break
        case 'ip':
          key = record.ip_address || 'Unknown IP'
          break
        default:
          key = 'All Records'
      }
      
      if (!grouped[key]) {
        grouped[key] = []
      }
      grouped[key].push(record)
    })
    
    return grouped
  }

  const processedHistory = groupHistory(sortHistory(history))

  const stats = {
    total: history.length,
    successful: history.filter(r => r.success).length,
    failed: history.filter(r => !r.success).length,
    uniqueIPs: [...new Set(history.map(r => r.ip_address).filter(Boolean))].length
  }

  return (
    <div className="login-history-overlay">
      <div className="login-history-modal">
        <div className="login-history-header">
          <div>
            <h2>🔐 Login History - All Users</h2>
            <p>Track all account activity across the system</p>
          </div>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        {/* Stats Summary */}
        <div className="login-stats">
          <div className="stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Total Logins</div>
          </div>
          <div className="stat-card success">
            <div className="stat-value">{stats.successful}</div>
            <div className="stat-label">Successful</div>
          </div>
          <div className="stat-card failed">
            <div className="stat-value">{stats.failed}</div>
            <div className="stat-label">Failed</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.uniqueIPs}</div>
            <div className="stat-label">Unique IPs</div>
          </div>
        </div>

        {/* Controls */}
        <div className="history-controls">
          <div className="control-group">
            <label>Sort By:</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="time">Time</option>
              <option value="success">Status</option>
              <option value="ip">IP Address</option>
            </select>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>

          <div className="control-group">
            <label>Group By:</label>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              <option value="none">None</option>
              <option value="user">User</option>
              <option value="date">Date</option>
              <option value="success">Status</option>
              <option value="ip">IP Address</option>
            </select>
          </div>

          <div className="control-group">
            <label>Limit:</label>
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </select>
          </div>

          <button className="refresh-button" onClick={loadHistory}>
            🔄 Refresh
          </button>
        </div>

        {/* History List */}
        <div className="login-history-content">
          {loading ? (
            <div className="loading-state">Loading...</div>
          ) : error ? (
            <div className="error-state">{error}</div>
          ) : history.length === 0 ? (
            <div className="empty-state">No login history found</div>
          ) : (
            Object.keys(processedHistory).map(groupKey => (
              <div key={groupKey} className="history-group">
                {groupBy !== 'none' && (
                  <div className="group-header">
                    <h3>{groupKey}</h3>
                    <span className="group-count">({processedHistory[groupKey].length})</span>
                  </div>
                )}
                
                <div className="history-list">
                  {processedHistory[groupKey].map((record, index) => (
                    <div 
                      key={record._id || index} 
                      className={`history-item ${record.success ? 'success' : 'failed'}`}
                    >
                      <div className="history-icon">
                        {record.event_type === 'logout' ? '🚪' : (record.success ? '✅' : '❌')}
                      </div>
                      <div className="history-details">
                        <div className="history-time">
                          {formatDate(getRecordTime(record))}{record.event_type === 'logout' && ' 🔴'}
                        </div>
                        <div className="history-info">
                          <span className="history-email">👤 {record.email}</span>
                          {record.ip_address && (
                            <span className="history-ip">📍 {record.ip_address}</span>
                          )}
                        </div>
                        {record.user_agent && (
                          <div className="history-agent">{record.user_agent}</div>
                        )}
                      </div>
                      <div className="history-status">
                        {record.success ? (
                          <span className="status-badge success-badge">Success</span>
                        ) : (
                          <span className="status-badge failed-badge">Failed</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default LoginHistory
