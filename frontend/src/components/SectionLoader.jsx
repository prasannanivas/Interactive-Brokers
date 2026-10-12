import React, { useEffect, useRef, useState } from 'react'
import './SectionLoader.css'

// Skeleton placeholder shaped like the content it stands in for.
// variant: 'chart' | 'table' | 'matrix'
// embedded: render without its own card (when placed inside an existing panel)
export const SectionLoader = ({ label = 'Loading…', variant = 'chart', height, title, embedded = false }) => (
  <div className={`section-loader section-loader--${variant}${embedded ? ' section-loader--embedded' : ''}`} style={height ? { minHeight: height } : undefined}
    role="status" aria-live="polite" aria-label={label}>
    {title && <div className="section-loader__title">{title}</div>}
    <div className="section-loader__body">
      {variant === 'chart' && (
        <div className="section-loader__chart">
          {[38, 55, 47, 68, 60, 76, 64, 82, 71, 88, 79, 92].map((h, i) => (
            <span key={i} className="section-loader__bar" style={{ height: `${h}%`, animationDelay: `${i * 70}ms` }} />
          ))}
        </div>
      )}
      {variant === 'table' && (
        <div className="section-loader__table">
          {Array.from({ length: 6 }).map((_, r) => (
            <div key={r} className="section-loader__row" style={{ animationDelay: `${r * 90}ms` }}>
              <span className="section-loader__cell section-loader__cell--wide" />
              {Array.from({ length: 6 }).map((__, c) => <span key={c} className="section-loader__cell" />)}
            </div>
          ))}
        </div>
      )}
      {variant === 'matrix' && (
        <div className="section-loader__matrix">
          {Array.from({ length: 48 }).map((_, i) => (
            <span key={i} className="section-loader__tile" style={{ animationDelay: `${(i % 8) * 60 + Math.floor(i / 8) * 60}ms` }} />
          ))}
        </div>
      )}
      <div className="section-loader__overlay">
        <span className="section-loader__spinner" />
        <span className="section-loader__label">{label}</span>
      </div>
    </div>
  </div>
)

// Renders children only once the section scrolls near the viewport, so data for
// sections further down the page isn't fetched until it's about to be seen.
export const LazySection = ({ children, placeholder, rootMargin = '400px' }) => {
  const ref = useRef(null)
  const [visible, setVisible] = useState(() => typeof window === 'undefined' || !('IntersectionObserver' in window))

  useEffect(() => {
    if (visible || !ref.current) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [visible, rootMargin])

  return <div ref={ref}>{visible ? children : placeholder}</div>
}

export default SectionLoader
