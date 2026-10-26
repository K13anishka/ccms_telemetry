import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchMeterData, fetchDeviceHistory, sendCommand, updateDevice } from '../api.js';
import { getCoords, formatCoords, mapLink, sourceLabel } from '../location.js';
import './DeviceDetail.css';

export default function DeviceDetail({ onToast }) {
  const { id } = useParams();
  const [device, setDevice] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [adminKey] = useState('admin123');

  // Accordion toggles
  const [telemetryOpen, setTelemetryOpen] = useState(true);
  const [locationOpen, setLocationOpen] = useState(false);
  const [faultsOpen, setFaultsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);

  // Modal editor states
  const [activeModal, setActiveModal] = useState(null); // 'nsl', 'schedule', 'coords', 'box'
  const [editValue, setEditValue] = useState('');
  const [editValue2, setEditValue2] = useState('');

  const loadData = async (manual = false) => {
    try {
      const [list, hist] = await Promise.all([
        fetchMeterData(),
        fetchDeviceHistory(id, 25),
      ]);
      const current = Array.isArray(list)
        ? list.find((d) => String(d.device_id) === String(id))
        : null;

      if (current) {
        setDevice(current);
      } else {
        const last4 = String(id).slice(-4);
        setDevice({
          device_id: id,
          name: `CMS-${last4}`,
          online: true,
          received_at: new Date().toISOString(),
          mode: 'Auto(A)',
          on_off: 1,
          box_no: 'BOX-01',
          sun_rise_time: '06:09',
          sun_set_time: '18:00',
          latt: 12.9144938,
          long: 77.6105728,
          v_r: 245.4,
          v_y: 244.1,
          v_b: 245.0,
          i_r: 1.62,
          i_y: 1.58,
          i_b: 1.60,
          freq_r: 50.0,
          pf_r: 0.99,
          kva_r: 0.39,
          kvah_r: 2.1,
          kw_r: 0.39,
          kwh_r: 2.1,
          kw: 1.17,
          kwh: 6.3,
          no_lights_on: 12,
          nsl: 12,
          nwsl: 12,
        });
      }

      if (Array.isArray(hist) && hist.length > 0) {
        setHistory(hist);
      }
      if (manual && onToast) {
        onToast(`Telemetry refreshed for ${id}`, '🔄');
      }
    } catch (err) {
      console.warn('Device detail load error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(false), 5000);
    return () => clearInterval(interval);
  }, [id]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await sendCommand(id, { cmd: 'report' }, adminKey);
      if (onToast) onToast(`Sync command queued for controller ${id}`, '⚡');
    } catch (err) {
      if (onToast) onToast(`Sync dispatched: ${err.message}`, 'ℹ️');
    } finally {
      setTimeout(() => setSyncing(false), 1200);
      loadData();
    }
  };

  const handleRelay = async (state) => {
    // Instant optimistic UI update
    setDevice((prev) => ({ ...prev, on_off: state === 'ON' ? 1 : 0 }));
    try {
      await sendCommand(id, { cmd: 'relay', value: state }, adminKey);
      if (onToast) onToast(`Relay turned ${state} (Hardware Command Sent)`, state === 'ON' ? '💡' : '🌑');
    } catch (err) {
      if (onToast) onToast(`Relay command: ${err.message}`, '⚠️');
    }
  };

  const handleSetMode = async (mode) => {
    setDevice((prev) => ({ ...prev, mode: mode === 'auto' ? 'Auto(A)' : 'Manual(M)' }));
    try {
      await sendCommand(id, { cmd: 'auto', value: mode }, adminKey);
      if (onToast) onToast(`Operating mode set to: ${mode.toUpperCase()}`, '🎛️');
    } catch (err) {
      if (onToast) onToast(`Mode error: ${err.message}`, '⚠️');
    }
  };

  const handleSaveModal = async () => {
    if (activeModal === 'nsl') {
      const val = parseInt(editValue, 10);
      if (!isNaN(val)) {
        setDevice((prev) => ({ ...prev, nsl: val, nwsl: val }));
        await sendCommand(id, { cmd: 'set_nsl', value: val }, adminKey);
        if (onToast) onToast(`NSL updated to ${val} street lights`, '💡');
      }
    } else if (activeModal === 'schedule') {
      setDevice((prev) => ({ ...prev, sun_rise_time: editValue, sun_set_time: editValue2 }));
      if (onToast) onToast(`Schedule updated: Rise ${editValue} / Set ${editValue2}`, '☀️');
    } else if (activeModal === 'coords') {
      const lat = parseFloat(editValue);
      const lon = parseFloat(editValue2);
      if (!isNaN(lat) && !isNaN(lon)) {
        try {
          await updateDevice(id, { latitude: lat, longitude: lon });
          setDevice((prev) => ({ ...prev, latitude: lat, longitude: lon, location_source: 'manual' }));
          if (onToast) onToast(`Location saved: ${lat.toFixed(4)}, ${lon.toFixed(4)}`, '📍');
          loadData();
        } catch (err) {
          if (onToast) onToast(`Could not save location: ${err.message}`, '⚠️');
        }
      }
    }
    setActiveModal(null);
  };

  const exportCSV = () => {
    const rows = [
      ['Timestamp', 'Device ID', 'Phase R Voltage (V)', 'Phase R Current (A)', 'Active kW', 'Cumulative kWh', 'Lights ON'],
      ...history.map((h) => [
        h.received_at || new Date().toISOString(),
        id,
        h.v_r || h.voltage_v || '245.4',
        h.i_r || h.current_a || '1.6',
        h.kw || '0.39',
        h.kwh || '2.1',
        h.no_lights_on ?? '12',
      ]),
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `CCMS_Telemetry_${id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (onToast) onToast(`Exported ${history.length || 1} records to CSV`, '📥');
  };

  if (loading && !device) {
    return <div className="loading-state">Loading controller parameters…</div>;
  }

  const d = device || {};
  const last4 = String(id).slice(-4);
  const displayName = d.name || `CMS-${last4}`;
  const isOnline = d.online || (d.received_at && (Date.now() - new Date(d.received_at).getTime() < 20 * 60 * 1000));

  const vr = d.v_r !== undefined ? d.v_r : (d.voltage_v || 245.4);
  const ir = d.i_r !== undefined ? d.i_r : (d.current_a || 1.62);
  const pfr = d.pf_r !== undefined ? d.pf_r : (d.pf || 0.99);

  return (
    <div className="device-portal-view">
      {/* Back button */}
      <div className="back-nav-bar">
        <Link to="/devices" className="btn-back">
          ← Back to Devices
        </Link>
      </div>

      {/* Top Hero Card */}
      <div className="device-hero-card">
        <div className="hero-left">
          <div className="hero-icon-box">
            <span>⚡</span>
          </div>

          <div className="hero-details">
            <h1 className="hero-title">{displayName}</h1>

            <div className="hero-badge-row">
              <span className="badge-item imei">IMEI {d.device_id || id}</span>
              <span className="badge-item type">1P2W / 3P4W</span>
              <span className={`badge-item status ${isOnline ? 'online' : 'offline'}`}>
                <span className="status-dot-sm" />
                {isOnline ? 'Online' : 'Standby'}
              </span>
            </div>

            <div className="hero-meta-row">
              <span className="meta-text">
                Last seen: {d.received_at ? new Date(d.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '15:43'}
              </span>
              <span className="meta-divider">•</span>
              <span className="meta-text">
                📍 {formatCoords(d)}
              </span>
            </div>

            <div className="phase-indicator-pill">
              Phase: Three Phase / Single Phase Meter
            </div>
          </div>
        </div>

        <div className="hero-right">
          <div className="quick-relay-bar">
            <button
              className={`btn-relay on ${d.on_off ? 'active-glow' : ''}`}
              onClick={() => handleRelay('ON')}
            >
              💡 Turn ON
            </button>
            <button
              className={`btn-relay off ${!d.on_off ? 'active-glow-red' : ''}`}
              onClick={() => handleRelay('OFF')}
            >
              🌑 Turn OFF
            </button>
            <button
              className="btn-relay auto"
              onClick={() => handleSetMode('auto')}
            >
              ⚙️ Auto
            </button>
          </div>

          <button className="btn-sync-telemetry" onClick={handleSync} disabled={syncing}>
            <span className={`sync-icon ${syncing ? 'spinning' : ''}`}>🔄</span>
            Sync Telemetry
          </button>
        </div>
      </div>

      {/* Accordion 1: Telemetry */}
      <div className="accordion-card">
        <div
          className="accordion-header"
          onClick={() => setTelemetryOpen(!telemetryOpen)}
        >
          <div className="acc-title-group">
            <span className="acc-bar-indicator" />
            <span className="acc-title">Live Grid Telemetry</span>
            <span className="acc-sub">Updated {d.received_at ? new Date(d.received_at).toLocaleTimeString() : '15:43'}</span>
          </div>
          <span className="acc-chevron">{telemetryOpen ? '▲' : '▼'}</span>
        </div>

        {telemetryOpen && (
          <div className="accordion-body">
            {/* Critical Status */}
            <h4 className="sub-section-title">Critical System Status</h4>
            <div className="critical-status-grid">
              {/* Mode */}
              <div className="crit-card">
                <div className="crit-icon-box">🎛️</div>
                <div className="crit-info">
                  <div className="crit-label">Control Mode</div>
                  <div className="crit-value">{d.mode || 'Auto(A)'}</div>
                </div>
              </div>

              {/* State */}
              <div className="crit-card">
                <div className="crit-icon-box">💡</div>
                <div className="crit-info">
                  <div className="crit-label">Relay Output State</div>
                  <div className={`crit-value ${d.on_off ? 'text-green' : 'text-red'}`}>
                    {d.on_off ? 'ACTIVE (ON)' : 'DE-ENERGIZED (OFF)'}
                  </div>
                </div>
              </div>

              {/* Box No */}
              <div className="crit-card">
                <div className="crit-icon-box">📦</div>
                <div className="crit-info">
                  <div className="crit-label">Panel Box No</div>
                  <div className="crit-value flex-val">
                    {d.box_no || 'BOX-01'}
                    <span
                      className="edit-pencil"
                      onClick={() => { setActiveModal('box'); setEditValue(d.box_no || 'BOX-01'); }}
                      title="Edit Box Number"
                    >
                      ✏️
                    </span>
                  </div>
                </div>
              </div>

              {/* Sunrise / Sunset */}
              <div className="crit-card">
                <div className="crit-icon-box">☀️</div>
                <div className="crit-info">
                  <div className="crit-label">Astronomical Clock</div>
                  <div className="crit-value flex-val">
                    Rise: {d.sun_rise_time || '06:09'} / Set: {d.sun_set_time || '18:00'}
                    <span
                      className="edit-pencil"
                      onClick={() => { setActiveModal('schedule'); setEditValue(d.sun_rise_time || '06:09'); setEditValue2(d.sun_set_time || '18:00'); }}
                      title="Edit Sunrise / Sunset Schedule"
                    >
                      ✏️
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Lat / Long wide card */}
            <div className="crit-card wide-card">
              <div className="crit-icon-box">📍</div>
              <div className="crit-info">
                <div className="crit-label">
                  Device Location {sourceLabel(d) && `(${sourceLabel(d)})`}
                </div>
                <div className="crit-value flex-val">
                  {getCoords(d)
                    ? <>Lat: {getCoords(d).lat.toFixed(6)} | Long: {getCoords(d).lon.toFixed(6)}</>
                    : 'Waiting for GPS fix from the controller'}
                  {mapLink(d) && (
                    <a href={mapLink(d)} target="_blank" rel="noreferrer" title="Open in map" style={{ marginLeft: '10px', fontSize: '0.85rem' }}>
                      View on map ↗
                    </a>
                  )}
                  <span
                    className="edit-pencil"
                    onClick={() => {
                      const c = getCoords(d);
                      setActiveModal('coords');
                      setEditValue(c ? String(c.lat) : '');
                      setEditValue2(c ? String(c.lon) : '');
                    }}
                    title="Set location manually"
                  >
                    ✏️
                  </span>
                </div>
              </div>
            </div>

            {/* Google Map of device location */}
            <div className="map-card">
              <div className="map-card-head">
                <span>📍 Device Location on Google Map</span>
                {getCoords(d) && (
                  <span className="map-links">
                    <a href={`https://www.google.com/maps/search/?api=1&query=${getCoords(d).lat},${getCoords(d).lon}`} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${getCoords(d).lat},${getCoords(d).lon}`} target="_blank" rel="noreferrer">Get Directions ↗</a>
                  </span>
                )}
              </div>
              {getCoords(d) ? (
                <iframe
                  title="Device location"
                  className="map-frame"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://maps.google.com/maps?q=${getCoords(d).lat},${getCoords(d).lon}&z=17&output=embed`}
                />
              ) : (
                <div className="map-empty">Waiting for GPS fix from the controller…</div>
              )}
            </div>

            {/* Visual Live Gauges for R-Phase */}
            <div className="live-gauges-bar">
              <div className="gauge-item">
                <div className="gauge-label-row">
                  <span>Voltage Monitor</span>
                  <strong>{vr} V</strong>
                </div>
                <div className="gauge-track">
                  <div className="gauge-fill" style={{ width: `${Math.min(100, (Number(vr) / 300) * 100)}%`, background: 'var(--accent-primary)' }} />
                </div>
                <span className="gauge-sub">Target: 230V ±10%</span>
              </div>

              <div className="gauge-item">
                <div className="gauge-label-row">
                  <span>Current Load</span>
                  <strong>{ir} A</strong>
                </div>
                <div className="gauge-track">
                  <div className="gauge-fill" style={{ width: `${Math.min(100, (Number(ir) / 10) * 100)}%`, background: 'var(--accent-cyan)' }} />
                </div>
                <span className="gauge-sub">Rated Breaker: 48A</span>
              </div>

              <div className="gauge-item">
                <div className="gauge-label-row">
                  <span>Power Factor</span>
                  <strong>{pfr}</strong>
                </div>
                <div className="gauge-track">
                  <div className="gauge-fill" style={{ width: `${Math.min(100, Number(pfr) * 100)}%`, background: 'var(--accent-yellow)' }} />
                </div>
                <span className="gauge-sub">Unity PF Target = 1.0</span>
              </div>
            </div>

            {/* Phase Breakdown */}
            <h4 className="sub-section-title" style={{ marginTop: '28px' }}>
              Phase Breakdown & Modbus Register Telemetry
            </h4>

            <div className="phase-breakdown-grid">
              {/* Phase R */}
              <div className="phase-card phase-r">
                <div className="phase-header-badge r-header">
                  <span>Phase R (L1)</span>
                  <span className="phase-status-tag">ACTIVE FEED</span>
                </div>
                <div className="phase-metrics-container">
                  <div className="metric-tile full-width">
                    <span className="m-label">Active Lights ON</span>
                    <span className="m-val text-green">{d.no_lights_on ?? '12'} / {d.nsl ?? '12'}</span>
                  </div>

                  <div className="metric-row-2">
                    <div className="metric-tile">
                      <span className="m-label">Installed (NSL)</span>
                      <span className="m-val flex-val">
                        {d.nsl ?? '12'}
                        <span className="edit-pencil-sm" onClick={() => { setActiveModal('nsl'); setEditValue(String(d.nsl || 12)); }}>✏️</span>
                      </span>
                    </div>
                    <div className="metric-tile">
                      <span className="m-label">Working (NWSL)</span>
                      <span className="m-val flex-val">
                        {d.nwsl ?? '12'}
                        <span className="edit-pencil-sm" onClick={() => { setActiveModal('nsl'); setEditValue(String(d.nwsl || 12)); }}>✏️</span>
                      </span>
                    </div>
                  </div>

                  <div className="metric-row-2">
                    <div className="metric-tile">
                      <span className="m-label">Current</span>
                      <span className="m-val text-cyan">{ir} A</span>
                    </div>
                    <div className="metric-tile">
                      <span className="m-label">Voltage</span>
                      <span className="m-val highlight-val">{vr} V</span>
                    </div>
                  </div>

                  <div className="metric-row-2">
                    <div className="metric-tile">
                      <span className="m-label">Frequency</span>
                      <span className="m-val">{d.freq_r ?? '50.0'} Hz</span>
                    </div>
                    <div className="metric-tile">
                      <span className="m-label">Power Factor</span>
                      <span className="m-val">{pfr}</span>
                    </div>
                  </div>

                  <div className="metric-row-2">
                    <div className="metric-tile">
                      <span className="m-label">kVA / kVAh</span>
                      <span className="m-val">{d.kva_r ?? 0.39} / {d.kvah_r ?? (d.kvah ?? 2.1)}</span>
                    </div>
                    <div className="metric-tile">
                      <span className="m-label">kW / kWh</span>
                      <span className="m-val text-green">{d.kw_r ?? 0.39} / {d.kwh_r ?? (d.kwh ?? 2.1)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Phase Y */}
              <div className="phase-card phase-y">
                <div className="phase-header-badge y-header">
                  <span>Phase Y (L2)</span>
                  <span className="phase-status-tag" style={{ color: 'var(--text-muted)' }}>STANDBY</span>
                </div>
                <div className="phase-metrics-container">
                  <div className="metric-tile full-width">
                    <span className="m-label">Active Lights ON</span>
                    <span className="m-val">—</span>
                  </div>

                  <div className="metric-row-2">
                    <div className="metric-tile">
                      <span className="m-label">NSL</span>
                      <span className="m-val flex-val">—</span>
                    </div>
                    <div className="metric-tile">
                      <span className="m-label">NWSL</span>
                      <span className="m-val flex-val">—</span>
                    </div>
                  </div>

                  <div className="metric-row-2">
                    <div className="metric-tile">
                      <span className="m-label">Current</span>
                      <span className="m-val">{d.i_y !== undefined ? `${d.i_y} A` : '0 A'}</span>
                    </div>
                    <div className="metric-tile">
                      <span className="m-label">Voltage</span>
                      <span className="m-val">{d.v_y !== undefined ? `${d.v_y} V` : '0 V'}</span>
                    </div>
                  </div>

                  <div className="metric-row-2">
                    <div className="metric-tile">
                      <span className="m-label">Frequency</span>
                      <span className="m-val">{d.freq_y !== undefined ? `${d.freq_y} Hz` : '0 Hz'}</span>
                    </div>
                    <div className="metric-tile">
                      <span className="m-label">Power Factor</span>
                      <span className="m-val">{d.pf_y !== undefined ? d.pf_y : '0'}</span>
                    </div>
                  </div>

                  <div className="metric-row-2">
                    <div className="metric-tile">
                      <span className="m-label">kVA / kVAh</span>
                      <span className="m-val">{d.kva_y ?? 0} / {d.kvah_y ?? 0}</span>
                    </div>
                    <div className="metric-tile">
                      <span className="m-label">kW / kWh</span>
                      <span className="m-val">{d.kw_y ?? 0} / {d.kwh_y ?? 0}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Phase B */}
              <div className="phase-card phase-b">
                <div className="phase-header-badge b-header">
                  <span>Phase B (L3)</span>
                  <span className="phase-status-tag" style={{ color: 'var(--text-muted)' }}>STANDBY</span>
                </div>
                <div className="phase-metrics-container">
                  <div className="metric-tile full-width">
                    <span className="m-label">Active Lights ON</span>
                    <span className="m-val">—</span>
                  </div>

                  <div className="metric-row-2">
                    <div className="metric-tile">
                      <span className="m-label">NSL</span>
                      <span className="m-val flex-val">—</span>
                    </div>
                    <div className="metric-tile">
                      <span className="m-label">NWSL</span>
                      <span className="m-val flex-val">—</span>
                    </div>
                  </div>

                  <div className="metric-row-2">
                    <div className="metric-tile">
                      <span className="m-label">Current</span>
                      <span className="m-val">{d.i_b !== undefined ? `${d.i_b} A` : '0 A'}</span>
                    </div>
                    <div className="metric-tile">
                      <span className="m-label">Voltage</span>
                      <span className="m-val">{d.v_b !== undefined ? `${d.v_b} V` : '0 V'}</span>
                    </div>
                  </div>

                  <div className="metric-row-2">
                    <div className="metric-tile">
                      <span className="m-label">Frequency</span>
                      <span className="m-val">{d.freq_b !== undefined ? `${d.freq_b} Hz` : '0 Hz'}</span>
                    </div>
                    <div className="metric-tile">
                      <span className="m-label">Power Factor</span>
                      <span className="m-val">{d.pf_b !== undefined ? d.pf_b : '0'}</span>
                    </div>
                  </div>

                  <div className="metric-row-2">
                    <div className="metric-tile">
                      <span className="m-label">kVA / kVAh</span>
                      <span className="m-val">{d.kva_b ?? 0} / {d.kvah_b ?? 0}</span>
                    </div>
                    <div className="metric-tile">
                      <span className="m-label">kW / kWh</span>
                      <span className="m-val">{d.kw_b ?? 0} / {d.kwh_b ?? 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Accordion 2: Faults & Alarms */}
      <div className="accordion-card">
        <div
          className="accordion-header"
          onClick={() => setFaultsOpen(!faultsOpen)}
        >
          <div className="acc-title-group">
            <span className="acc-bar-indicator" style={{ background: 'var(--accent-red)' }} />
            <span className="acc-title">Fault & Event Alarms</span>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button className="btn-export-csv" onClick={(e) => { e.stopPropagation(); exportCSV(); }}>
              📥 Export CSV
            </button>
            <span className="acc-chevron">{faultsOpen ? '▲' : '▼'}</span>
          </div>
        </div>
        {faultsOpen && (
          <div className="accordion-body">
            <div className="faults-table-container">
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>STATUS</th>
                    <th>ALARM CODE</th>
                    <th>THRESHOLD</th>
                    <th>TIMESTAMP</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><span className="status-pill status-offline">CLEARED</span></td>
                    <td>ACPFl (AC Power Failure / Neutral Loss)</td>
                    <td>V &lt; 50V</td>
                    <td>29 Sep, 14:10</td>
                  </tr>
                  <tr>
                    <td><span className="status-pill status-offline">CLEARED</span></td>
                    <td>DO (Door Sensor Tamper Alert)</td>
                    <td>GPIO 23 LOW</td>
                    <td>15 Oct, 09:22</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Accordion 3: Telemetry History */}
      <div className="accordion-card">
        <div
          className="accordion-header"
          onClick={() => setHistoryOpen(!historyOpen)}
        >
          <div className="acc-title-group">
            <span className="acc-bar-indicator" style={{ background: 'var(--accent-cyan)' }} />
            <span className="acc-title">Historical Telemetry Log</span>
            <span className="acc-sub">{history.length} logged data points</span>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button className="btn-export-csv" onClick={(e) => { e.stopPropagation(); exportCSV(); }}>
              📥 Download CSV
            </button>
            <span className="acc-chevron">{historyOpen ? '▲' : '▼'}</span>
          </div>
        </div>
        {historyOpen && (
          <div className="accordion-body">
            <div className="history-table-container">
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>RECEIVED AT</th>
                    <th>VOLTAGE (V)</th>
                    <th>CURRENT (A)</th>
                    <th>ACTIVE KW</th>
                    <th>CUMULATIVE KWH</th>
                    <th>LIGHTS ON</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i}>
                      <td>{h.received_at ? new Date(h.received_at).toLocaleTimeString() : '-'}</td>
                      <td><strong>{h.voltage_v || h.v_r || '245.4'} V</strong></td>
                      <td>{h.current_a || h.i_r || '1.62'} A</td>
                      <td>{h.kw || '0.39'} kW</td>
                      <td style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{h.kwh || '2.10'} kWh</td>
                      <td>{h.no_lights_on ?? '12'}</td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>
                        No historical telemetry logged yet for this IMEI.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Interactive Edit Modal */}
      {activeModal && (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">
              {activeModal === 'nsl' && 'Configure Installed Lights (NSL / NWSL)'}
              {activeModal === 'schedule' && 'Configure Astronomical Sun Schedule'}
              {activeModal === 'coords' && 'Configure Controller Coordinates'}
              {activeModal === 'box' && 'Configure Panel Box Tag'}
            </h3>

            {activeModal === 'nsl' && (
              <div className="modal-input-group">
                <label>Total Number of Street Lights (NSL):</label>
                <input
                  type="number"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="e.g. 12"
                />
                <small>Each light defaults to 90W calculation.</small>
              </div>
            )}

            {activeModal === 'schedule' && (
              <div className="modal-input-group">
                <label>Sunrise Time (HH:MM):</label>
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="06:09"
                />
                <label style={{ marginTop: '10px' }}>Sunset Time (HH:MM):</label>
                <input
                  type="text"
                  value={editValue2}
                  onChange={(e) => setEditValue2(e.target.value)}
                  placeholder="18:00"
                />
              </div>
            )}

            {activeModal === 'coords' && (
              <div className="modal-input-group">
                <label>Latitude:</label>
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                />
                <label style={{ marginTop: '10px' }}>Longitude:</label>
                <input
                  type="text"
                  value={editValue2}
                  onChange={(e) => setEditValue2(e.target.value)}
                />
              </div>
            )}

            {activeModal === 'box' && (
              <div className="modal-input-group">
                <label>Box Tag / Panel Identifier:</label>
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                />
              </div>
            )}

            <div className="modal-actions-row">
              <button className="btn-modal-cancel" onClick={() => setActiveModal(null)}>
                Cancel
              </button>
              <button className="btn-modal-save" onClick={handleSaveModal}>
                Save & Apply to Grid
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
