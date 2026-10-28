import { Link } from 'react-router-dom';
import RelayControls from './RelayControls.jsx';
import { formatCoords } from '../location.js';
import './DeviceCard.css';

function getStatus(lastSeen) {
  if (!lastSeen) return 'offline';
  const diff = (Date.now() - new Date(lastSeen).getTime()) / 60000;
  return diff < 20 ? 'online' : 'offline';
}

export default function DeviceCard({ device }) {
  const status = getStatus(device.last_seen);
  const hasFault = device.fault_code && device.fault_code !== 0;

  const statusClass = hasFault ? 'fault' : status;

  return (
    <div className={`device-card device-card--${statusClass}`}>
      <div className="device-card-header">
        <Link to={`/device/${device.device_id}`} className="device-card-name">
          {device.name || device.device_id}
        </Link>
        <span className={`badge badge-${hasFault ? 'warning' : status === 'online' ? 'success' : 'danger'}`}>
          {hasFault ? 'FAULT' : status.toUpperCase()}
        </span>
      </div>

      <div className="device-card-grid">
        <div className="device-metric">
          <span className="metric-label">Voltage</span>
          <span className="metric-value">{device.voltage_v?.toFixed(1) ?? '—'} V</span>
        </div>
        <div className="device-metric">
          <span className="metric-label">Current</span>
          <span className="metric-value">{device.current_a?.toFixed(2) ?? '—'} A</span>
        </div>
        <div className="device-metric">
          <span className="metric-label">Power</span>
          <span className="metric-value">{device.kw?.toFixed(3) ?? '—'} kW</span>
        </div>
        <div className="device-metric">
          <span className="metric-label">Energy</span>
          <span className="metric-value">{device.kwh?.toFixed(1) ?? '—'} kWh</span>
        </div>
        <div className="device-metric">
          <span className="metric-label">Lights On</span>
          <span className="metric-value">{device.on_off ? '🟢 ON' : '🔴 OFF'}</span>
        </div>
        <div className="device-metric">
          <span className="metric-label">GPS</span>
          <span className="metric-value metric-small">
            {formatCoords(device, 4)}
          </span>
        </div>
      </div>

      {hasFault && (
        <div className="device-card-fault">
          ⚠️ Fault Code: {device.fault_code}
        </div>
      )}

      <div className="device-card-footer">
        <span className="last-seen">
          Last seen: {device.last_seen ? new Date(device.last_seen).toLocaleString() : 'Never'}
        </span>
      </div>

      <RelayControls deviceId={device.device_id} />
    </div>
  );
}
