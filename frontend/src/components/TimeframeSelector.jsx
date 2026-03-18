import React from 'react'
import './TimeframeSelector.css'

const TimeframeSelector = ({ selectedTimeframe, onTimeframeChange }) => {
  const timeframes = [
    // { label: '1W', value: 7, days: 7 },
    // { label: '1M', value: 30, days: 30 },
    { label: '6M', value: 180, days: 180 },
    { label: '1Y', value: 365, days: 365 },
    { label: '3Y', value: 1095, days: 1095 },
    { label: '5Y', value: 1825, days: 1825 }
  ]

  return (
    <div className="timeframe-selector">
      {timeframes.map(tf => (
        <button
          key={tf.value}
          className={`timeframe-btn ${selectedTimeframe === tf.value ? 'active' : ''}`}
          onClick={() => onTimeframeChange(tf.value)}
        >
          {tf.label}
        </button>
      ))}
    </div>
  )
}

export default TimeframeSelector
