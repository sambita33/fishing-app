import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const MessageHistory = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMessageHistory();
  }, []);

  const fetchMessageHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('message_history')
        .select('*')
        .order('sent_at', { ascending: false });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching message history:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return <div className="loading">Loading message history...</div>;
  }

  return (
    <div className="message-history">
      <h2>Message History</h2>
      
      {messages.length === 0 ? (
        <div className="no-data">No messages sent yet</div>
      ) : (
        <div className="history-list">
          {messages.map(message => (
            <div key={message.id} className="history-item">
              <div className="message-header">
                <span className="recipients">{message.recipient_count} recipients</span>
                <span className="message-time">{formatDate(message.sent_at)}</span>
              </div>
              <div className="message-content">
                <strong>Message:</strong> {message.message_text}
              </div>
              <div className="sent-to-section">
                <strong>Sent to:</strong>
                <div className="fishermen-recipients">
                  {message.sent_to && message.sent_to.map((fisherman, index) => (
                    <div key={index} className="fisherman-recipient">
                      <span className="recipient-name">{fisherman.name}</span>
                      <span className="recipient-phone">({fisherman.phone})</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MessageHistory;