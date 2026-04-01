import { useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

const PAGE_META = {
  '/': { title: 'Vue d\'ensemble', subtitle: 'Tableau de bord Brand Intelligence' },
  '/reputation': { title: 'Réputation & Crise', subtitle: 'Monitoring des mentions et alertes bad buzz' },
  '/benchmark': { title: 'Benchmark Marché', subtitle: 'Share of Voice & analyse concurrentielle' },
  '/cx': { title: 'Expérience Client', subtitle: 'Analyse des avis Trustpilot & Google Reviews' },
  '/scraping': { title: 'Hub Scraping', subtitle: 'Collecte de nouvelles données en temps réel' },
  '/automation': { title: 'Automatisation Make', subtitle: 'Pilotage des scénarios de workflow' },
  '/data': { title: 'Import / Export', subtitle: 'Gestion des données CSV et Supabase' },
  '/comex': { title: 'Rapport COMEX', subtitle: 'Génération de rapports exécutifs par IA' },
}

export default function Header() {
  const location = useLocation()
  const meta = PAGE_META[location.pathname] || { title: 'Dashboard', subtitle: '' }
  const [lastSync, setLastSync] = useState(null)
  const [totalRows, setTotalRows] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('reputation_crise').select('*', { count: 'exact', head: true }),
      supabase.from('benchmark_marche').select('*', { count: 'exact', head: true }),
      supabase.from('voix_client_cx').select('*', { count: 'exact', head: true }),
    ]).then(([r, b, c]) => {
      setTotalRows((r.count || 0) + (b.count || 0) + (c.count || 0))
      setLastSync(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
    })
  }, [])

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div>
          <div className="topbar-title">{meta.title}</div>
          <div className="topbar-subtitle">{meta.subtitle}</div>
        </div>
      </div>
      <div className="topbar-right">
        {totalRows !== null && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {totalRows.toLocaleString('fr-FR')} entrées
          </span>
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
          <span className="status-dot active" />
          Supabase {lastSync ? `· ${lastSync}` : ''}
        </span>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--primary)', fontWeight: 700 }}>A</div>
      </div>
    </header>
  )
}
