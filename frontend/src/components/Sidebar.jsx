import { NavLink } from 'react-router-dom'

const NAV = [
  {
    section: 'Pilotage',
    items: [
      { to: '/', label: 'Cockpit' },
      { to: '/war-room', label: 'Crise' },
      { to: '/battle-matrix', label: 'Concurrence' },
      { to: '/voix-du-client', label: 'Clients' },
      { to: '/magasins', label: 'Magasins' },
      { to: '/action-center', label: 'Actions' },
    ],
  },
  {
    section: 'Back-office',
    items: [
      { to: '/scraping', label: 'Collecte' },
      { to: '/scraping/results', label: 'Historique' },
      { to: '/data', label: 'Data' },
      { to: '/automation', label: 'Automations' },
      { to: '/comex', label: 'Rapport PDF' },
    ],
  },
]

export default function Sidebar() {
  return (
    <aside className="sidebar" aria-label="Navigation principale">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">
          <div className="logo-icon">L</div>
          <div>
            <div className="logo-name">Licter</div>
            <span className="logo-badge">Brand intelligence cockpit</span>
          </div>
        </div>
      </div>

      <div className="sidebar-brand">
        <div className="sidebar-brand-label">Perimetre actif</div>
        <div className="sidebar-brand-name">Fnac Darty x Boulanger</div>
        <div className="sidebar-brand-meta">marque, reseau, execution</div>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(({ section, items }) => (
          <div key={section} className="sidebar-section">
            <div className="sidebar-section-label">{section}</div>
            {items.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                end={to === '/'}
              >
                <span className="nav-link-label">{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-footer-text">Licter v3.4</div>
      </div>
    </aside>
  )
}
