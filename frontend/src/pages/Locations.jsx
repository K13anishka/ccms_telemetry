import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchDevices } from '../api.js';
import { getCoords, formatCoords, mapLink, sourceLabel } from '../location.js';

export default function Locations() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchDevices();
        setDevices(Array.isArray(data) ? data : []);
      } catch (err) {
        console.warn('Locations error:', err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Locations</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          GPS location of every controller, reported by its ESP32
        </p>
      </div>

      {!loading && devices.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No devices registered yet.</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
        {devices.map((dev) => (
          <div
            key={dev.device_id}
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.5rem' }}>📍</span>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{dev.name || dev.device_id}</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>IMEI {dev.device_id}</span>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '10px 14px',
                backgroundColor: 'var(--bg-card-sub)',
                borderRadius: '8px',
                fontSize: '0.85rem',
              }}
            >
              <span>
                {getCoords(dev) ? 'Coordinates' : 'Location'}: <strong>{formatCoords(dev)}</strong>
                {sourceLabel(dev) && <span style={{ color: 'var(--text-muted)' }}> ({sourceLabel(dev)})</span>}
              </span>
              {dev.sun_set_time && (
                <span>
                  Lights ON at sunset <strong>{dev.sun_set_time}</strong> · OFF at sunrise <strong>{dev.sun_rise_time}</strong>
                </span>
              )}
              <span style={{ color: dev.online ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                {dev.online ? 'Online' : 'Offline'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '16px' }}>
              <Link
                to={`/device/${dev.device_id}`}
                style={{ color: 'var(--accent-cyan)', fontSize: '0.85rem', textDecoration: 'none', fontWeight: 600 }}
              >
                Open panel →
              </Link>
              {getCoords(dev) && (
                <a
                  href={mapLink(dev)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--accent-cyan)', fontSize: '0.85rem', textDecoration: 'none', fontWeight: 600 }}
                >
                  View on map ↗
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
