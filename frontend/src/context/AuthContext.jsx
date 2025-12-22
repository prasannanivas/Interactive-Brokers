import React, { createContext, useState, useContext, useEffect } from 'react'
import { authAPI } from '../api/api'

const AuthContext = createContext()

// Disable HMR for this module to prevent auth state loss
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    console.log('HMR: AuthContext updated')
  })
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const token = localStorage.getItem('token')
    if (token) {
      try {
        const response = await authAPI.getMe()
        setUser(response.data)
      } catch (error) {
        console.error('Auth check failed:', error)
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      }
    }
    setLoading(false)
  }

  const login = async (email, password) => {
    try {
      const response = await authAPI.login({ email, password })
      const { access_token, user: userData } = response.data
      
      // Store token and user
      localStorage.setItem('token', access_token)
      localStorage.setItem('user', JSON.stringify(userData))
      
      // Update state - this should NOT trigger HMR
      setUser(userData)
      
      return { success: true }
    } catch (error) {
      console.error('Login error:', error)
      return {
        success: false,
        error: error.response?.data?.detail || error.message || 'Login failed'
      }
    }
  }

  const register = async (username, email, password, fullName) => {
    try {
      const response = await authAPI.register({
        username,
        email,
        password,
        full_name: fullName
      })
      
      // Auto login after registration
      return await login(email, password)
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || 'Registration failed'
      }
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }

  const value = {
    user,
    loading,
    login,
    register,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
