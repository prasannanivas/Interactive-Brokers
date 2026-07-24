import React from 'react';
import FxReports from '../components/FxReports';
import { useNavigate } from 'react-router-dom';
import './FxReportsPage.css';

const FxReportsPage = () => {
  const navigate = useNavigate();

  return (
    <div className="fx-reports-page">
      <div className="fx-reports-page-header">
        <button className="back-button" onClick={() => navigate('/dashboard')}>
          ← Back to Dashboard
        </button>
        <h1>FX Reports</h1>
      </div>

      <div className="fx-reports-page-content">
        <FxReports />
      </div>
    </div>
  );
};

export default FxReportsPage;
