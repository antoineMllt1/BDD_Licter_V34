export default function KPICard({ label, value, sub, icon, color = 'primary', trend }) {
  const colorMap = {
    primary: { c: 'var(--primary)', bg: 'var(--primary-light)' },
    positive: { c: 'var(--positive)', bg: 'var(--positive-light)' },
    negative: { c: 'var(--negative)', bg: 'var(--negative-light)' },
    neutral: { c: 'var(--neutral)', bg: 'var(--neutral-light)' },
    blue: { c: 'var(--blue)', bg: 'var(--blue-light)' },
  }
  const { c, bg } = colorMap[color] || colorMap.primary

  return (
    <div className="kpi-card" style={{ '--kpi-color': c, '--kpi-bg': bg }}>
      {icon && <div className="kpi-icon">{icon}</div>}
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value ?? '—'}</div>
      {sub && (
        <div className="kpi-sub">
          {trend !== undefined && (
            <span style={{ color: trend >= 0 ? 'var(--positive)' : 'var(--negative)', fontWeight: 600 }}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
            </span>
          )}
          {sub}
        </div>
      )}
    </div>
  )
}
