import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchDevices, sendCommand, addDevice, deleteDevice, fetchDeviceConfig } from '../api.js';
import { formatCoords, mapLink, getCoords } from '../location.js';
import './Devices.css';

const EMPTY_FORM = { device_id: '', name: '', router_id: '', api_key: '' };

function copyText(text) {
  // navigator.clipboard only works on https; fall back for plain-http servers
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
  return Promise.resolve();
}

function formatSeen(ts) {
  if (!ts) return 'No data yet';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts) : d.toLocaleString();
}

export default function Devices({ onToast, isAdmin }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [creds, setCreds] = useState(null); // credentials panel after add / "Config"

  const toast = useCallback((msg, icon) => { if (onToast) onToast(msg, icon); }, [onToast]);

  const load = useCallback(async () => {
    try {
      const data = await fetchDevices();
      setDevices(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Devices error:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // keep Online / Offline fresh
    return () => clearInterval(t);
  }, [load]);

  const onlineCount = devices.filter((d) => d.online).length;

  const setField = (k) => (e) => {
    let v = e.target.value;
    if (k === 'device_id') v = v.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
    setForm((f) => ({ ...f, [k]: v }));
  };

  const openForm = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setShowForm(true);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.device_id || form.device_id.trim().length < 3) {
      setFormError('IMEI must be at least 3 characters.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const created = await addDevice({
        device_id: form.device_id.trim(),
        name: form.name.trim(),
        router_id: form.router_id.trim(),
        api_key: form.api_key.trim(),
      });
      setShowForm(false);
      setCreds(created);
      toast(`Kit / Device ${created.device_id} added`, '✅');
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const showConfig = async (id) => {
    try {
      setCreds(await fetchDeviceConfig(id));
    } catch (err) {
      toast(`Could not load config: ${err.message}`, '⚠️');
    }
  };

  const handleDelete = async (d) => {
    const ok = window.confirm(
      `Delete ${d.name || d.device_id} (${d.device_id})?\n\nAll its stored readings, events and commands are removed too. This cannot be undone.`
    );
    if (!ok) return;
    try {
      await deleteDevice(d.device_id);
      toast(`Device ${d.device_id} deleted`, '🗑️');
      load();
    } catch (err) {
      toast(`Delete failed: ${err.message}`, '⚠️');
    }
  };

  const handleSync = async (id) => {
    setSyncingId(id);
    try {
      await sendCommand(id, { cmd: 'report' });
      toast(`Sync command sent to ${id}`, '🔄');
    } catch (err) {
      toast(`Sync failed: ${err.message}`, '⚠️');
    } finally {
      setTimeout(() => setSyncingId(null), 1200);
    }
  };

  const copy = (text) => copyText(text).then(() => toast('Copied', '📋')).catch(() => {});

  return (
    <div className="devices-view-page">
      <div className="devices-view-header devices-header-row">
        <div>
          <h1 className="devices-view-title">Controller Registry</h1>
          <p className="devices-view-sub">
            CCMS street-light controllers registered by IMEI ({devices.length} configured)
          </p>
        </div>
        {isAdmin && (
          <button className="btn-add-device" onClick={openForm}>
            + Add Device
          </button>
        )}
      </div>

      <div className="summary-pill-bar">
        <div className="pill-item">
          <strong>{devices.length}</strong> Total {devices.length === 1 ? 'Device' : 'Devices'}
        </div>
        <div className="pill-divider" />
        <div className="pill-item text-green">
          <span className="dot dot-green" />
          <strong>{onlineCount}</strong> Online
        </div>
        <div className="pill-divider" />
        <div className="pill-item text-muted">
          <span className="dot dot-muted" />
          <strong>{devices.length - onlineCount}</strong> Offline
        </div>
      </div>

      <div className="portal-table-card">
        <table className="portal-table">
          <thead>
            <tr>
              <th>IMEI</th>
              <th>NAME & LOCATION</th>
              <th>WI-FI ROUTER</th>
              <th>VOLTAGE & CURRENT</th>
              <th>LAST TELEMETRY</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {devices.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-row">
                  {loading ? 'Loading…' : 'No devices yet. ' + (isAdmin ? 'Click “+ Add Device” to register one.' : 'Ask an administrator to add one.')}
                </td>
              </tr>
            )}
            {devices.map((d) => {
              const volts = d.v_r ?? d.voltage_v;
              const amps = d.i_r ?? d.current_a;
              return (
                <tr key={d.device_id}>
                  <td>
                    <Link to={`/device/${d.device_id}`} className="imei-link">
                      <code>{d.device_id}</code>
                    </Link>
                  </td>
                  <td>
                    <strong>{d.name || '—'}</strong>
                    <div className="location-cell">
                      📍 {formatCoords(d)}
                      {getCoords(d) && (
                        <>
                          {' '}
                          <a href={mapLink(d)} target="_blank" rel="noreferrer" title="Open in map">map ↗</a>
                        </>
                      )}
                    </div>
                  </td>
                  <td>{d.router_id ? <span className="router-chip">📶 {d.router_id}</span> : <span className="text-muted">—</span>}</td>
                  <td>
                    {volts !== undefined && volts !== null ? (
                      <>
                        <strong>{volts} V</strong> &nbsp;|&nbsp; {amps ?? '—'} A
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="time-cell">{formatSeen(d.last_seen)}</td>
                  <td>
                    {d.online ? (
                      <span className="status-pill status-online">
                        <span className="status-dot-sm" />
                        Online
                      </span>
                    ) : (
                      <span className="status-pill status-offline">
                        <span className="status-dot-sm" />
                        {d.last_seen ? 'Offline' : 'Waiting'}
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link to={`/device/${d.device_id}`} className="btn-action-view">
                        Open Panel →
                      </Link>
                      {isAdmin && (
                        <>
                          <button
                            className="btn-action-sync"
                            onClick={() => handleSync(d.device_id)}
                            disabled={syncingId === d.device_id}
                          >
                            {syncingId === d.device_id ? 'Syncing…' : 'Sync'}
                          </button>
                          <button className="btn-action-sync" onClick={() => showConfig(d.device_id)}>
                            Config
                          </button>
                          <button className="btn-action-delete" onClick={() => handleDelete(d)}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Add device ── */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleAdd}>
            <h2>Add CCMS device</h2>
            <p className="modal-sub">Register a controller before you flash it. It shows “Waiting” until its first reading arrives.</p>

            <label>
              IMEI <span className="req">*</span>
              <input
                value={form.device_id}
                onChange={setField('device_id')}
                inputMode="numeric"
                placeholder="15-digit IMEI"
                autoFocus
              />
              <small>{form.device_id.length}/15 digits</small>
            </label>

            <label>
              Device name
              <input value={form.name} onChange={setField('name')} placeholder="e.g. CMS-6237 (Feeder 1)" maxLength={80} />
            </label>

            <label>
              Wi-Fi router (name / ID)
              <input value={form.router_id} onChange={setField('router_id')} placeholder="e.g. Site-A-Router" maxLength={64} />
              <small>A label for the router this unit connects through. The Wi-Fi password is set in the firmware only and is never stored here.</small>
            </label>

            <label>
              API key
              <input value={form.api_key} onChange={setField('api_key')} placeholder="Leave empty to auto-generate" maxLength={64} />
            </label>

            {formError && <div className="form-error">{formError}</div>}

            <div className="modal-actions">
              <button type="button" className="btn-action-sync" onClick={() => setShowForm(false)} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn-add-device" disabled={saving}>
                {saving ? 'Adding…' : 'Add device'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Credentials to flash ── */}
      {creds && (
        <div className="modal-backdrop" onClick={() => setCreds(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Firmware settings</h2>
            <p className="modal-sub">Put these in the ESP32 firmware for this unit.</p>
            {[
              ['IMEI (DEVICE_ID)', creds.device_id],
              ['API key (x-api-key)', creds.api_key],
              ['Server URL', `${window.location.origin}/api/v1/save`],
              ['Router label', creds.router_id || '—'],
            ].map(([label, value]) => (
              <div className="cred-row" key={label}>
                <span className="cred-label">{label}</span>
                <code className="cred-value">{value}</code>
                {value !== '—' && (
                  <button type="button" className="btn-action-sync" onClick={() => copy(value)}>
                    Copy
                  </button>
                )}
              </div>
            ))}
            <div className="modal-actions">
              <button type="button" className="btn-add-device" onClick={() => setCreds(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
