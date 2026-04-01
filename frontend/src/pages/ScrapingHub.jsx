import { useState, useEffect, useCallback, Fragment } from 'react'
import { api } from '../lib/api.js'
import { supabase } from '../lib/supabase.js'
import { StatusBadge } from '../components/StatusBadge.jsx'

const SCRAPERS = [
  {
    id: 'trustpilot',
    name: 'Trustpilot',
    icon: '★',
    iconBg: '#FFE8D6',
    desc: 'Extrait les avis clients de la page Trustpilot Fnac Darty. Insère dans la table voix_client_cx avec déduplication automatique.',
    target: 'voix_client_cx',
    fields: [
      { key: 'brand', label: 'Domaine Trustpilot', defaultValue: 'fnacdarty.com', placeholder: 'fnacdarty.com' },
      { key: 'maxReviews', label: 'Nombre max d\'avis', defaultValue: '30', type: 'number', placeholder: '30' },
    ],
    apiFn: (body) => api.scrapeTrustpilot(body),
  },
  {
    id: 'google',
    name: 'Google Reviews',
    icon: 'G',
    iconBg: '#E8F4FD',
    desc: 'Scrape les avis Google Maps pour Fnac Darty. Via Apify actor compass/google-maps-reviews-scraper.',
    target: 'voix_client_cx',
    fields: [
      { key: 'query', label: 'Recherche Google', defaultValue: 'Fnac Darty', placeholder: 'Fnac Darty' },
      { key: 'maxReviews', label: 'Nombre max d\'avis', defaultValue: '30', type: 'number', placeholder: '30' },
    ],
    apiFn: (body) => api.scrapeGoogleReviews(body),
  },
  {
    id: 'twitter',
    name: 'Twitter / X',
    icon: '𝕏',
    iconBg: '#E8F0FE',
    desc: 'Scrape les tweets mentionnant Fnac Darty ou Boulanger. Insère dans reputation_crise ou benchmark_marche selon la cible.',
    target: 'reputation_crise / benchmark_marche',
    fields: [
      { key: 'searchTerm', label: 'Terme de recherche', defaultValue: 'Fnac Darty', placeholder: 'Fnac Darty' },
      { key: 'maxItems', label: 'Nombre max de tweets', defaultValue: '50', type: 'number', placeholder: '50' },
      { key: 'target', label: 'Table cible', defaultValue: 'reputation', type: 'select', options: [
        { value: 'reputation', label: 'Réputation & Crise' },
        { value: 'benchmark', label: 'Benchmark Marché' },
      ]},
    ],
    apiFn: (body) => api.scrapeTwitter(body),
  },
]

function ScraperCard({ scraper }) {
  const [params, setParams] = useState(() => Object.fromEntries(scraper.fields.map(f => [f.key, f.defaultValue])))
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleRun = async () => {
    setStatus('running'); setResult(null); setError(null)
    try {
      const data = await scraper.apiFn(params)
      setResult(data)
      setStatus('success')
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  const statusMap = { idle: null, running: 'running', success: 'completed', error: 'error' }

  return (
    <div className="scraper-card">
      <div className="scraper-card-header">
        <div className="scraper-card-name">
          <div className="scraper-card-icon" style={{ background: scraper.iconBg, color: 'var(--text)', fontWeight: 700 }}>
            {scraper.icon}
          </div>
          {scraper.name}
        </div>
        {status !== 'idle' && <StatusBadge status={statusMap[status]} />}
      </div>

      <div className="scraper-card-desc">{scraper.desc}</div>
      <div className="scraper-card-meta">→ Table: <strong>{scraper.target}</strong></div>

      <div style={{ marginBottom: 14 }}>
        {scraper.fields.map(field => (
          <div key={field.key} className="form-group" style={{ marginBottom: 8 }}>
            <label className="form-label">{field.label}</label>
            {field.type === 'select' ? (
              <select className="form-select" value={params[field.key]} onChange={e => setParams(p => ({ ...p, [field.key]: e.target.value }))}>
                {field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input
                className="form-input"
                type={field.type || 'text'}
                value={params[field.key]}
                placeholder={field.placeholder}
                onChange={e => setParams(p => ({ ...p, [field.key]: e.target.value }))}
              />
            )}
          </div>
        ))}
      </div>

      <div className="scraper-card-footer">
        <button
          className="btn btn-primary"
          onClick={handleRun}
          disabled={status === 'running'}
          style={{ flex: 1 }}
        >
          {status === 'running' ? (
            <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2, marginRight: 0 }} />Scraping…</>
          ) : '↻ Lancer le scraping'}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: 10, background: 'var(--positive-light)', border: '1px solid #B2E8D8', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: 12, color: 'var(--positive)' }}>
          ✓ {result.message || `${result.inserted || 0} enregistrements insérés`}
        </div>
      )}
      {error && (
        <div style={{ marginTop: 10, background: 'var(--negative-light)', border: '1px solid #F8BBD9', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: 12, color: 'var(--negative)' }}>
          ✗ {error}
          {error.includes('APIFY_API_TOKEN') && (
            <div style={{ marginTop: 4, fontSize: 11, opacity: 0.8 }}>Ajoutez APIFY_API_TOKEN dans backend/.env</div>
          )}
        </div>
      )}
    </div>
  )
}

const SOURCE_TABLE = {
  'Trustpilot': 'voix_client_cx',
  'trustpilot': 'voix_client_cx',
  'Google Reviews': 'voix_client_cx',
  'google_reviews': 'voix_client_cx',
  'Twitter/X': 'reputation_crise',
}

function TextModal({ text, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 'var(--radius)', padding: 24, maxWidth: 640, width: '100%', maxHeight: '70vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>Texte complet</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{text}</p>
      </div>
    </div>
  )
}

function SessionPreview({ log }) {
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modalText, setModalText] = useState(null)

  useEffect(() => {
    const table = SOURCE_TABLE[log.source] || 'voix_client_cx'
    const from = log.started_at
    const to = log.completed_at || new Date(new Date(log.started_at).getTime() + 60000).toISOString()
    supabase.from(table).select('*')
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { setRows(data || []); setLoading(false) })
  }, [log])

  if (loading) return <div style={{ padding: '12px 20px' }}><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /></div>
  if (!rows.length) return <div style={{ padding: '12px 20px', fontSize: 12, color: 'var(--text-muted)' }}>Aucun enregistrement trouvé pour cette session (déjà existants ou filtrés).</div>

  const cols = ['platform', 'text', 'sentiment', 'rating', 'date', 'location']
    .filter(c => rows[0] && c in rows[0])

  return (
    <>
      {modalText && <TextModal text={modalText} onClose={() => setModalText(null)} />}
      <div style={{ overflowX: 'auto', borderTop: '1px solid var(--border)' }}>
        <table className="data-table" style={{ fontSize: 11 }}>
          <thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {cols.map(c => (
                  <td key={c}>
                    {c === 'text'
                      ? <span
                          onClick={() => row[c] && setModalText(row[c])}
                          title="Cliquer pour voir le texte complet"
                          style={{ display: 'block', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: row[c] ? 'pointer' : 'default', color: 'var(--primary)', textDecoration: 'underline dotted' }}
                        >{row[c] || '—'}</span>
                      : c === 'sentiment'
                        ? <span style={{ color: row[c] === 'Positive' ? 'var(--positive)' : row[c] === 'Negative' ? 'var(--negative)' : 'var(--neutral)', fontWeight: 600 }}>{row[c] || '—'}</span>
                        : c === 'rating' && row[c]
                          ? <span style={{ fontWeight: 600, color: row[c] >= 4 ? 'var(--positive)' : row[c] <= 2 ? 'var(--negative)' : 'var(--neutral)' }}>{row[c]}/5</span>
                          : c === 'date'
                            ? (row[c] ? new Date(row[c]).toLocaleDateString('fr-FR') : '—')
                            : (row[c] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default function ScrapingHub() {
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(true)
  const [expandedLog, setExpandedLog] = useState(null)

  const loadLogs = useCallback(async () => {
    const { data } = await supabase.from('scraping_logs').select('*').order('started_at', { ascending: false }).limit(20)
    setLogs(data || [])
    setLogsLoading(false)
  }, [])

  useEffect(() => { loadLogs() }, [loadLogs])

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Hub Scraping</div>
        <div className="page-subtitle">Collecte de nouvelles données via Apify — déduplication automatique</div>
      </div>

      <div style={{ background: 'var(--neutral-light)', border: '1px solid #F0CC89', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 20, fontSize: 12, color: 'var(--text)' }}>
        ⚠ <strong>Prérequis :</strong> Le backend doit être démarré (<code>npm run dev:backend</code>) et <code>APIFY_API_TOKEN</code> doit être configuré dans <code>backend/.env</code>
      </div>

      <div className="scraper-grid">
        {SCRAPERS.map(s => <ScraperCard key={s.id} scraper={s} />)}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">◉ Journal de scraping</div>
          <button className="btn btn-ghost btn-sm" onClick={loadLogs}>↻ Actualiser</button>
        </div>
        {logsLoading ? (
          <div className="loading-wrap" style={{ padding: 30 }}><div className="spinner" /></div>
        ) : logs.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">◻</div><div className="empty-text">Aucun scraping lancé</div></div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lancé le</th><th>Source</th><th>Statut</th><th>Enregistrements</th><th>Terminé le</th><th>Erreur</th><th></th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <Fragment key={log.id}>
                    <tr style={{ background: expandedLog === log.id ? 'var(--primary-light)' : undefined }}>
                      <td style={{ fontSize: 11 }}>{log.started_at ? new Date(log.started_at).toLocaleString('fr-FR') : '—'}</td>
                      <td><span className="badge badge-primary">{log.source}</span></td>
                      <td><StatusBadge status={log.status} /></td>
                      <td style={{ fontWeight: 600 }}>{log.records_added ?? 0}</td>
                      <td style={{ fontSize: 11 }}>{log.completed_at ? new Date(log.completed_at).toLocaleString('fr-FR') : '—'}</td>
                      <td><span className="text-truncate" style={{ maxWidth: 160, fontSize: 11, color: 'var(--negative)' }}>{log.error_message || '—'}</span></td>
                      <td>
                        {log.records_added > 0 && (
                          <button
                            className={`btn btn-sm ${expandedLog === log.id ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                            onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                          >
                            {expandedLog === log.id ? '▲ Masquer' : '▼ Voir les données'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedLog === log.id && (
                      <tr>
                        <td colSpan={7} style={{ padding: 0, background: 'var(--surface-alt)' }}>
                          <SessionPreview log={log} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
