import './StatsCard.css';

export default function StatsCard({ title, value, icon, color = 'var(--primary)' }) {
  return (
    <div className="stats-card">
      <div className="stats-card-icon" style={{ background: color }}>
        {icon}
      </div>
      <div className="stats-card-info">
        <div className="stats-card-value">{value}</div>
        <div className="stats-card-title">{title}</div>
      </div>
    </div>
  );
}
