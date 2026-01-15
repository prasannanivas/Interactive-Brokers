import axios from 'axios'

// Separate services for auth and trading
const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL || 'http://localhost:8001'
const TRADING_API_URL = import.meta.env.VITE_TRADING_API_URL || 'http://localhost:8000'

// Auth service API client
const authApi = axios.create({
  baseURL: AUTH_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Trading service API client
const tradingApi = axios.create({
  baseURL: TRADING_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add token to auth API requests (disabled for now)
// authApi.interceptors.request.use(
//   (config) => {
//     const token = localStorage.getItem('token')
//     if (token) {
//       config.headers.Authorization = `Bearer ${token}`
//     }
//     return config
//   },
//   (error) => {
//     return Promise.reject(error)
//   }
// )

// Add token to trading API requests (disabled for now)
// tradingApi.interceptors.request.use(
//   (config) => {
//     const token = localStorage.getItem('token')
//     if (token) {
//       config.headers.Authorization = `Bearer ${token}`
//     }
//     return config
//   },
//   (error) => {
//     return Promise.reject(error)
//   }
// )

// Handle 401 errors for auth API (disabled for now)
// authApi.interceptors.response.use(
//   (response) => response,
//   (error) => {
//     if (error.response?.status === 401) {
//       localStorage.removeItem('token')
//       localStorage.removeItem('user')
//       window.location.href = '/login'
//     }
//     return Promise.reject(error)
//   }
// )

// Handle 401 errors for trading API (disabled for now)
// tradingApi.interceptors.response.use(
//   (response) => response,
//   (error) => {
//     if (error.response?.status === 401) {
//       localStorage.removeItem('token')
//       localStorage.removeItem('user')
//       window.location.href = '/login'
//     }
//     return Promise.reject(error)
//   }
// )

// Auth API - uses auth service (port 8001)
export const authAPI = {
  register: (data) => authApi.post('/auth/register', data),
  login: (data) => authApi.post('/auth/login', data),
  getMe: () => authApi.get('/auth/me'),
  getLoginHistory: (limit = 50) => authApi.get(`/auth/login-history?limit=${limit}`),
  getUserStats: () => authApi.get('/users/me/stats'),
}

// Trading API - uses trading service (port 8000) - only monitoring operations
export const tradingAPI = {
  getStatus: () => tradingApi.get('/'),
  getAlgorithmConfig: () => tradingApi.get('/api/algorithm/config'),
  configureAlgorithm: (data) => tradingApi.post('/api/algorithm/configure', data),
  getTelegramStatus: () => tradingApi.get('/api/telegram/status'),
  configureTelegram: (data) => tradingApi.post('/api/telegram/configure', data),
}

// Data API - uses data service (port 8001) - watchlist and search operations
export const dataAPI = {
  searchSymbols: (query) => authApi.get(`/api/symbols/search?query=${query}`),
  addToWatchlist: (data) => authApi.post('/api/watchlist/add', data),
  removeFromWatchlist: (symbol) => authApi.delete(`/api/watchlist/remove/${symbol}`),
  getWatchlist: () => authApi.get('/api/watchlist'),
}

// History API - uses data service (port 8001)
export const historyAPI = {
  getSignalHistory: (symbol, limit = 100) => authApi.get(`/api/history/signals/${symbol}?limit=${limit}`),
  getRecentSignals: (limit = 50) => authApi.get(`/api/history/signals/recent?limit=${limit}`),
  getWatchlistChanges: (limit = 100) => authApi.get(`/api/history/watchlist-changes?limit=${limit}`),
  getPriceHistory: (symbol, days = 30, timespan = 'hour') => authApi.get(`/api/history/price-data/${symbol}?days=${days}&timespan=${timespan}`),
}

// Backtesting API - uses data service (port 8001)
export const backtestingAPI = {
  getSignalBatches: (limit = 100, skip = 0) => authApi.get(`/api/backtesting/signal-batches?limit=${limit}&skip=${skip}`),
  getSignalBatchDetails: (batchId) => authApi.get(`/api/backtesting/signal-batches/${batchId}`),
  getStatistics: (days = 30) => authApi.get(`/api/backtesting/statistics?days=${days}`),
}

export default authApi
