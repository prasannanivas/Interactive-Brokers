import React from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { usePreference } from '../theme'
import './ThemeToggle.css'

const OPTIONS = [
  { value: 'light', label: 'Light theme', Icon: Sun },
  { value: 'dark', label: 'Dark theme', Icon: Moon },
  { value: 'system', label: 'Match system theme', Icon: Monitor },
]

export default function ThemeToggle({ className = '' }) {
  const [pref, setPref] = usePreference()

  return (
    <div className={`theme-toggle ${className}`} role="radiogroup" aria-label="Colour theme">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          aria-label={label}
          title={label}
          className={`theme-toggle-btn ${pref === value ? 'active' : ''}`}
          onClick={() => setPref(value)}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  )
}
