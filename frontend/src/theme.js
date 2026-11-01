import { useEffect, useState } from 'react'

// Theme preference: 'light' | 'dark' | 'system'. The resolved theme lives on <html data-theme>.
// index.html applies it before first paint; this module keeps it in sync afterwards.

const STORAGE_KEY = 'theme-preference'
const media = window.matchMedia('(prefers-color-scheme: dark)')

export function getPreference() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  } catch { /* storage unavailable */ }
  return 'system'
}

export function resolveTheme(pref = getPreference()) {
  if (pref === 'system') return media.matches ? 'dark' : 'light'
  return pref
}

function apply(pref) {
  const root = document.documentElement
  const theme = resolveTheme(pref)
  if (root.dataset.theme === theme) return
  root.classList.add('theme-transition')
  root.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0a110f' : '#1c2a26')
  window.setTimeout(() => root.classList.remove('theme-transition'), 250)
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme, preference: pref } }))
}

export function setPreference(pref) {
  try { localStorage.setItem(STORAGE_KEY, pref) } catch { /* storage unavailable */ }
  apply(pref)
  window.dispatchEvent(new CustomEvent('themepreference', { detail: pref }))
}

media.addEventListener('change', () => {
  if (getPreference() === 'system') apply('system')
})

// Resolved theme ('light' | 'dark'), re-rendering on change. Charts drawn on canvas read this.
export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || resolveTheme())
  useEffect(() => {
    const onChange = (e) => setTheme(e.detail.theme)
    window.addEventListener('themechange', onChange)
    return () => window.removeEventListener('themechange', onChange)
  }, [])
  return theme
}

export function usePreference() {
  const [pref, setPref] = useState(getPreference)
  useEffect(() => {
    const onChange = (e) => setPref(e.detail)
    window.addEventListener('themepreference', onChange)
    return () => window.removeEventListener('themepreference', onChange)
  }, [])
  return [pref, setPreference]
}

// Concrete colours for canvas charts (lightweight-charts cannot read CSS variables)
export const CHART_THEME = {
  light: { background: '#fbfcfa', text: '#43524c', grid: '#e6e9e3', border: '#d6dbd3' },
  dark: { background: '#161f1c', text: '#b3bfb9', grid: '#222f2a', border: '#2d3c36' },
}

export function chartThemeOptions(theme = document.documentElement.dataset.theme || resolveTheme()) {
  const c = CHART_THEME[theme] || CHART_THEME.light
  return {
    layout: { background: { type: 'solid', color: c.background }, textColor: c.text },
    grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
    rightPriceScale: { borderColor: c.border },
    timeScale: { borderColor: c.border },
  }
}

// Re-theme lightweight-charts instances (call after createChart and on theme change)
export function applyChartTheme(...charts) {
  const options = chartThemeOptions()
  charts.forEach((chart) => {
    try { chart?.applyOptions(options) } catch { /* chart already removed */ }
  })
}
