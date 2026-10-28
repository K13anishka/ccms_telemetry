import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchStats, fetchKits, fetchMeterData, addKit } from '../api.js';
import { formatCoords, mapLink } from '../location.js';
import './Dashboard.css';

const EMPTY_KIT_FORM = {
  kit_id: '',
  imei: '',
  router_name: '',
  name: '',
  api_key: '',
};

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(ta);
  }
  return Promise.resolve();
}

function formatSeen(ts) {
  if (!ts) return 'Waiting for first telemetry';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Dashboard({ onToast }) {
  const [kits, setKits] = useState([]);
  const [stats, setStats] = useState({
    total_devices: 0,
    online_devices: 0,
    total_kwh: 0,
    active_faults: 0,
  });
  const [refreshTime, setRefreshTime] = useState(
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );

  // Add Kit Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [kitForm, setKitForm] = useState(EMPTY_KIT_FORM);
  const [savingKit, setSavingKit] = useState(false);
  const [kitFormError, setKitFormError] = useState('');
  const [credsModal, setCredsModal] = useState(null);

  const toast = useCallback(
    (msg, icon) => {
      if (onToast) onToast(msg, icon);
    },
    [onToast]
  );

  const loadData = useCallback(
    async (manual = false) => {
      try {
        let kitData = [];
        try {
          kitData = await fetchKits();
        } catch (_) {
          kitData = await fetchMeterData();
        }

        const validKits = Array.isArray(kitData) ? kitData : [];
        setKits(validKits);

        try {
          const s = await fetchStats();
          if (s) {
            setStats({
              total_devices: validKits.length || s.total_devices || 0,
              online_devices: validKits.filter((k) => k.online).length,
              total_kwh:
                validKits.reduce(
                  (acc, k) =>
                    acc + (Number(k.kwh || k.energy || (k.meter_readings && k.meter_readings.energy)) || 0),
                  0
                ) || s.total_kwh || 0,
              active_faults: s.active_faults || 0,
            });
          }
        } catch (_) {}

        setRefreshTime(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
        if (manual) toast('Dashboard refreshed from database', '⚡');
      } catch (err) {
        console.warn('Dashboard fetch error:', err.message);
      }
    },
    [toast]
  );

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(false), 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleField = (key) => (e) => {
    let val = e.target.value;
    if (key === 'imei') val = val.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
    setKitForm((prev) => ({ ...prev, [key]: val }));
  };

  const openAddKit = () => {
    setKitForm(EMPTY_KIT_FORM);
    setKitFormError('');
    setShowAddModal(true);
  };

  const handleAddKitSubmit = async (e) => {
    e.preventDefault();
    if (!kitForm.imei.trim()) {
      setKitFormError('IMEI is required.');
      return;
    }
    if (!kitForm.kit_id.trim()) {
      setKitFormError('Kit Name / ID is required (e.g. KIT_001).');
      return;
    }

    setSavingKit(true);
    setKitFormError('');

    try {
      const created = await addKit({
        kit_id: kitForm.kit_id.trim(),
        imei: kitForm.imei.trim(),
        router_name: kitForm.router_name.trim(),
        name: (kitForm.name || kitForm.kit_id).trim(),
        api_key: kitForm.api_key.trim(),
      });

      setShowAddModal(false);
      setCredsModal(created);
      toast(`Kit ${created.kit_id || created.imei} successfully registered!`, '✅');
      loadData(false);
    } catch (err) {
      setKitFormError(err.message || 'Failed to register kit.');
    } finally {
      setSavingKit(false);
    }
  };

  const copyCred = (val) => {
    copyText(val)
      .then(() => toast('Copied to clipboard', '📋'))
      .catch(() => {});
  };

  const onlineKitsCount = kits.filter((k) => k.online).length;
  const offlineKitsCount = kits.length - onlineKitsCount;
  const availabilityPct =
    kits.length > 0 ? Math.round((onlineKitsCount / kits.length) * 100) : 100;

  return (
    <div className="dashboard-page">
      {/* Top Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dash-title">CCMS Telemetry & Feeder Control</h1>
          <p className="dash-sub">
            Real-time monitoring across {kits.length} connected street-light kits
          </p>
        </div>
        <div className="dashboard-header-actions">
          <button className="btn-add-kit" onClick={openAddKit}>
            <span>+</span> Add Kit
          </button>
          <button className="btn-refresh" onClick={() => loadData(true)}>
            <span>↻</span> Refreshed {refreshTime}
          </button>
        </div>
      </div>

      {/* Live data connection */}
      <div className="live-strip">
        <div className="live-strip-left">
          <span className="live-dot" />
          <span><strong>LIVE</strong> · Dashboard polls AWS every 5 seconds</span>
        </div>
        <span>Last dashboard refresh: <strong>{refreshTime}</strong></span>
      </div>

      {/* Aggregate Stats Cards */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="card-top">
            <span className="stat-label">TOTAL KITS</span>
            <div className="stat-icon-wrapper blue">🎛️</div>
          </div>
          <div className="stat-number">{kits.length}</div>
          <div className="stat-sub-text">
            <span className="text-green font-bold">● {onlineKitsCount} Online</span>
            &nbsp;|&nbsp; {offlineKitsCount} Offline
          </div>
        </div>

        <div className="stat-card">
          <div className="card-top">
            <span className="stat-label">AVAILABILITY</span>
            <div className="stat-icon-wrapper green">⚡</div>
          </div>
          <div className="stat-number text-green">{availabilityPct}%</div>
          <div className="stat-sub-text">Active Telemetry Sync Ratio</div>
        </div>

        <div className="stat-card">
          <div className="card-top">
            <span className="stat-label">TOTAL ENERGY</span>
            <div className="stat-icon-wrapper yellow">📊</div>
          </div>
          <div className="stat-number">
            {Number(stats.total_kwh || 0).toFixed(2)}{' '}
            <span className="stat-unit">kWh</span>
          </div>
          <div className="stat-sub-text">Cumulative Feeder Meter Readings</div>
        </div>

        <div className="stat-card">
          <div className="card-top">
            <span className="stat-label">ACTIVE FAULTS</span>
            <div className="stat-icon-wrapper green">🚨</div>
          </div>
          <div
            className={`stat-number ${
              stats.active_faults > 0 ? 'text-red' : 'text-green'
            }`}
          >
            {stats.active_faults}
          </div>
          <div className="stat-sub-text">Alarms & Outages (Last 24h)</div>
        </div>
      </div>

      {/* Multi-Kit Overview Section */}
      <div className="kits-section">
        <div className="kits-section-header">
          <div className="kits-section-title">
            Registered Kits & Live Meter Telemetry
          </div>
          <span className="kits-count-badge">{kits.length} Active Profiles</span>
        </div>

        {kits.length === 0 ? (
          <div className="empty-kits-box">
            <div className="empty-kits-icon">📡</div>
            <div className="empty-kits-text">No Kits Registered Yet</div>
            <p className="empty-kits-sub">
              Click &quot;+ Add Kit&quot; above to register your first ESP32 hardware
              kit with its IMEI and Wi-Fi router.
            </p>
            <button className="btn-add-kit" onClick={openAddKit}>
              + Add First Kit
            </button>
          </div>
        ) : (
          <div className="kits-grid">
            {kits.map((kit) => {
              const kitId =
                kit.kit_id || kit.name || `KIT_${String(kit.imei || kit.device_id).slice(-4)}`;
              const imei = kit.imei || kit.device_id || '—';
              const routerName = kit.router_name || kit.router_id || 'Not Set';

              const voltage =
                kit.voltage !== null && kit.voltage !== undefined
                  ? kit.voltage
                  : kit.v_r || kit.voltage_v || '—';
              const current =
                kit.current !== null && kit.current !== undefined
                  ? kit.current
                  : kit.i_r || kit.current_a || '—';
              const power =
                kit.power !== null && kit.power !== undefined
                  ? kit.power
                  : kit.kw !== undefined
                  ? Number((kit.kw * 1000).toFixed(1))
                  : '—';
              const energy =
                kit.energy !== null && kit.energy !== undefined
                  ? kit.energy
                  : kit.kwh !== undefined
                  ? kit.kwh
                  : '—';
              const relayOn =
                kit.relay !== null && kit.relay !== undefined
                  ? kit.relay === 1 || kit.relay === true
                  : kit.on_off === 1;

              const isOnline = Boolean(kit.online);
              const statusClass = isOnline
                ? 'online'
                : kit.last_seen
                ? 'offline'
                : 'waiting';
              const statusLabel = isOnline
                ? 'ONLINE'
                : kit.last_seen
                ? 'OFFLINE'
                : 'WAITING';

              const lat = kit.latitude !== undefined ? kit.latitude : (kit.gps && kit.gps.latitude);
              const lon = kit.longitude !== undefined ? kit.longitude : (kit.gps && kit.gps.longitude);
              const hasGps = lat !== null && lon !== null && lat !== undefined && lon !== undefined;
              const gUrl = hasGps ? mapLink({ latitude: lat, longitude: lon }) : null;

              return (
                <div className="kit-card" key={imei}>
                  {/* Card Header: Kit ID & Online/Offline status */}
                  <div className="kit-card-header">
                    <div className="kit-title-group">
                      <span className="kit-id-tag">{kitId}</span>
                      <span className="kit-name-sub">
                        {kit.name && kit.name !== kitId ? kit.name : 'CCMS Street Light Controller'}
                      </span>
                    </div>
                    <span className={`kit-status-badge ${statusClass}`}>
                      <span className="status-dot" />
                      {statusLabel}
                    </span>
                  </div>

                  {/* Identifiers: IMEI and Router Name */}
                  <div className="kit-identifiers">
                    <div className="kit-id-row">
                      <span className="id-label">IMEI:</span>
                      <span className="id-value">{imei}</span>
                    </div>
                    <div className="kit-id-row">
                      <span className="id-label">Router:</span>
                      <span className="id-value">{routerName}</span>
                    </div>
                  </div>

                  {/* Meter Readings Grid */}
                  <div className="kit-metrics-grid">
                    <div className="kit-metric-cell">
                      <span className="metric-cell-label">VOLTAGE</span>
                      <span className="metric-cell-value">
                        {voltage}
                        {voltage !== '—' && <span className="metric-cell-unit">V</span>}
                      </span>
                    </div>

                    <div className="kit-metric-cell">
                      <span className="metric-cell-label">CURRENT</span>
                      <span className="metric-cell-value">
                        {current}
                        {current !== '—' && <span className="metric-cell-unit">A</span>}
                      </span>
                    </div>

                    <div className="kit-metric-cell">
                      <span className="metric-cell-label">POWER</span>
                      <span className="metric-cell-value">
                        {power}
                        {power !== '—' && <span className="metric-cell-unit">W</span>}
                      </span>
                    </div>

                    <div className="kit-metric-cell">
                      <span className="metric-cell-label">ENERGY</span>
                      <span className="metric-cell-value">
                        {energy !== '—' ? Number(energy).toFixed(1) : '—'}
                        {energy !== '—' && <span className="metric-cell-unit">kWh</span>}
                      </span>
                    </div>

                    <div className="kit-metric-cell">
                      <span className="metric-cell-label">FREQUENCY</span>
                      <span className="metric-cell-value">
                        {kit.freq || '50.0'}
                        <span className="metric-cell-unit">Hz</span>
                      </span>
                    </div>

                    <div className="kit-metric-cell">
                      <span className="metric-cell-label">RELAY</span>
                      <span
                        className={`metric-cell-value ${
                          relayOn ? 'text-green' : 'text-red'
                        }`}
                        style={{ fontSize: '0.9rem' }}
                      >
                        {relayOn ? 'ON ⚡' : 'OFF ◯'}
                      </span>
                    </div>
                  </div>

                  {/* Live GPS + last-seen */}
                  <div className="kit-location">
                    <div className="location-main">
                      <span className="location-label">ESP32 GPS LOCATION</span>
                      <span className="location-value">
                        {hasGps ? formatCoords({ latitude: lat, longitude: lon }) : 'Waiting for GPS fix…'}
                      </span>
                    </div>
                    <span className="location-source">
                      {hasGps ? (kit.gps_fix_valid === false ? 'LAST KNOWN' : 'LIVE GPS') : 'NO FIX'}
                    </span>
                  </div>

                  <div className="kit-footer-info">
                    <div className="footer-info-row">
                      <span>Router</span>
                      <span>{routerName}</span>
                    </div>
                    <div className="footer-info-row">
                      <span>Last ESP32 telemetry</span>
                      <span>{formatSeen(kit.last_seen || kit.received_at)}</span>
                    </div>
                    {hasGps && (
                      <div className="footer-info-row">
                        <span>Map</span>
                        <a href={gUrl} target="_blank" rel="noopener noreferrer">Open location ↗</a>
                      </div>
                    )}
                  </div>

                  <Link to={`/device/${imei}`} className="btn-view-kit">
                    Open Controller Panel & Controls →
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Add Kit */}
      {showAddModal && (
        <div
          className="modal-backdrop"
          onClick={() => !savingKit && setShowAddModal(false)}
        >
          <form
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleAddKitSubmit}
          >
            <h2>Add New CCMS Kit</h2>
            <p className="modal-sub">
              Register a unique hardware kit (single-phase meter + Modbus + GPS + ESP32 + Router).
            </p>

            <label>
              Kit Name / ID <span className="req">*</span>
              <input
                value={kitForm.kit_id}
                onChange={handleField('kit_id')}
                placeholder="e.g. KIT_001"
                required
                autoFocus
              />
              <small>Human-friendly identifier for this kit</small>
            </label>

            <label>
              IMEI <span className="req">*</span>
              <input
                value={kitForm.imei}
                onChange={handleField('imei')}
                placeholder="e.g. 123456789 or 15-digit IMEI"
                required
              />
              <small>Unique hardware identifier for the ESP32 / GSM module</small>
            </label>

            <label>
              Wi-Fi Router Name
              <input
                value={kitForm.router_name}
                onChange={handleField('router_name')}
                placeholder="e.g. CCMS_ROUTER_001"
              />
              <small>The Wi-Fi router/gateway label this kit communicates through</small>
            </label>

            <label>
              API Key (Optional)
              <input
                value={kitForm.api_key}
                onChange={handleField('api_key')}
                placeholder="Leave blank to auto-generate secure key"
              />
            </label>

            {kitFormError && <div className="form-error">{kitFormError}</div>}

            <div className="modal-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setShowAddModal(false)}
                disabled={savingKit}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-submit-modal"
                disabled={savingKit}
              >
                {savingKit ? 'Registering...' : 'Register Kit'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Flashing Firmware Credentials */}
      {credsModal && (
        <div className="modal-backdrop" onClick={() => setCredsModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Kit Registered Successfully!</h2>
            <p className="modal-sub">
              Configure these parameters into the ESP32 firmware for this kit:
            </p>

            <div className="cred-row">
              <span className="cred-label">KIT ID:</span>
              <code className="cred-value">{credsModal.kit_id}</code>
              <button
                type="button"
                className="btn-copy"
                onClick={() => copyCred(credsModal.kit_id)}
              >
                Copy
              </button>
            </div>

            <div className="cred-row">
              <span className="cred-label">IMEI:</span>
              <code className="cred-value">{credsModal.imei || credsModal.device_id}</code>
              <button
                type="button"
                className="btn-copy"
                onClick={() => copyCred(credsModal.imei || credsModal.device_id)}
              >
                Copy
              </button>
            </div>

            <div className="cred-row">
              <span className="cred-label">Router Name:</span>
              <code className="cred-value">{credsModal.router_name || credsModal.router_id || '—'}</code>
              <button
                type="button"
                className="btn-copy"
                onClick={() => copyCred(credsModal.router_name || credsModal.router_id || '')}
              >
                Copy
              </button>
            </div>

            <div className="cred-row">
              <span className="cred-label">API Key (x-api-key):</span>
              <code className="cred-value">{credsModal.api_key}</code>
              <button
                type="button"
                className="btn-copy"
                onClick={() => copyCred(credsModal.api_key)}
              >
                Copy
              </button>
            </div>

            <div className="cred-row">
              <span className="cred-label">AWS Server URL:</span>
              <code className="cred-value">{window.location.origin}/api/v1/save</code>
              <button
                type="button"
                className="btn-copy"
                onClick={() => copyCred(`${window.location.origin}/api/v1/save`)}
              >
                Copy
              </button>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-submit-modal"
                onClick={() => setCredsModal(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
