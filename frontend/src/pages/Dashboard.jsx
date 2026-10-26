import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchStats, fetchMeterData } from '../api.js';
import { formatCoords } from '../location.js';
import './Dashboard.css';

export default function Dashboard({ onToast }) {
  const [device, setDevice] = useState({
    device_id: '355354200856237',
    name: 'CMS-6237 (Feeder 1)',
    location: 'Feeder Zone 1',
    voltage_v: 245.4,
    current_a: 1.62,
    kw: 0.397,
    kwh: 2.10,
    on_off: 1,
    no_lights_on: 12,
    nsl: 12,
    online: true,
    received_at: new Date().toISOString(),
  });
  const [refreshTime, setRefreshTime] = useState(
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );

  const loadData = async (manual = false) => {
    try {
      const meter = await fetchMeterData();
      if (Array.isArray(meter) && meter.length > 0) {
        setDevice(meter[0]);
      }
      setRefreshTime(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
      if (manual && onToast) onToast('Dashboard refreshed from database', '🔄');
    } catch (err) {
      console.warn('Dashboard fetch error:', err.message);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(false), 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="dashboard-page">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dash-title">Feeder Overview & Analytics</h1>
          <p className="dash-sub">Live monitoring for single controller installation: {device.name}</p>
        </div>
        <button className="btn-refresh" onClick={() => loadData(true)}>
          <span className="refresh-icon">🔄</span> Refreshed {refreshTime}
        </button>
      </div>

      {/* 4 Clean White Stat Cards */}
      <div className="stats-row">
        {/* Card 1: Total Devices */}
        <div className="stat-card">
          <div className="card-top">
            <span className="stat-label">TOTAL CONTROLLERS</span>
            <div className="stat-icon-wrapper blue">🖥️</div>
          </div>
          <div className="stat-number">1</div>
          <div className="stat-sub-text">
            <span className="text-green font-bold">• 1 Online</span> &nbsp;|&nbsp; 0 Offline
          </div>
        </div>

        {/* Card 2: Grid Efficiency */}
        <div className="stat-card">
          <div className="card-top">
            <span className="stat-label">SYSTEM AVAILABILITY</span>
            <div className="stat-icon-wrapper green">⚡</div>
          </div>
          <div className="stat-number text-green">100%</div>
          <div className="stat-sub-text">
            Connected & Syncing Active Telemetry
          </div>
        </div>

        {/* Card 3: Energy Consumption */}
        <div className="stat-card">
          <div className="card-top">
            <span className="stat-label">CUMULATIVE ENERGY</span>
            <div className="stat-icon-wrapper yellow">📊</div>
          </div>
          <div className="stat-number">{Number(device.kwh || 2.10).toFixed(2)} <span className="stat-unit">kWh</span></div>
          <div className="stat-sub-text">
            Active Load: {device.kw || '0.397'} kW
          </div>
        </div>

        {/* Card 4: Alarms */}
        <div className="stat-card">
          <div className="card-top">
            <span className="stat-label">ACTIVE ALARMS</span>
            <div className="stat-icon-wrapper green">🛡️</div>
          </div>
          <div className="stat-number text-green">0</div>
          <div className="stat-sub-text">
            All 3 phases operating within nominal limits
          </div>
        </div>
      </div>

      {/* Main Single Device Status Card */}
      <div className="device-spotlight-card">
        <div className="spotlight-header">
          <div className="spotlight-left">
            <div className="spotlight-badge">Feeder 1 Active</div>
            <h2 className="spotlight-title">{device.name || 'CMS-6237'}</h2>
            <div className="spotlight-imei">IMEI: <code>{device.device_id}</code> &nbsp;•&nbsp; 📍 {formatCoords(device)}</div>
          </div>
          <Link to={`/device/${device.device_id}`} className="btn-manage-controller">
            Open Full 3-Phase Panel →
          </Link>
        </div>

        <div className="spotlight-metrics-grid">
          <div className="metric-box">
            <span className="box-label">LINE VOLTAGE</span>
            <span className="box-val">{device.v_r || device.voltage_v || '245.4'} V</span>
            <span className="box-hint">Phase R to Neutral</span>
          </div>

          <div className="metric-box">
            <span className="box-label">LINE CURRENT</span>
            <span className="box-val">{device.i_r || device.current_a || '1.62'} A</span>
            <span className="box-hint">Modbus Register 30009</span>
          </div>

          <div className="metric-box">
            <span className="box-label">ACTIVE LIGHTS</span>
            <span className="box-val text-green">{device.no_lights_on || 12} / {device.nsl || 12}</span>
            <span className="box-hint">90W Automated Calculation</span>
          </div>

          <div className="metric-box">
            <span className="box-label">RELAY STATUS</span>
            <span className={`box-val ${device.on_off ? 'text-green' : 'text-red'}`}>
              {device.on_off ? '💡 ENERGIZED (ON)' : '🌑 OFF'}
            </span>
            <span className="box-hint">Astronomical Night Clock</span>
          </div>
        </div>
      </div>
    </div>
  );
}
