import { NavLink } from 'react-router-dom';
import './Navbar.css';

const links = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/devices', label: 'Devices', icon: '💡' },
  { to: '/events', label: 'Events', icon: '⚡' },
];

export default function Navbar() {
  return (
    <>
      {/* Mobile header */}
      <header className="mobile-header">
        <span className="mobile-logo">⚡ CCMS</span>
        <nav className="mobile-nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => isActive ? 'mobile-link active' : 'mobile-link'} end={l.to === '/'}>
              {l.icon}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Desktop sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">⚡</span>
          <div>
            <div className="brand-title">CCMS</div>
            <div className="brand-subtitle">Street Light Control</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} end={l.to === '/'}>
              <span className="nav-icon">{l.icon}</span>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-footer-text">CCMS v1.0</div>
          <div className="sidebar-footer-sub">ESP32 Controller</div>
        </div>
      </aside>
    </>
  );
}
