import React from 'react'
import './FullscreenChartModal.css'

const FullscreenChartModal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null

  return (
    <div className="fullscreen-chart-overlay" onClick={onClose}>
      <div className="fullscreen-chart-container" onClick={(e) => e.stopPropagation()}>
        <div className="fullscreen-chart-header">
          <h2 className="fullscreen-chart-title">{title}</h2>
          <button className="fullscreen-close-btn" onClick={onClose} title="Close (ESC)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="fullscreen-chart-content">
          {children}
        </div>
      </div>
    </div>
  )
}

export default FullscreenChartModal
