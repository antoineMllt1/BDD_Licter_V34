import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { StatusBadge, SentimentBadge } from '../components/StatusBadge.jsx'

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

const TABLES = [
  { value: 'scraping_brand', label: 'Scraping Marque', color: '#6C5CE7', sources: ['Trustpilot', 'Google Reviews', 'Twitter/X'], group: 'scraping' },
  { value: 'scraping_competitor', label: 'Scraping Concurrents', color: '#E17055', sources: ['Trustpilot', 'Google Reviews', 'Twitter/X'], group: 'scraping' },
  { value: 'voix_client_cx', label: 'CSV - Exp. Client', color: 'var(--neutral)', sources: ['Trustpilot', 'Google Reviews'], group: 'csv' },
  { value: 'reputation_crise', label: 'CSV - Réputation', color: 'var(--negative)', sources: ['Twitter/X', 'Make.com'], group: 'csv' },
  { value: 'benchmark_marche', label: 'CSV - Benchmark', color: 'var(--blue)', sources: ['Twitter/X', 'Make.com'], group: 'csv' },
]

const PAGE_SIZE = 20

export default function ScrapingResults() {
  const [searchParams] = useSearchParams()
  const [activeTable, setActiveTable] = useState(searchParams.get('table') || 'scraping_brand')
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [platformFilter, setPlatformFilter] = useState(searchParams.get('source') || 'all')
  const [platforms, setPlatforms] = useState([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [logs, setLogs] = useState([])
  const [modalText, setModalText] = useState(null)

  const loadCounts = useCallback(async () => {
    const results = await Promise.all(
      TABLES.map(t => supabase.from(t.value).select('*', { count: 'exact', head: true }))
    )
    const c = {}
    TABLES.forEach((t, i) => { c[t.value] = results[i].count || 0 })
    setCounts(c)
  }, [])

  const loadRows = useCallback(async () => {
    setLoading(true)
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let q = supabase.from(activeTable).select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (platformFilter !== 'all') q = q.eq('platform', platformFilter)

    const { data, count, error } = await q
    if (!error) { setRows(data || []); setTotal(count || 0) }
    setLoading(false)
  }, [activeTable, platformFilter, page])

  const loadPlatforms = useCallback(async () => {
    const { data } = await supabase.from(activeTable).select('platform').not('platform', 'is', null)
    const unique = [...new Set((data || []).map(r => r.platform).filter(Boolean))]
    setPlatforms(unique)
    setPlatformFilter('all')
    setPage(0)
  }, [activeTable])

  const loadLogs = useCallback(async () => {
    const { data } = await supabase.from('scraping_logs').select('*')
      .order('started_at', { ascending: false }).limit(10)
    setLogs(data || [])
  }, [])

  useEffect(() => { loadCounts(); loadLogs() }, [loadCounts, loadLogs])
  useEffect(() => { loadPlatforms() }, [loadPlatforms])
  useEffect(() => { loadRows() }, [loadRows])

  const tableInfo = TABLES.find(t => t.value === activeTable)
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const renderCell = (key, val) => {
    if (val === null || val === undefined || val === '') return <span style={{ color: 'var(--text-light)' }}>—</span>
    if (key === 'sentiment' || key === 'sentiment_detected') return <SentimentBadge sentiment={val} />
    if (key === 'platform') return <span className="badge badge-primary" style={{ fontSize: 10 }}>{val}</span>
    if (key === 'text') return <span onClick={() => setModalText(val)} title="Cliquer pour voir le texte complet" style={{ fontSize: 11, color: 'var(--primary)', display: 'block', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', textDecoration: 'underline dotted' }}>{val}</span>
    if (key === 'date' || key === 'created_at') return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(val).toLocaleDateString('fr-FR')}</span>
    if (key === 'rating' && val) return <span style={{ fontWeight: 600, color: val >= 4 ? 'var(--positive)' : val <= 2 ? 'var(--negative)' : 'var(--neutral)' }}>{val}/5</span>
    if (key === 'is_verified') return val ? <span style={{ color: 'var(--positive)', fontSize: 11 }}>✓ Vérifié</span> : null
    if (typeof val === 'boolean') return val ? '✓' : '✗'
    return <span style={{ fontSize: 11 }}>{String(val)}</span>
  }

  const COLS = {
    scraping_brand: ['platform', 'brand', 'category', 'text', 'date', 'rating', 'sentiment', 'location'],
    scraping_competitor: ['platform', 'brand', 'category', 'text', 'date', 'rating', 'sentiment', 'location'],
    voix_client_cx: ['platform', 'brand', 'category', 'text', 'date', 'rating', 'sentiment', 'location'],
    reputation_crise: ['platform', 'brand', 'post_type', 'text', 'date', 'sentiment', 'likes', 'user_followers'],
    benchmark_marche: ['platform', 'entity_analyzed', 'topic', 'text', 'date', 'sentiment_detected', 'target_brand_vs_competitor'],
  }

  const cols = COLS[activeTable] || []

  return (
    <div>
      {modalText && <TextModal text={modalText} onClose={() => setModalText(null)} />}
      <div className="page-header">
        <div className="page-title">Résultats de Scraping</div>
        <div className="page-subtitle">Données collectées par source et table Supabase</div>
      </div>

      {/* Logs récents */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">◉ Dernières sessions</div>
          <button className="btn btn-ghost btn-sm" onClick={() => { loadLogs(); loadCounts() }}>↻ Actualiser</button>
        </div>
        <div style={{ padding: '12px 20px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {logs.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucune session enregistrée</span>
          ) : logs.map(log => (
            <div key={log.id} style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', minWidth: 180 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span className="badge badge-primary" style={{ fontSize: 10 }}>{log.source}</span>
                <StatusBadge status={log.status} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                {log.records_added || 0} enregistrements
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                {log.started_at ? new Date(log.started_at).toLocaleString('fr-FR') : '—'}
              </div>
              {log.error_message && (
                <div style={{ fontSize: 10, color: 'var(--negative)', marginTop: 2 }}>✗ {log.error_message.slice(0, 40)}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Table selector */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Scraping databases */}
            {TABLES.filter(t => t.group === 'scraping').map(t => (
              <button
                key={t.value}
                onClick={() => setActiveTable(t.value)}
                className={`btn btn-sm ${activeTable === t.value ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderLeft: activeTable === t.value ? `3px solid ${t.color}` : undefined }}
              >
                {t.label}
                <span style={{ marginLeft: 6, background: 'rgba(108,92,231,0.1)', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>
                  {(counts[t.value] || 0).toLocaleString('fr-FR')}
                </span>
              </button>
            ))}
            <span style={{ color: 'var(--border)', fontSize: 16, margin: '0 2px' }}>|</span>
            {/* CSV databases */}
            {TABLES.filter(t => t.group === 'csv').map(t => (
              <button
                key={t.value}
                onClick={() => setActiveTable(t.value)}
                className={`btn btn-sm ${activeTable === t.value ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderLeft: activeTable === t.value ? `3px solid ${t.color}` : undefined, opacity: 0.85 }}
              >
                {t.label}
                <span style={{ marginLeft: 6, background: 'rgba(108,92,231,0.1)', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>
                  {(counts[t.value] || 0).toLocaleString('fr-FR')}
                </span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {platforms.length > 0 && (
              <select className="form-select" style={{ fontSize: 11, padding: '4px 8px', height: 30 }}
                value={platformFilter} onChange={e => { setPlatformFilter(e.target.value); setPage(0) }}>
                <option value="all">Toutes sources</option>
                {platforms.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{total.toLocaleString('fr-FR')} résultats</span>
          </div>
        </div>

        {/* Sources info */}
        <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sources :</span>
          {tableInfo.sources.map(s => (
            <span key={s} className="badge badge-primary" style={{ fontSize: 10 }}>{s}</span>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
            Table Supabase : <code style={{ background: 'var(--surface-alt)', padding: '1px 5px', borderRadius: 3 }}>{activeTable}</code>
          </span>
        </div>

        {loading ? (
          <div className="loading-wrap" style={{ padding: 40 }}><div className="spinner" /></div>
        ) : rows.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>
            <div className="empty-icon">◻</div>
            <div className="empty-text">Aucune donnée — lancez un scraping depuis le Hub Scraping</div>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>{cols.map(c => <th key={c}>{c.replace(/_/g, ' ')}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.id || i}>
                      {cols.map(c => <td key={c}>{renderCell(c, row[c])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>← Précédent</button>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Page {page + 1} / {totalPages}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Suivant →</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
