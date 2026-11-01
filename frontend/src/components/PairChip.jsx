import React from 'react'

// Two-ink pair chip: base currency ink | quote currency ink (colours in index.css).
// Anything that isn't a six-letter FX pair renders as a single neutral chip.
export default function PairChip({ symbol }) {
  const label = String(symbol || '').replace(/^C:/, '')
  const letters = label.replace(/[^A-Za-z]/g, '').toUpperCase()

  if (letters.length !== 6) {
    return <span className="pair-chip"><span>{label}</span></span>
  }

  const base = letters.slice(0, 3)
  const quote = letters.slice(3)
  return (
    <span className="pair-chip" aria-label={`${base}/${quote}`}>
      <span className={`cur-${base.toLowerCase()}`}>{base}</span>
      <span className={`cur-${quote.toLowerCase()}`}>{quote}</span>
    </span>
  )
}
