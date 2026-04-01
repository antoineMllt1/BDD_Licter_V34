import { NavLink, useLocation } from 'react-router-dom'

const NAV = [
  { section: 'Analyse', items: [
    { to: '/', icon: '◈', label: 'Vue d\'ensemble' },
    { to: '/reputation', icon: '⬤', label: 'Réputation & Crise', dot: 'negative' },
    { to: '/benchmark', icon: '⬤', label: 'Benchmark Marché', dot: 'blue' },
    { to: '/cx', icon: '⬤', label: 'Expérience Client', dot: 'neutral' },
  ]},
  { section: 'Opérations', items: [
    { to: '/scraping', icon: '↻', label: 'Hub Scraping' },
    { to: '/scraping/results', icon: '◉', label: 'Résultats collectés' },
    { to: '/automation', icon: '⚡', label: 'Automatisation Make' },
  ]},
  { section: 'Données', items: [
    { to: '/data', icon: '⊞', label: 'Import / Export' },
    { to: '/comex', icon: '◻', label: 'Rapport COMEX' },
  ]},
]

export default function Sidebar() {
  const location = useLocation()

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">
          <div className="logo-icon">L</div>
          <div>
            <div className="logo-name">Licter</div>
            <span className="logo-badge">Brand Intelligence</span>
          </div>
        </div>
      </div>

      <div className="sidebar-brand">
        <div className="sidebar-brand-label">Marque analysée</div>
        <div className="sidebar-brand-name">Fnac Darty × Boulanger</div>
      </div>

      {NAV.map(({ section, items }) => (
        <div key={section} className="sidebar-section">
          <div className="sidebar-section-label">{section}</div>
          {items.map(({ to, icon, label, dot }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              end={to === '/'}
            >
              <span className="nav-icon" style={dot ? { color: `var(--${dot === 'blue' ? 'blue' : dot})` } : {}}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </div>
      ))}

      <div className="sidebar-footer">
        <div className="sidebar-footer-text">BDD Eugenia × Licter 2026</div>
      </div>
    </aside>
  )
}
