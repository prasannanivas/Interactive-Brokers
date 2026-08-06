import React, { useState, useEffect } from 'react';
import './FxReports.css';

const API_URL = import.meta.env.VITE_TRADING_API_URL || 'http://167.172.215.78:8000'

const formatDate = (dateStr) => {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    });
  } catch {
    return dateStr;
  }
};

const formatSize = (bytes) => {
  if (!bytes) return '';
  const kb = bytes / 1024;
  return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
};

// The download job keeps running every day, but there's no FX report on
// weekends (markets are closed) — hide any weekend-dated entries from the UI
// rather than touching the backend schedule.
const isWeekend = (dateStr) => {
  const day = new Date(dateStr + 'T00:00:00Z').getUTCDay();
  return day === 0 || day === 6;
};

const FxReports = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/fx-reports?limit=90`);
      if (!response.ok) throw new Error('Failed to load FX reports');
      const json = await response.json();
      const weekdayReports = (json.reports || []).filter(r => !isWeekend(r.report_date));
      setReports(weekdayReports);
      setError(null);
    } catch (err) {
      console.error('Error loading FX reports:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadUrl = (reportDate) => `${API_URL}/api/fx-reports/${reportDate}/download`;

  if (loading) {
    return <div className="fx-reports-status">Loading FX reports...</div>;
  }

  if (error) {
    return <div className="fx-reports-status fx-reports-error">Error: {error}</div>;
  }

  if (reports.length === 0) {
    return (
      <div className="fx-reports-status">
        No FX reports have been downloaded yet. The daily download runs automatically at 12:00 PM EST.
      </div>
    );
  }

  const [latest, ...history] = reports;
  // report_date is stamped in US/Eastern on the backend — compare "today" in
  // the same timezone, not the viewer's local time, so the label doesn't
  // flip incorrectly for users outside EST around midnight.
  const todayEstStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const isLatestToday = latest.report_date === todayEstStr;

  return (
    <div className="fx-reports">
      <div className="fx-reports-latest">
        <div className="fx-reports-latest-label">{isLatestToday ? "Today's Report" : 'Latest Report'}</div>
        <div className="fx-reports-latest-card">
          <div className="fx-reports-latest-info">
            <div className="fx-reports-latest-title">Scotiabank G10 FX Daily</div>
            <div className="fx-reports-latest-date">{formatDate(latest.report_date)}</div>
            <div className="fx-reports-latest-meta">{formatSize(latest.file_size)}</div>
          </div>
          <a
            className="fx-reports-open-button"
            href={downloadUrl(latest.report_date)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open PDF
          </a>
        </div>
      </div>

      {history.length > 0 && (
        <div className="fx-reports-history">
          <div className="fx-reports-history-label">History</div>
          <ul className="fx-reports-history-list">
            {history.map((report) => (
              <li key={report.report_date} className="fx-reports-history-item">
                <span className="fx-reports-history-date">{formatDate(report.report_date)}</span>
                <span className="fx-reports-history-meta">{formatSize(report.file_size)}</span>
                <a
                  className="fx-reports-history-link"
                  href={downloadUrl(report.report_date)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default FxReports;
