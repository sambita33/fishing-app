import React, { useState, useEffect } from 'react';
import './App.css';
import { supabase } from './supabaseClient';
import MessageHistory from './components/MessageHistory';
import FishingMap from './components/FishingMapfixed';
import { calculateViolationTimes, calculateTotalViolations } from './utils/geofencing';

function App() {
  const [fishermen, setFishermen] = useState([]);
  const [selectedFishermen, setSelectedFishermen] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState('send-sms');
  const [expandedFisherman, setExpandedFisherman] = useState(null);
  const [fishingSessions, setFishingSessions] = useState({});
  const [selectedSession, setSelectedSession] = useState({}); // Track selected session per fisherman

  // Fetch fishermen and their sessions
  useEffect(() => {
    fetchFishermenWithSessions();
  }, []);

  const fetchFishermenWithSessions = async () => {
    try {
      setLoading(true);
      
      // Fetch fishermen
      const { data: fishermenData, error: fishermenError } = await supabase
        .from('profiles')
        .select('id, first_name, phone');

      if (fishermenError) throw fishermenError;
      
      const fishermenWithData = (fishermenData || []).map(profile => ({
        id: profile.id,
        name: profile.first_name,
        phone_number: profile.phone
      }));
      
      setFishermen(fishermenWithData);

      // Fetch fishing sessions for all fishermen
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('fishing_sessions')
        .select('*')
        .order('start_time', { ascending: false });

      if (sessionsError) throw sessionsError;

      // Group sessions by user_id
      const sessionsByFisherman = {};
      sessionsData?.forEach(session => {
        if (!sessionsByFisherman[session.user_id]) {
          sessionsByFisherman[session.user_id] = [];
        }
        sessionsByFisherman[session.user_id].push(session);
      });

      setFishingSessions(sessionsByFisherman);

      // Set first session as selected for each fisherman
      const initialSelectedSessions = {};
      Object.keys(sessionsByFisherman).forEach(fishermanId => {
        if (sessionsByFisherman[fishermanId].length > 0) {
          initialSelectedSessions[fishermanId] = sessionsByFisherman[fishermanId][0].id;
        }
      });
      setSelectedSession(initialSelectedSessions);

    } catch (error) {
      console.error('Error fetching data:', error);
      alert('Error loading data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleFishermanSelection = (fishermanId) => {
    if (selectedFishermen.includes(fishermanId)) {
      setSelectedFishermen(selectedFishermen.filter(id => id !== fishermanId));
    } else {
      setSelectedFishermen([...selectedFishermen, fishermanId]);
    }
  };

  const selectAllFishermen = () => {
    const allIds = fishermen.map(f => f.id);
    setSelectedFishermen(allIds);
  };

  const clearSelection = () => {
    setSelectedFishermen([]);
  };

  // REAL function to calculate violations using geofencing
  const getViolationIndicator = (fishermanId) => {
    const sessions = fishingSessions[fishermanId] || [];
    
    if (sessions.length === 0) {
      return { icon: '📊', text: 'No Data', color: 'gray' };
    }

    // Calculate real violations using geofencing
    const violations = calculateTotalViolations(sessions);
    const totalViolationMinutes = violations.totalOutsideTime + violations.totalRestrictedTime;

    if (totalViolationMinutes > 30) {
      return { icon: '⚠️', text: `${totalViolationMinutes}min`, color: 'red' };
    }
    if (totalViolationMinutes > 10) {
      return { icon: '⚠️', text: `${totalViolationMinutes}min`, color: 'orange' };
    }
    if (totalViolationMinutes > 0) {
      return { icon: '⚠️', text: `${totalViolationMinutes}min`, color: 'orange' };
    }
    return { icon: '✅', text: 'Clean', color: 'green' };
  };

  // Helper function to calculate session duration in seconds
  const calculateSessionDuration = (session) => {
    if (session.start_time && session.end_time) {
      const start = new Date(session.start_time);
      const end = new Date(session.end_time);
      return (end - start) / 1000; // Convert to seconds
    }
    return 0;
  };

  // Get last 10 sessions for a fisherman
  const getLastSessions = (fishermanId) => {
    const sessions = fishingSessions[fishermanId] || [];
    return sessions.slice(0, 10); // Last 10 sessions
  };

  // Get selected session for a fisherman
  const getSelectedSession = (fishermanId) => {
    const sessionId = selectedSession[fishermanId];
    if (!sessionId) return null;
    
    const sessions = fishingSessions[fishermanId] || [];
    return sessions.find(session => session.id === sessionId) || sessions[0];
  };

  const toggleFishermanExpansion = (fishermanId) => {
    if (expandedFisherman === fishermanId) {
      setExpandedFisherman(null);
    } else {
      setExpandedFisherman(fishermanId);
    }
  };

  const handleSessionChange = (fishermanId, sessionId) => {
    setSelectedSession(prev => ({
      ...prev,
      [fishermanId]: sessionId
    }));
  };

  const sendSMS = async () => {
    if (selectedFishermen.length === 0) {
      alert('Please select at least one fisherman');
      return;
    }

    if (!message.trim()) {
      alert('Please enter a message');
      return;
    }

    try {
      setSending(true);
      
      const selectedFishermenDetails = fishermen
        .filter(f => selectedFishermen.includes(f.id))
        .map(f => ({
          name: f.name,
          phone: f.phone_number
        }));

      const selectedPhones = selectedFishermenDetails.map(f => {
        let phone = f.phone;
        if (!phone.startsWith('+')) {
          phone = '+91' + phone;
        }
        return phone;
      });

      const edgeFunctionUrl = process.env.REACT_APP_EDGE_FUNCTION_URL;

      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.REACT_APP_SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          phones: selectedPhones,
          message: message,
          fishermenDetails: selectedFishermenDetails
        }),
      });

      const result = await response.json();
      console.log('Edge Function Response:', result);
      if (!response.ok) {
        throw new Error(result.error || 'Failed to send SMS');
      }
      
      alert(`Success! ${result.message}`);
      
      setMessage('');
      setSelectedFishermen([]);
      
    } catch (error) {
      console.error('Error sending SMS:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // Format date for display - NO TIMEZONE CONVERSION!
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    
    // Extract date part directly
    const datePart = dateString.split('T')[0];
    const [year, month, day] = datePart.split('-');
    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    return `${parseInt(day)} ${monthNames[parseInt(month) - 1]} ${year}`;
  };

  // Format time for display - NO TIMEZONE CONVERSION!
  const formatTime = (dateString) => {
    if (!dateString) return 'N/A';
    
    // Direct extraction from timestamp (already in IST)
    const timePart = dateString.split('T')[1]?.split('.')[0];
    if (!timePart) return 'N/A';
    
    const [hours, minutes] = timePart.split(':');
    const hourNum = parseInt(hours);
    const ampm = hourNum >= 12 ? 'pm' : 'am';
    const displayHour = hourNum % 12 || 12;
    
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Format session for dropdown display
  const formatSessionForDropdown = (session, index) => {
    const duration = Math.round(calculateSessionDuration(session) / 60);
    const date = formatDate(session.start_time);
    const time = formatTime(session.start_time);
    return `Session ${index + 1} - ${date} ${time} (${duration}min)`;
  };

  return (
    <div className="App">
      <header className="header">
        <h1>Fishermen SMS Alert System</h1>
        <p>Authority Control Panel</p>
      </header>

      <div className="tabs">
        <button 
          className={`tab-button ${activeTab === 'send-sms' ? 'active' : ''}`}
          onClick={() => setActiveTab('send-sms')}
        >
          Send SMS
        </button>
        <button 
          className={`tab-button ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Message History
        </button>
      </div>

      <div className="container">
        {activeTab === 'send-sms' && (
          <>
            <div className="section">
              <h2>Fishermen List</h2>
              <div className="selection-actions">
                <button onClick={selectAllFishermen} className="btn-secondary">
                  Select All
                </button>
                <button onClick={clearSelection} className="btn-secondary">
                  Clear Selection
                </button>
              </div>

              {loading ? (
                <div className="loading">Loading fishermen data...</div>
              ) : (
                <div className="fishermen-list-container">
                  <table className="fishermen-table">
                    <thead>
                      <tr>
                        <th className="col-select">Select</th>
                        <th className="col-name">Name</th>
                        <th className="col-phone">Phone</th>
                        <th className="col-violations">Violations</th>
                        <th className="col-activity">Activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fishermen.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="no-data">No fishermen found in database</td>
                        </tr>
                      ) : (
                        fishermen.map(fisherman => {
                          const violation = getViolationIndicator(fisherman.id);
                          const sessions = getLastSessions(fisherman.id);
                          const selectedSessionData = getSelectedSession(fisherman.id);
                          
                          return (
                            <React.Fragment key={fisherman.id}>
                              <tr className="fisherman-row">
                                <td className="col-select">
                                  <input
                                    type="checkbox"
                                    checked={selectedFishermen.includes(fisherman.id)}
                                    onChange={() => toggleFishermanSelection(fisherman.id)}
                                  />
                                </td>
                                <td className="col-name">
                                  <span className="fisherman-name">{fisherman.name}</span>
                                </td>
                                <td className="col-phone">
                                  <span className="fisherman-phone">{fisherman.phone_number}</span>
                                </td>
                                <td className="col-violations">
                                  <span 
                                    className={`violation-indicator ${violation.color}`}
                                    title={`Time outside border: ${violation.text}`}
                                  >
                                    {violation.icon} {violation.text}
                                  </span>
                                </td>
                                <td className="col-activity">
                                  <button 
                                    className="show-activity-btn"
                                    onClick={() => toggleFishermanExpansion(fisherman.id)}
                                    disabled={sessions.length === 0}
                                  >
                                    {expandedFisherman === fisherman.id ? 'HIDE' : 'SHOW'}
                                  </button>
                                </td>
                              </tr>
                              {expandedFisherman === fisherman.id && (
                                <tr className="expanded-row">
                                  <td colSpan="5">
                                    <div className="fisherman-route-section">
                                      <h3>{fisherman.name}'s Fishing Activity</h3>
                                      
                                      {sessions.length === 0 ? (
                                        <div className="no-data">No fishing sessions available</div>
                                      ) : (
                                        <div className="route-content">
                                          {/* Session Dropdown */}
                                          <div className="session-selector">
                                            <label htmlFor={`session-select-${fisherman.id}`}>
                                              Select Session:
                                            </label>
                                            <select
                                              id={`session-select-${fisherman.id}`}
                                              value={selectedSession[fisherman.id] || ''}
                                              onChange={(e) => handleSessionChange(fisherman.id, e.target.value)}
                                              className="session-dropdown"
                                            >
                                              {sessions.map((session, index) => (
                                                <option key={session.id} value={session.id}>
                                                  {formatSessionForDropdown(session, index)}
                                                </option>
                                              ))}
                                            </select>
                                          </div>

                                          {/* Selected Session Summary */}
                                          {selectedSessionData && (
                                            <div className="session-summary">
                                              <h4>Session Summary</h4>
                                              <div className="summary-grid">
                                                <div className="summary-item">
                                                  <span className="summary-label">Date:</span>
                                                  <span className="summary-value">
                                                    {formatDate(selectedSessionData.start_time)}
                                                  </span>
                                                </div>
                                                <div className="summary-item">
                                                  <span className="summary-label">Time:</span>
                                                  <span className="summary-value">
                                                    {formatTime(selectedSessionData.start_time)} - {formatTime(selectedSessionData.end_time)}
                                                  </span>
                                                </div>
                                                <div className="summary-item">
                                                  <span className="summary-label">Duration:</span>
                                                  <span className="summary-value">
                                                    {Math.round(calculateSessionDuration(selectedSessionData) / 60)} minutes
                                                  </span>
                                                </div>
                                                <div className="summary-item">
                                                  <span className="summary-label">Gear Type:</span>
                                                  <span className="summary-value">
                                                    {selectedSessionData.fishing_gear || 'Not specified'}
                                                  </span>
                                                </div>
                                              </div>
                                            </div>
                                          )}

                                          {/* Map Visualization */}
                                          <div className="map-section">
                                            <h4>Route Visualization</h4>
                                            {selectedSessionData ? (
                                              <FishingMap 
                                                sessionData={selectedSessionData} 
                                                fishermanName={fisherman.name}
                                                violationTimes={calculateViolationTimes(selectedSessionData.location_data)}
                                              />
                                            ) : (
                                              <div className="map-placeholder">
                                                <p>Select a session to view the map</p>
                                              </div>
                                            )}
                                          </div>

                                          {/* REAL Violation Analytics */}
                                          {selectedSessionData && (
                                            <div className="violation-analytics">
                                              <h4>Violation Analytics</h4>
                                              <div className="analytics-grid">
                                                <div className="analytics-item">
                                                  <span className="analytics-icon">⚠️</span>
                                                  <span className="analytics-label">Time outside border:</span>
                                                  <span className="analytics-value">
                                                    {calculateViolationTimes(selectedSessionData.location_data).outsideBorderTime} minutes
                                                  </span>
                                                </div>
                                                <div className="analytics-item">
                                                  <span className="analytics-icon">🚫</span>
                                                  <span className="analytics-label">Time in restricted zone:</span>
                                                  <span className="analytics-value">
                                                    {calculateViolationTimes(selectedSessionData.location_data).restrictedZoneTime} minutes
                                                  </span>
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="section">
              <h2>Compose Message</h2>
              <div className="selected-count">
                {selectedFishermen.length} fishermen selected
              </div>
              
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your custom message here... (Max 160 characters)"
                rows="5"
                maxLength="160"
                className="message-textarea"
              />
              <div className="char-count">{message.length}/160 characters</div>

              <button 
                onClick={sendSMS} 
                disabled={sending || selectedFishermen.length === 0}
                className="send-btn"
              >
                {sending ? 'Sending...' : `Send SMS to ${selectedFishermen.length} Fishermen`}
              </button>
            </div>
          </>
        )}

        {activeTab === 'history' && (
          <div className="section">
            <MessageHistory />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
