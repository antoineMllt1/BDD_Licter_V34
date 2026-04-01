import { useState, useEffect } from 'react'
import { api } from '../lib/api.js'
import { StatusBadge } from '../components/StatusBadge.jsx'

const SCENARIO_META = {
  5085615: {
    label: 'Sentiment — Benchmark Marché',
    desc: 'Lit les enregistrements sans sentiment dans benchmark_marche, appelle OpenAI GPT-4o-mini et met à jour sentiment_detected.',
    modules: ['Supabase', 'Iterator', 'OpenAI GPT-4o-mini', 'Supabase'],
    icon: '🧠',
    color: 'var(--blue)',
  },
  5094479: {
    label: 'Sentiment — Expérience Client',
    desc: 'Lit les enregistrements sans sentiment dans voix_client_cx, appelle OpenAI GPT-4o-mini et met à jour le champ sentiment.',
    modules: ['Supabase', 'Iterator', 'OpenAI GPT-4o-mini', 'Supabase'],
    icon: '🧠',
    color: 'var(--neutral)',
  },
  5094482: {
    label: 'Sentiment — Réputation & Crise',
    desc: 'Lit les enregistrements sans sentiment dans reputation_crise, appelle OpenAI GPT-4o-mini et met à jour le champ sentiment.',
    modules: ['Supabase', 'Iterator', 'OpenAI GPT-4o-mini', 'Supabase'],
    icon: '🧠',
    color: 'var(--negative)',
  },
  5085608: {
    label: 'Scraping Apify → Supabase',
    desc: 'Déclenche un actor Apify pour scraper des avis frais et les insère dans les tables Supabase avec déduplication par review_id.',
    modules: ['HTTP Request', 'Iterator', 'HTTP Request'],
    icon: '↻',
    color: 'var(--primary)',
  },
  5086449: {
    label: 'Webhook Sentiment Pipeline',
    desc: 'Déclenché via webhook HTTP. Lit les données Supabase en attente, analyse le sentiment via OpenAI, puis met à jour les enregistrements.',
    modules: ['Webhook', 'Supabase', 'Iterator', 'OpenAI', 'Supabase'],
    icon: '⚡',
    color: 'var(--positive)',
    hasWebhook: true,
  },
}

function ScenarioCard({ scenario, onAction }) {
  const meta = SCENARIO_META[scenario.id] || {}
  const [loading, setLoading] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleToggle = async () => {
    setLoading('toggle')
    try {
      if (scenario.isActive) {
        await api.deactivateScenario(scenario.id)
        showToast('Scénario désactivé')
      } else {
        await api.activateScenario(scenario.id)
        showToast('Scénario activé')
      }
      onAction()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(null)
    }
  }

  const handleRun = async () => {
    setLoading('run')
    try {
      await api.runScenario(scenario.id)
      showToast('Scénario lancé ✓')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="automation-card" style={{ borderLeft: `3px solid ${meta.color || 'var(--primary)'}` }}>
      <div className="automation-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 18 }}>{meta.icon || '⚙'}</span>
            <div className="automation-name">{meta.label || scenario.name}</div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
            {scenario.name}
          </div>
          <div className="automation-meta">
            <span>ID: {scenario.id}</span>
            <span>Exécutions: {scenario.executions || 0}</span>
            {scenario.lastEdit && <span>Modifié: {new Date(scenario.lastEdit).toLocaleDateString('fr-FR')}</span>}
            {scenario.errors > 0 && <span style={{ color: 'var(--negative)' }}>✗ {scenario.errors} erreurs</span>}
          </div>
        </div>
        <StatusBadge status={scenario.isActive ? 'active' : 'inactive'} />
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>{meta.desc}</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {(meta.modules || scenario.usedPackages || []).map((mod, i) => (
          <span key={i} className="badge badge-primary" style={{ fontSize: 10 }}>{mod}</span>
        ))}
      </div>

      <div className="automation-controls">
        <div className="toggle-wrap">
          <button
            className={`toggle ${scenario.isActive ? 'on' : ''} ${loading === 'toggle' ? 'loading' : ''}`}
            onClick={handleToggle}
            disabled={loading !== null}
            title={scenario.isActive ? 'Désactiver' : 'Activer'}
          />
          <span className="toggle-label">{scenario.isActive ? 'Actif' : 'Inactif'}</span>
        </div>

        <button
          className="btn btn-secondary btn-sm"
          onClick={handleRun}
          disabled={loading !== null}
        >
          {loading === 'run' ? (
            <><span className="spinner" style={{ width: 11, height: 11, borderWidth: 2 }} />Exécution…</>
          ) : '▷ Lancer maintenant'}
        </button>

        {meta.hasWebhook && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            📎 Webhook disponible
          </span>
        )}
      </div>

      {toast && (
        <div style={{
          marginTop: 10, padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 500,
          background: toast.type === 'error' ? 'var(--negative-light)' : 'var(--positive-light)',
          color: toast.type === 'error' ? 'var(--negative)' : 'var(--positive)',
          border: `1px solid ${toast.type === 'error' ? '#F8BBD9' : '#B2E8D8'}`
        }}>
          {toast.type === 'error' ? '✗' : '✓'} {toast.msg}
        </div>
      )}
    </div>
  )
}

export default function Automation() {
  const [scenarios, setScenarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadScenarios = async () => {
    setLoading(true); setError(null)
    try {
      const data = await api.getMakeScenarios()
      setScenarios(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
      // Show mock data if backend not running
      setScenarios([
        { id: 5085615, name: 'BDD2026 - Analyse IA Sentiment benchmark_marche', isActive: false, executions: 37, errors: 10, lastEdit: '2026-04-01T09:18:32.469Z', usedPackages: ['supabase', 'openai-gpt-3'] },
        { id: 5094479, name: 'BDD2026 - Analyse IA Sentiment voix_client_cx', isActive: false, executions: 0, errors: 0, lastEdit: '2026-04-01T15:12:47.000Z', usedPackages: ['supabase', 'openai-gpt-3'] },
        { id: 5094482, name: 'BDD2026 - Analyse IA Sentiment reputation_crise', isActive: false, executions: 0, errors: 0, lastEdit: '2026-04-01T15:12:58.000Z', usedPackages: ['supabase', 'openai-gpt-3'] },
        { id: 5085608, name: 'BDD2026 - Scraping Apify to Supabase (Fnac Darty)', isActive: false, executions: 0, errors: 0, lastEdit: '2026-04-01T07:49:32.002Z', usedPackages: ['http'] },
        { id: 5086449, name: 'BDD2026 - Webhook Sentiment Pipeline (Fnac Darty)', isActive: false, executions: 28, errors: 0, lastEdit: '2026-04-01T08:17:28.913Z', usedPackages: ['gateway', 'supabase', 'openai-gpt-3'] },
      ])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadScenarios() }, [])

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Automatisation Make.com</div>
            <div className="page-subtitle">Pilotage des scénarios BDD2026 — eu1.make.com</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={loadScenarios} disabled={loading}>
            ↻ Actualiser
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'var(--neutral-light)', border: '1px solid #F0CC89', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 20, fontSize: 12 }}>
          ⚠ Backend non démarré — affichage des données statiques. Démarrez avec <code>npm run dev:backend</code> et configurez <code>MAKE_API_TOKEN</code>.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0, marginBottom: 24 }}>
        {loading ? (
          <div className="loading-wrap"><div className="spinner" /><div className="loading-text">Chargement des scénarios…</div></div>
        ) : scenarios.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">⚡</div><div className="empty-text">Aucun scénario trouvé</div></div>
        ) : (
          scenarios.map(s => <ScenarioCard key={s.id} scenario={s} onAction={loadScenarios} />)
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">◉ Pipeline complet</div>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', paddingBottom: 8 }}>
            {[
              { label: 'Apify Scraping', sub: 'Extraction', icon: '↻', color: 'var(--blue)' },
              { arrow: true },
              { label: 'Make Orchestration', sub: 'Workflow', icon: '⚡', color: 'var(--neutral)' },
              { arrow: true },
              { label: 'OpenAI Analysis', sub: 'IA Sentiment', icon: '🧠', color: 'var(--primary)' },
              { arrow: true },
              { label: 'Supabase Storage', sub: 'Base de données', icon: '◈', color: 'var(--positive)' },
              { arrow: true },
              { label: 'Dashboard', sub: 'Visualisation', icon: '◻', color: 'var(--primary)' },
            ].map((step, i) => step.arrow ? (
              <span key={i} style={{ color: 'var(--text-light)', fontSize: 18, padding: '0 8px', flexShrink: 0 }}>→</span>
            ) : (
              <div key={i} style={{ textAlign: 'center', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', minWidth: 110, flexShrink: 0 }}>
                <div style={{ fontSize: 20, marginBottom: 4, color: step.color }}>{step.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{step.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{step.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
