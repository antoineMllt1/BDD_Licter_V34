export default function ChartCard({ title, icon, meta, children, actions }) {
  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <div className="chart-card-title">
          {icon && <span className="chart-card-icon">{icon}</span>}
          {title}
        </div>
        <div className="chart-card-tools">
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
