import { useState } from 'react';
import { sendCommand } from '../api.js';
import './RelayControls.css';

export default function RelayControls({ deviceId }) {
  const [sending, setSending] = useState(null);

  const handleCommand = async (action) => {
    setSending(action);
    try {
      await sendCommand(deviceId, { action });
    } catch (err) {
      console.error('Command failed:', err);
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="relay-controls">
      <button
        className="btn btn-success btn-sm"
        disabled={sending !== null}
        onClick={() => handleCommand('on')}
      >
        {sending === 'on' ? '…' : '🔆 ON'}
      </button>
      <button
        className="btn btn-danger btn-sm"
        disabled={sending !== null}
        onClick={() => handleCommand('off')}
      >
        {sending === 'off' ? '…' : '⬛ OFF'}
      </button>
      <button
        className="btn btn-primary btn-sm"
        disabled={sending !== null}
        onClick={() => handleCommand('auto')}
      >
        {sending === 'auto' ? '…' : '🔄 Auto'}
      </button>
    </div>
  );
}
