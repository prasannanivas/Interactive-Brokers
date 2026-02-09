import React from 'react';
import EconomicCalendar from '../components/EconomicCalendar';
import { useNavigate } from 'react-router-dom';
import './EconomicCalendarPage.css';

const EconomicCalendarPage = () => {
  const navigate = useNavigate();

  return (
    <div className="economic-calendar-page">
      <div className="calendar-page-header">
        <button className="back-button" onClick={() => navigate('/dashboard')}>
          ← Back to Dashboard
        </button>
        <h1>Economic Calendar</h1>
      </div>
      
      <div className="calendar-page-content">
        <EconomicCalendar />
      </div>
    </div>
  );
};

export default EconomicCalendarPage;
