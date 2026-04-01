export default function ChartCard({ title, icon, meta, children, actions }) {
  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <div className="chart-card-title">
          {icon && <span>{icon}</span>}
          {title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {meta && <span className="chart-card-meta">{meta}</span>}
          {actions}
        </div>
      </div>
      <div className="chart-wrapper">
        {children}
      </div>
    </div>
  )
}
