import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { supabase } from '../lib/supabase.js'
import { StatusBadge } from '../components/StatusBadge.jsx'

const DB_TARGETS = [
  { value: 'scraping', label: 'Scraping', color: '#6C5CE7', icon: 'G' },
  { value: 'competitor', label: 'Concurrents', color: '#E17055', icon: 'C' },
  { value: 'csv', label: 'CSV', color: '#00B894', icon: 'CSV' }
]

const SCRAPERS = [
  {
    id: 'trustpilot',
    name: 'Trustpilot',
    icon: 'T',
    iconBg: '#FFE8D6',
    desc: 'Extrait les avis Trustpilot directement depuis la source avec deduplication.',
    massiveLabel: 'Recherche massive',
    massiveHint: 'Plus de pages, ideal pour un gros remplissage ponctuel.',
    fields: [
      { key: 'brand', label: 'Domaine Trustpilot', defaultValue: 'fnac.com', placeholder: 'fnac.com' },
      { key: 'maxReviews', label: "Nombre max d'avis", defaultValue: '30', type: 'number', placeholder: '30' }
    ],
    apiFn: (body) => api.scrapeTrustpilot(body)
  },
  {
    id: 'google',
    name: 'Google Reviews',
    icon: 'G',
    iconBg: '#E8F4FD',
    desc: 'Scrape Google Maps sur plusieurs villes et remonte les vrais magasins.',
    massiveLabel: 'Recherche massive',
    massiveHint: 'Balaye beaucoup plus de villes pour nourrir la carte France.',
    fields: [
      { key: 'query', label: 'Recherche Google', defaultValue: 'Fnac Darty', placeholder: 'Fnac Darty' },
      { key: 'maxReviews', label: "Nombre max d'avis", defaultValue: '30', type: 'number', placeholder: '30' }
    ],
    apiFn: (body) => api.scrapeGoogleReviews(body)
  },
  {
    id: 'twitter',
    name: 'Twitter / X',
    icon: 'X',
    iconBg: '#E8F0FE',
    desc: 'Scrape les mentions sociales et nettoie avant insertion.',
    massiveLabel: 'Recherche massive',
    massiveHint: 'Etend le volume cible pour capter davantage de bruit social.',
    fields: [
      { key: 'searchTerm', label: 'Terme de recherche', defaultValue: 'Fnac Darty', placeholder: 'Fnac Darty' },
      { key: 'maxItems', label: 'Nombre max de tweets', defaultValue: '50', type: 'number', placeholder: '50' },
      {
        key: 'target',
        label: 'Table cible (mode CSV)',
        defaultValue: 'reputation',
        type: 'select',
        options: [
          { value: 'reputation', label: 'Reputation & Crise' },
          { value: 'benchmark', label: 'Benchmark Marche' }
        ]
      }
    ],
    apiFn: (body) => api.scrapeTwitter(body)
  },
  {
    id: 'reddit',
    name: 'Reddit',
    icon: 'R',
    iconBg: '#FFF1E6',
    desc: 'Recupere les discussions utiles et nettoie automatiquement avant insertion.',
    massiveLabel: 'Recherche massive',
    massiveHint: 'Prend un lot beaucoup plus large pour enrichir la base par vagues.',
    fields: [
      { key: 'query', label: 'Recherche Reddit', defaultValue: 'Fnac Darty', placeholder: 'Fnac Darty' },
      { key: 'maxItems', label: 'Nombre max de posts', defaultValue: '30', type: 'number', placeholder: '30' }
    ],
    apiFn: (body) => api.scrapeReddit(body)
  }
]

const SCHEDULE_SCRAPERS = [
  { key: 'trustpilot', label: 'Trustpilot' },
  { key: 'google', label: 'Google Reviews' },
  { key: 'twitter', label: 'Twitter / X' },
  { key: 'reddit', label: 'Reddit' }
]

const SOURCE_TABLE = {
  Trustpilot: 'scraping_brand',
  'Google Reviews': 'scraping_brand',
  'Twitter/X': 'scraping_brand',
  Reddit: 'scraping_brand'
}

function withMassiveDefaults(scraperId, params) {
  const next = { ...params, massive: true }

  if (scraperId === 'trustpilot') {
    next.maxReviews = String(Math.max(Number(params.maxReviews) || 0, 180))
  } else if (scraperId === 'google') {
    next.maxReviews = String(Math.max(Number(params.maxReviews) || 0, 240))
  } else if (scraperId === 'twitter') {
    next.maxItems = String(Math.max(Number(params.maxItems) || 0, 250))
  } else if (scraperId === 'reddit') {
    next.maxItems = String(Math.max(Number(params.maxItems) || 0, 180))
  }

  return next
}

function formatLiveTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString('fr-FR')
  } catch {
    return '--:--:--'
  }
}

function getEventTone(event) {
  if (event.level === 'error' || event.type === 'run_failed') return '#FF5C93'
  if (event.level === 'success' || event.type === 'run_completed') return '#00B894'
  return '#9B8CFF'
}

function TextModal({ text, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(event) => event.stopPropagation()} style={{ background: 'white', borderRadius: 'var(--radius)', padding: 24, maxWidth: 640, width: '100%', maxHeight: '70vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>Texte complet</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Fermer</button>
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

    supabase
      .from(table)
      .select('*')
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setRows(data || [])
        setLoading(false)
      })
  }, [log])

  if (loading) {
    return <div style={{ padding: '12px 20px' }}><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /></div>
  }

  if (!rows.length) {
    return <div style={{ padding: '12px 20px', fontSize: 12, color: 'var(--text-muted)' }}>Aucun enregistrement trouve pour cette session.</div>
  }

  const columns = ['platform', 'text', 'sentiment', 'rating', 'date', 'location'].filter((column) => rows[0] && column in rows[0])

  return (
    <>
      {modalText && <TextModal text={modalText} onClose={() => setModalText(null)} />}
      <div style={{ overflowX: 'auto', borderTop: '1px solid var(--border)' }}>
        <table className="data-table" style={{ fontSize: 11 }}>
          <thead>
            <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id || index}>
                {columns.map((column) => (
                  <td key={column}>
                    {column === 'text' ? (
                      <span
                        onClick={() => row[column] && setModalText(row[column])}
                        title="Cliquer pour voir le texte complet"
                        style={{ display: 'block', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: row[column] ? 'pointer' : 'default', color: 'var(--primary)', textDecoration: 'underline dotted' }}
                      >
                        {row[column] || '-'}
                      </span>
                    ) : column === 'sentiment' ? (
                      <span style={{ color: row[column] === 'Positive' ? 'var(--positive)' : row[column] === 'Negative' ? 'var(--negative)' : 'var(--neutral)', fontWeight: 600 }}>
                        {row[column] || '-'}
                      </span>
                    ) : column === 'rating' && row[column] ? (
                      <span style={{ fontWeight: 600, color: row[column] >= 4 ? 'var(--positive)' : row[column] <= 2 ? 'var(--negative)' : 'var(--neutral)' }}>{row[column]}/5</span>
                    ) : column === 'date' ? (
                      row[column] ? new Date(row[column]).toLocaleDateString('fr-FR') : '-'
                    ) : (
                      row[column] ?? '-'
                    )}
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

function TerminalPanel({ events, activeRun, connected, compact = false, title = 'Terminal scraping' }) {
  const logRef = useRef(null)

  useEffect(() => {
    const node = logRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [events])

  return (
    <div
      className={compact ? '' : 'card'}
      style={{
        overflow: 'hidden',
        border: compact ? '1px solid var(--border)' : undefined,
        borderRadius: compact ? '12px' : undefined,
        background: compact ? 'linear-gradient(180deg, #FFFFFF 0%, #FBFAFF 100%)' : undefined,
        boxShadow: compact ? '0 8px 24px rgba(108,92,231,0.08)' : undefined
      }}
    >
      <div
        className={compact ? '' : 'card-header'}
        style={compact ? {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px',
          borderBottom: '1px solid var(--border-light)'
        } : undefined}
      >
        <div className={compact ? '' : 'card-title'} style={compact ? { fontSize: 12, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.2px' } : undefined}>
          {title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {activeRun && (
            <span className="badge badge-primary" style={{ fontSize: 10, maxWidth: compact ? 160 : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeRun.source} {activeRun.massive ? '- massif' : '- standard'}
            </span>
          )}
          <StatusBadge status={connected ? 'active' : 'inactive'} />
        </div>
      </div>

      <div
        ref={logRef}
        style={{
          background: 'linear-gradient(180deg, #11111A 0%, #171726 100%)',
          color: '#F3F0FF',
          padding: compact ? 14 : 16,
          minHeight: compact ? 156 : 240,
          maxHeight: compact ? 240 : 300,
          overflowY: 'auto',
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: compact ? 11 : 12,
          lineHeight: 1.55
        }}
      >
        {!events.length ? (
          <div style={{ color: 'rgba(243,240,255,0.72)', whiteSpace: 'normal' }}>
            {'> '}Pret. Lancez ce scraper pour suivre les etapes en temps reel.
          </div>
        ) : (
          events.map((event, index) => (
            <div
              key={`${event.timestamp || index}-${index}`}
              style={{
                padding: compact ? '0 0 10px' : '0 0 8px',
                marginBottom: compact ? 10 : 8,
                borderBottom: index === events.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.06)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ color: '#8A86B3', fontSize: 10 }}>[{formatLiveTime(event.timestamp)}]</span>
                <span style={{ color: getEventTone(event), fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  {event.source || 'Scraper'}
                </span>
              </div>
              <div style={{ color: '#F3F0FF', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {event.message}
                {event.preview && <span style={{ color: '#B9B3E6' }}>{` - ${event.preview}`}</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function ScraperCard({ scraper, onStart, onFinish, events, activeRun, connected }) {
  const [params, setParams] = useState(() => Object.fromEntries(scraper.fields.map((field) => [field.key, field.defaultValue])))
  const [targetDb, setTargetDb] = useState('scraping')
  const [massive, setMassive] = useState(false)
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const activeDbInfo = DB_TARGETS.find((db) => db.value === targetDb)
  const resolvedTable = targetDb === 'scraping'
    ? 'scraping_brand'
    : targetDb === 'competitor'
      ? 'scraping_competitor'
      : (scraper.id === 'twitter' ? (params.target === 'benchmark' ? 'benchmark_marche' : 'reputation_crise') : 'voix_client_cx')

  const handleRun = async () => {
    setStatus('running')
    setResult(null)
    setError(null)

    const payload = massive ? withMassiveDefaults(scraper.id, params) : { ...params, massive: false }
    onStart?.({ source: scraper.name, massive })

    try {
      const data = await scraper.apiFn({ ...payload, targetDb })
      setResult(data)
      setStatus('success')
      onFinish?.()
    } catch (requestError) {
      setError(requestError.message)
      setStatus('error')
      onFinish?.()
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

      <div style={{ marginBottom: 12 }}>
        <label className="form-label" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 5, display: 'block' }}>
          Destination
        </label>
        <div style={{ display: 'flex', gap: 4 }}>
          {DB_TARGETS.map((db) => (
            <button
              key={db.value}
              onClick={() => setTargetDb(db.value)}
              style={{
                flex: 1,
                padding: '5px 4px',
                fontSize: 10,
                border: targetDb === db.value ? `2px solid ${db.color}` : '2px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: targetDb === db.value ? `${db.color}12` : 'var(--surface)',
                color: targetDb === db.value ? db.color : 'var(--text-muted)',
                fontWeight: targetDb === db.value ? 700 : 500,
                cursor: 'pointer',
                textAlign: 'center',
                lineHeight: 1.3
              }}
            >
              <div style={{ fontSize: 13 }}>{db.icon}</div>
              {db.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
          Table cible: <strong style={{ color: activeDbInfo.color }}>{resolvedTable}</strong>
        </div>
      </div>

      <div style={{ marginBottom: 12, border: '1px solid #E5DBFF', background: massive ? 'rgba(108,92,231,0.08)' : 'var(--surface-alt)', borderRadius: 'var(--radius-sm)', padding: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{scraper.massiveLabel}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{scraper.massiveHint}</div>
          </div>
          <button className={`toggle ${massive ? 'on' : ''}`} onClick={() => setMassive((current) => !current)} />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        {scraper.fields
          .filter((field) => !(field.key === 'target' && targetDb !== 'csv'))
          .map((field) => (
            <div key={field.key} className="form-group" style={{ marginBottom: 8 }}>
              <label className="form-label">{field.label}</label>
              {field.type === 'select' ? (
                <select className="form-select" value={params[field.key]} onChange={(event) => setParams((current) => ({ ...current, [field.key]: event.target.value }))}>
                  {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ) : (
                <input
                  className="form-input"
                  type={field.type || 'text'}
                  value={params[field.key]}
                  placeholder={field.placeholder}
                  onChange={(event) => setParams((current) => ({ ...current, [field.key]: event.target.value }))}
                />
              )}
            </div>
          ))}
      </div>

      <div className="scraper-card-footer">
        <button className="btn btn-primary" onClick={handleRun} disabled={status === 'running'} style={{ flex: 1 }}>
          {status === 'running' ? (
            <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2, marginRight: 0 }} />Scraping...</>
          ) : 'Lancer le scraping'}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: 10, background: 'var(--positive-light)', border: '1px solid #B2E8D8', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: 12, color: 'var(--positive)' }}>
          Succes: {result.message || `${result.inserted || 0} enregistrements inseres`}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 10, background: 'var(--negative-light)', border: '1px solid #F8BBD9', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: 12, color: 'var(--negative)' }}>
          Erreur: {error}
        </div>
      )}
    </div>
  )
}

function ScheduleCard() {
  const [schedule, setSchedule] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    api.getScrapeSchedule()
      .then((data) => setSchedule(data))
      .finally(() => setLoading(false))
  }, [])

  const updateRoot = (key, value) => {
    setSchedule((current) => ({ ...current, [key]: value }))
  }

  const updateScraper = (key, patch) => {
    setSchedule((current) => ({
      ...current,
      scrapers: {
        ...current.scrapers,
        [key]: {
          ...current.scrapers[key],
          ...patch
        }
      }
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const saved = await api.saveScrapeSchedule(schedule)
      setSchedule(saved)
      setMessage({ type: 'success', text: 'Schedule sauvegarde' })
    } catch (saveError) {
      setMessage({ type: 'error', text: saveError.message })
    } finally {
      setSaving(false)
    }
  }

  const handleRunNow = async () => {
    setRunning(true)
    setMessage(null)
    try {
      const result = await api.runScrapeScheduleNow()
      if (result?.schedule) setSchedule(result.schedule)
      setMessage({ type: 'success', text: 'Schedule lance' })
    } catch (runError) {
      setMessage({ type: 'error', text: runError.message })
    } finally {
      setRunning(false)
    }
  }

  if (loading || !schedule) {
    return <div className="scraper-card"><div className="loading-wrap"><div className="spinner" /></div></div>
  }

  return (
    <div className="scraper-card">
      <div className="scraper-card-header">
        <div className="scraper-card-name">
          <div className="scraper-card-icon" style={{ background: '#EEF6FF', color: 'var(--text)', fontWeight: 700 }}>S</div>
          Schedule
        </div>
        <StatusBadge status={schedule.enabled ? 'active' : 'inactive'} />
      </div>

      <div className="scraper-card-desc">
        Active le scraping automatique de plusieurs sources a intervalle regulier, avec un volume distinct par scraper.
      </div>

      <div className="form-group" style={{ marginBottom: 10 }}>
        <label className="form-label">Activer le schedule</label>
        <button className={`toggle ${schedule.enabled ? 'on' : ''}`} onClick={() => updateRoot('enabled', !schedule.enabled)} style={{ marginTop: 4 }} />
      </div>

      <div className="form-group" style={{ marginBottom: 10 }}>
        <label className="form-label">Toutes les X minutes</label>
        <input className="form-input" type="number" min="5" value={schedule.intervalMinutes} onChange={(event) => updateRoot('intervalMinutes', event.target.value)} />
      </div>

      <div className="form-group" style={{ marginBottom: 12 }}>
        <label className="form-label">Destination globale</label>
        <select className="form-select" value={schedule.targetDb} onChange={(event) => updateRoot('targetDb', event.target.value)}>
          {DB_TARGETS.map((db) => <option key={db.value} value={db.value}>{db.label}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
        {SCHEDULE_SCRAPERS.map((scraper) => (
          <div key={scraper.key} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 10, background: 'var(--surface-alt)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{scraper.label}</div>
              <button className={`toggle ${schedule.scrapers[scraper.key]?.enabled ? 'on' : ''}`} onClick={() => updateScraper(scraper.key, { enabled: !schedule.scrapers[scraper.key]?.enabled })} />
            </div>
            <label className="form-label" style={{ fontSize: 11 }}>Quantite par run</label>
            <input
              className="form-input"
              type="number"
              min="1"
              max="300"
              value={schedule.scrapers[scraper.key]?.amount ?? 30}
              onChange={(event) => updateScraper(scraper.key, { amount: event.target.value })}
            />
          </div>
        ))}
      </div>

      <div className="scraper-card-footer">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
          {saving ? 'Sauvegarde...' : 'Enregistrer'}
        </button>
        <button className="btn btn-secondary" onClick={handleRunNow} disabled={running}>
          {running ? 'Lancement...' : 'Lancer maintenant'}
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
        Dernier run: {schedule.lastRunAt ? new Date(schedule.lastRunAt).toLocaleString('fr-FR') : 'jamais'}
      </div>

      {message && (
        <div style={{ marginTop: 10, background: message.type === 'success' ? 'var(--positive-light)' : 'var(--negative-light)', border: `1px solid ${message.type === 'success' ? '#B2E8D8' : '#F8BBD9'}`, borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: 12, color: message.type === 'success' ? 'var(--positive)' : 'var(--negative)' }}>
          {message.text}
        </div>
      )}
    </div>
  )
}

export default function ScrapingHub() {
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(true)
  const [expandedLog, setExpandedLog] = useState(null)
  const [liveEvents, setLiveEvents] = useState([])
  const [activeRun, setActiveRun] = useState(null)
  const [streamConnected, setStreamConnected] = useState(false)
  const [latestRunBySource, setLatestRunBySource] = useState({})
  const [activeRunBySource, setActiveRunBySource] = useState({})

  const loadLogs = useCallback(async () => {
    const data = await api.getScrapingLogs()
    setLogs(data || [])
    setLogsLoading(false)
  }, [])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  useEffect(() => {
    const closeStream = api.openScrapeStream(
      (event) => {
        setLiveEvents((current) => [...current.slice(-119), event])
        if (event?.source && event?.runId) {
          if (event.type === 'run_started') {
            setLatestRunBySource((current) => ({ ...current, [event.source]: event.runId }))
            setActiveRunBySource((current) => ({
              ...current,
              [event.source]: {
                runId: event.runId,
                source: event.source,
                massive: event.mode === 'massive'
              }
            }))
          }
          if (event.type === 'run_completed' || event.type === 'run_failed') {
            setActiveRunBySource((current) => {
              if (current[event.source]?.runId !== event.runId) return current
              const next = { ...current }
              delete next[event.source]
              return next
            })
          }
        }
      },
      (connected) => setStreamConnected(connected)
    )

    return () => {
      setStreamConnected(false)
      closeStream?.()
    }
  }, [])

  const visibleLiveEvents = useMemo(() => liveEvents.slice(-120), [liveEvents])
  const liveEventsBySource = useMemo(() => {
    return SCRAPERS.reduce((accumulator, scraper) => {
      const runId = latestRunBySource[scraper.name]
      accumulator[scraper.name] = visibleLiveEvents.filter((event) => {
        if (runId && event.runId) return event.runId === runId
        return event.source === scraper.name
      })
      return accumulator
    }, {})
  }, [latestRunBySource, visibleLiveEvents])

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Hub Scraping</div>
        <div className="page-subtitle">Collecte des donnees, suivi live des runs et alimentation massive ponctuelle.</div>
      </div>

      <div style={{ background: 'var(--neutral-light)', border: '1px solid #F0CC89', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 20, fontSize: 12, color: 'var(--text)' }}>
        <strong>Mode massif :</strong> a utiliser ponctuellement pour remplir la base en gros volume. Chaque carte affiche son terminal live juste en dessous du formulaire.
      </div>

      <div className="scraper-grid">
        <ScheduleCard />
        {SCRAPERS.map((scraper) => (
          <div key={scraper.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ScraperCard
              scraper={scraper}
              onStart={(payload) => {
                setActiveRun(payload)
              }}
              onFinish={() => {
                loadLogs()
              }}
            />
            <TerminalPanel
              events={liveEventsBySource[scraper.name] || []}
              activeRun={activeRunBySource[scraper.name] || (activeRun?.source === scraper.name ? activeRun : null)}
              connected={streamConnected}
              compact
              title={`${scraper.name} - terminal live`}
            />
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Journal de scraping</div>
          <button className="btn btn-ghost btn-sm" onClick={loadLogs}>Actualiser</button>
        </div>

        {logsLoading ? (
          <div className="loading-wrap" style={{ padding: 30 }}><div className="spinner" /></div>
        ) : logs.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">[]</div><div className="empty-text">Aucun scraping lance</div></div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lance le</th>
                  <th>Source</th>
                  <th>Statut</th>
                  <th>Enregistrements</th>
                  <th>Termine le</th>
                  <th>Erreur</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <Fragment key={log.id}>
                    <tr style={{ background: expandedLog === log.id ? 'var(--primary-light)' : undefined }}>
                      <td style={{ fontSize: 11 }}>{log.started_at ? new Date(log.started_at).toLocaleString('fr-FR') : '-'}</td>
                      <td><span className="badge badge-primary">{log.source}</span></td>
                      <td><StatusBadge status={log.status} /></td>
                      <td style={{ fontWeight: 600 }}>{log.records_added ?? 0}</td>
                      <td style={{ fontSize: 11 }}>{log.completed_at ? new Date(log.completed_at).toLocaleString('fr-FR') : '-'}</td>
                      <td><span className="text-truncate" style={{ maxWidth: 160, fontSize: 11, color: 'var(--negative)' }}>{log.error_message || '-'}</span></td>
                      <td>
                        {log.records_added > 0 && (
                          <button
                            className={`btn btn-sm ${expandedLog === log.id ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                            onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                          >
                            {expandedLog === log.id ? 'Masquer' : 'Voir les donnees'}
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
