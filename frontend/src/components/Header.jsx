import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useFilters } from '../lib/FilterContext.jsx'

const PAGE_META = {
  '/': { title: 'Cockpit COMEX', subtitle: 'Les signaux qui comptent maintenant.' },
  '/war-room': { title: 'War Room', subtitle: 'Crise social et reputation, lus separement.' },
  '/social': { title: 'Social Media', subtitle: 'Conversation, traction et auteurs visibles.' },
  '/battle-matrix': { title: 'Battle Matrix', subtitle: 'Ou Fnac Darty gagne, cede, ou peut reprendre du terrain.' },
  '/voix-du-client': { title: 'Voix du Client', subtitle: 'Irritants, parcours et preuves utiles.' },
  '/magasins': { title: 'Pilotage Magasins', subtitle: 'Risque local, hotspots et activations.' },
  '/action-center': { title: 'Action Center', subtitle: 'Ce qu il faut lancer, assigner, suivre.' },
  '/scraping': { title: 'Hub Scraping', subtitle: 'Sources actives et pipelines de collecte.' },
  '/scraping/results': { title: 'Resultats Scraping', subtitle: 'Dernieres collectes visibles.' },
  '/automation': { title: 'Automations', subtitle: 'Scenarios et execution back-office.' },
  '/data': { title: 'Base de Donnees', subtitle: 'Imports, exports et coherence des tables.' },
  '/comex': { title: 'Rapport COMEX', subtitle: 'Memo COMEX et export PDF.' },
}

function isBackOfficeRoute(pathname) {
  return pathname.startsWith('/scraping')
    || pathname.startsWith('/automation')
    || pathname.startsWith('/data')
    || pathname.startsWith('/comex')
}

export default function Header() {
  const location = useLocation()
  const meta = PAGE_META[location.pathname] || { title: 'Licter', subtitle: '' }
  const { filters, PERIOD_OPTIONS, PLATFORM_OPTIONS, SENTIMENT_OPTIONS, SEVERITY_OPTIONS } = useFilters()
  const [lastSync, setLastSync] = useState(null)
  const [totalRows, setTotalRows] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('reputation_crise').select('*', { count: 'exact', head: true }),
      supabase.from('benchmark_marche').select('*', { count: 'exact', head: true }),
      supabase.from('voix_client_cx').select('*', { count: 'exact', head: true }),
      supabase.from('scraping_brand').select('*', { count: 'exact', head: true }),
      supabase.from('scraping_competitor').select('*', { count: 'exact', head: true }),
      supabase.from('social_mentions').select('*', { count: 'exact', head: true }),
      supabase.from('social_mentions_competitor').select('*', { count: 'exact', head: true }),
    ]).then(([reputation, benchmark, cx, brandReviews, competitorReviews, socialBrand, socialCompetitor]) => {
      setTotalRows(
        (reputation.count || 0)
        + (benchmark.count || 0)
        + (cx.count || 0)
        + (brandReviews.count || 0)
        + (competitorReviews.count || 0)
        + (socialBrand.count || 0)
        + (socialCompetitor.count || 0)
      )
      setLastSync(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
    })
  }, [])

  const scopeLabel = useMemo(
    () => (isBackOfficeRoute(location.pathname) ? 'Back-office' : 'Pilotage'),
    [location.pathname]
  )

  const activeFilters = useMemo(() => {
    const periodLabel = PERIOD_OPTIONS.find((option) => option.value === filters.period)?.label
    const platformLabel = PLATFORM_OPTIONS.find((option) => option.value === filters.platform)?.label
    const sentimentLabel = SENTIMENT_OPTIONS.find((option) => option.value === filters.sentiment)?.label
    const severityLabel = SEVERITY_OPTIONS.find((option) => option.value === filters.severity)?.label

    return [
      periodLabel ? `Fenetre ${periodLabel}` : null,
      filters.platform !== 'all' ? platformLabel : null,
      filters.sentiment !== 'all' ? sentimentLabel : null,
      filters.severity !== 'all' ? severityLabel : null,
    ].filter(Boolean)
  }, [PERIOD_OPTIONS, PLATFORM_OPTIONS, SENTIMENT_OPTIONS, SEVERITY_OPTIONS, filters])

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="topbar-copy">
          <div className="topbar-title-row">
            <div className="topbar-title">{meta.title}</div>
            <span className={`topbar-badge ${isBackOfficeRoute(location.pathname) ? 'topbar-badge-muted' : ''}`}>
              {scopeLabel}
            </span>
          </div>
          <div className="topbar-subtitle">{meta.subtitle}</div>
          {activeFilters.length > 0 && (
            <div className="topbar-filter-row">
              {activeFilters.map((filter) => (
                <span key={filter} className="topbar-filter-pill">{filter}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="topbar-right">
        {totalRows !== null && (
          <span className="topbar-stat">
            {totalRows.toLocaleString('fr-FR')} lignes
          </span>
        )}

        <span className="topbar-status">
          <span className="status-dot active" />
          {lastSync ? `Synchro ${lastSync}` : 'Synchro en cours'}
        </span>
      </div>
    </header>
  )
}
