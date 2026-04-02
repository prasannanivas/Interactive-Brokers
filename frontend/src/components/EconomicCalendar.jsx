import React, { useState, useEffect, useMemo } from 'react';
import './EconomicCalendar.css';

const API_URL = import.meta.env.VITE_TRADING_API_URL || 'http://167.172.215.78:8000'

const EconomicCalendar = () => {
  const [calendarData, setCalendarData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters
  const [selectedCountry, setSelectedCountry] = useState('All');
  const [selectedImportance, setSelectedImportance] = useState('All');
  const [dateRange, setDateRange] = useState('upcoming'); // upcoming, today, week, month, all
  const [searchTerm, setSearchTerm] = useState('');
  
  // Category filters
  const [filterInterestRate, setFilterInterestRate] = useState(false);
  const [filterUnemployment, setFilterUnemployment] = useState(false);
  const [filterInflation, setFilterInflation] = useState(false);

  useEffect(() => {
    loadCalendarData();
  }, []);

  const loadCalendarData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/economic-calendar?days_past=30&days_future=180`);
      if (!response.ok) throw new Error('Failed to load calendar data');
      const json = await response.json();
      // API returns { total, events } — map to the same shape the UI expects
      const events = (json.events || []).map(ev => ({
        ...ev,
        date: ev.date_str || ev.date?.split('T')[0] || ev.date,
        time: ev.time || '',
        is_future_event: ev.is_future_event,
      }));
      setCalendarData(events);
      setError(null);
    } catch (err) {
      console.error('Error loading calendar:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Get unique countries for filter
  const countries = useMemo(() => {
    const uniqueCountries = [...new Set(calendarData.map(event => event.country))];
    return ['All', ...uniqueCountries.sort()];
  }, [calendarData]);

  // Helper function to check if event matches category filters
  const matchesCategoryFilter = (event) => {
    const eventName = event.event.toLowerCase();
    
    const isInterestRate = eventName.includes('interest rate decision');
    const isUnemployment = eventName.includes('unemployment rate');
    const isInflation = eventName.includes('inflation') || eventName.includes('cpi');
    
    return { isInterestRate, isUnemployment, isInflation };
  };

  // Filter events
  const filteredEvents = useMemo(() => {
    let filtered = [...calendarData];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Category filters (Interest Rate, Unemployment, Inflation)
    const anyCategoryFilterActive = filterInterestRate || filterUnemployment || filterInflation;
    if (anyCategoryFilterActive) {
      filtered = filtered.filter(event => {
        const { isInterestRate, isUnemployment, isInflation } = matchesCategoryFilter(event);
        
        return (
          (filterInterestRate && isInterestRate) ||
          (filterUnemployment && isUnemployment) ||
          (filterInflation && isInflation)
        );
      });
    }

    // Date range filter
    if (dateRange !== 'all') {
      filtered = filtered.filter(event => {
        const eventDate = new Date(event.date);
        eventDate.setHours(0, 0, 0, 0);
        
        if (dateRange === 'today') {
          return eventDate.getTime() === today.getTime();
        } else if (dateRange === 'upcoming') {
          return eventDate >= today;
        } else if (dateRange === 'week') {
          const weekFromNow = new Date(today);
          weekFromNow.setDate(weekFromNow.getDate() + 7);
          return eventDate >= today && eventDate <= weekFromNow;
        } else if (dateRange === 'month') {
          const monthFromNow = new Date(today);
          monthFromNow.setMonth(monthFromNow.getMonth() + 1);
          return eventDate >= today && eventDate <= monthFromNow;
        }
        return true;
      });
    }

    // Country filter
    if (selectedCountry !== 'All') {
      filtered = filtered.filter(event => event.country === selectedCountry);
    }

    // Importance filter
    if (selectedImportance !== 'All') {
      filtered = filtered.filter(event => event.importance === selectedImportance);
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(event =>
        event.event.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.country.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return filtered;
  }, [calendarData, selectedCountry, selectedImportance, dateRange, searchTerm, filterInterestRate, filterUnemployment, filterInflation]);

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    today.setHours(0, 0, 0, 0);
    tomorrow.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    if (date.getTime() === today.getTime()) {
      return 'Today';
    } else if (date.getTime() === tomorrow.getTime()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
      });
    }
  };

  const getImportanceColor = (importance) => {
    switch (importance) {
      case 'High': return '#ff4444';
      case 'Medium': return '#ff9800';
      case 'Low': return '#4caf50';
      default: return '#999';
    }
  };

  const getValueChange = (actual, previous) => {
    if (actual === null || previous === null) return null;
    const diff = actual - previous;
    return diff;
  };

  const groupEventsByDate = (events) => {
    const groups = {};
    events.forEach(event => {
      if (!groups[event.date]) {
        groups[event.date] = [];
      }
      groups[event.date].push(event);
    });
    return groups;
  };

  const eventsByDate = useMemo(() => groupEventsByDate(filteredEvents), [filteredEvents]);

  if (loading) {
    return <div className="calendar-loading">Loading economic calendar...</div>;
  }

  if (error) {
    return <div className="calendar-error">Error: {error}</div>;
  }

  return (
    <div className="economic-calendar">
      <div className="calendar-header">
        <h2>Economic Calendar</h2>
        <div className="calendar-stats">
          <span className="timezone-badge">All times in EST</span>
          <span>{filteredEvents.length} events</span>
        </div>
      </div>

      <div className="calendar-filters">
        <div className="filter-group">
          <label>Date Range:</label>
          <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
            <option value="upcoming">Upcoming</option>
            <option value="today">Today</option>
            <option value="week">Next 7 Days</option>
            <option value="month">Next 30 Days</option>
            <option value="all">All Data</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Country:</label>
          <select value={selectedCountry} onChange={(e) => setSelectedCountry(e.target.value)}>
            {countries.map(country => (
              <option key={country} value={country}>{country}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Importance:</label>
          <select value={selectedImportance} onChange={(e) => setSelectedImportance(e.target.value)}>
            <option value="All">All</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>

        <div className="filter-group search-group">
          <label>Search:</label>
          <input
            type="text"
            placeholder="Search events..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Category filters for key economic indicators */}
      <div className="category-filters">
        <label className="category-filter-label">Key Indicators:</label>
        <div className="checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={filterInterestRate}
              onChange={(e) => setFilterInterestRate(e.target.checked)}
            />
            <span>Interest Rate Decisions</span>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={filterUnemployment}
              onChange={(e) => setFilterUnemployment(e.target.checked)}
            />
            <span>Unemployment Rate</span>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={filterInflation}
              onChange={(e) => setFilterInflation(e.target.checked)}
            />
            <span>Inflation (CPI)</span>
          </label>
        </div>
      </div>

      <div className="calendar-content">
        {Object.keys(eventsByDate).length === 0 ? (
          <div className="no-events">No events found for the selected filters</div>
        ) : (
          Object.entries(eventsByDate).map(([date, events]) => (
            <div key={date} className="date-group">
              <div className="date-header">
                <h3>{formatDate(date)}</h3>
                <span className="event-count">{events.length} events</span>
              </div>
              
              <div className="events-list">
                {events.map(event => {
                  const valueChange = getValueChange(event.actual, event.previous);
                  
                  return (
                    <div key={event.id} className="event-item">
                      <div className="event-time">{event.time}</div>
                      
                      <div 
                        className="event-importance" 
                        style={{ backgroundColor: getImportanceColor(event.importance) }}
                        title={`${event.importance} Importance`}
                      />
                      
                      <div className="event-details">
                        <div className="event-country">
                          <span className="country-flag">{event.currency}</span>
                          <span className="country-name">{event.country}</span>
                        </div>
                        <div className="event-name">{event.event}</div>
                      </div>
                      
                      <div className="event-data">
                        <div className="data-item">
                          <span className="data-label">Actual:</span>
                          <span className="data-value actual">
                            {event.actual !== null ? event.actual : '-'}
                          </span>
                        </div>
                        <div className="data-item">
                          <span className="data-label">Forecast:</span>
                          <span className="data-value forecast">
                            {event.forecast !== null ? event.forecast : '-'}
                          </span>
                        </div>
                        <div className="data-item">
                          <span className="data-label">Previous:</span>
                          <span className="data-value previous">
                            {event.previous !== null ? event.previous : '-'}
                          </span>
                        </div>
                        {valueChange !== null && (
                          <div className={`value-change ${valueChange >= 0 ? 'positive' : 'negative'}`}>
                            {valueChange >= 0 ? '▲' : '▼'} {Math.abs(valueChange).toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default EconomicCalendar;
