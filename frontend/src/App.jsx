import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Devices from './pages/Devices.jsx';
import DeviceDetail from './pages/DeviceDetail.jsx';
import Events from './pages/Events.jsx';
import Locations from './pages/Locations.jsx';
import Login from './pages/Login.jsx';
import { getToken, setToken, clearToken, fetchMe } from './api.js';
import './App.css';

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('user');
  const [checking, setChecking] = useState(() => !!getToken());
  const [toast, setToast] = useState(null);

  // restore the session from the stored token; drop it if the server rejects it
  useEffect(() => {
    if (!getToken()) return;
    fetchMe()
      .then((me) => { setUser(me.username); setRole(me.role); })
      .catch(() => clearToken())
      .finally(() => setChecking(false));
  }, []);

  // any API call that comes back 401 logs the user out
  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('ccms-logout', onLogout);
    return () => window.removeEventListener('ccms-logout', onLogout);
  }, []);

  const handleLogin = (session, isNew = false) => {
    setToken(session.token);
    setUser(session.username);
    setRole(session.role);
    showToast(isNew ? `Account created. Welcome, ${session.username}!` : `Welcome back, ${session.username}!`, '👋');
  };

  const handleLogout = () => {
    clearToken();
    setUser(null);
  };

  const showToast = (msg, icon = '⚡') => {
    setToast({ msg, icon });
    setTimeout(() => setToast(null), 3200);
  };

  if (checking) return null;

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <BrowserRouter>
      <div className="app-container">
        {/* Left White Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-logo" title="CCMS Energy Control">
            <span>⚡</span>
          </div>

          <nav className="sidebar-nav">
            <NavLink
              to="/"
              className={({ isActive }) =>
                isActive ? 'sidebar-item active' : 'sidebar-item'
              }
              title="Dashboard Overview"
            >
              <span className="sidebar-icon">📊</span>
            </NavLink>

            <NavLink
              to="/devices"
              className={({ isActive }) =>
                isActive ? 'sidebar-item active' : 'sidebar-item'
              }
              title="Devices Management"
            >
              <span className="sidebar-icon">🎛️</span>
            </NavLink>

            <NavLink
              to="/locations"
              className={({ isActive }) =>
                isActive ? 'sidebar-item active' : 'sidebar-item'
              }
              title="Locations & Feeders"
            >
              <span className="sidebar-icon">🗺️</span>
            </NavLink>

            <NavLink
              to="/events"
              className={({ isActive }) =>
                isActive ? 'sidebar-item active' : 'sidebar-item'
              }
              title="Faults & Alarms"
            >
              <span className="sidebar-icon">🚨</span>
            </NavLink>
          </nav>

          <div className="sidebar-footer">
            <div className="user-avatar-small" title={role === 'admin' ? 'Administrator' : 'Viewer'}>
              {user.slice(0, 2).toUpperCase()}
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="main-wrapper">
          {/* Top Header */}
          <header className="top-header">
            <div className="brand-text">
              <span className="brand-title">CCMS Energy Platform</span>
              <span className="brand-sub">Centralized Street-Light Feeder Management</span>
            </div>

            <div className="header-actions">
              <div className="live-indicator-pill">
                <span className="live-pulse-dot" />
                Live Cloud Sync
              </div>

              <div className="user-badge">
                <div className="user-avatar-small">{user.slice(0, 2).toUpperCase()}</div>
                <div className="user-info">
                  <span className="user-name">{user}</span>
                  <span className="user-role">{role === 'admin' ? 'Administrator' : 'Viewer'}</span>
                </div>
              </div>

              <button className="btn-signout" onClick={handleLogout} title="Sign out of console">
                Sign Out
              </button>
            </div>
          </header>

          {/* Page View */}
          <main className="page-container">
            <Routes>
              <Route path="/" element={<Dashboard onToast={showToast} />} />
              <Route path="/devices" element={<Devices onToast={showToast} isAdmin={role === 'admin'} />} />
              <Route path="/device/:id" element={<DeviceDetail onToast={showToast} />} />
              <Route path="/locations" element={<Locations onToast={showToast} />} />
              <Route path="/events" element={<Events onToast={showToast} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>

          {/* Interactive Toast Popup */}
          {toast && (
            <div className="toast-popup">
              <span>{toast.icon}</span>
              <span>{toast.msg}</span>
            </div>
          )}

          <footer className="footer-bar">
            <span>CCMS — Centralized Control & Monitoring System | Enterprise Edition v2.1</span>
            <span>Server: <strong>AWS EC2 / Localhost (Port 8000)</strong></span>
          </footer>
        </div>
      </div>
    </BrowserRouter>
  );
}
