import { useState, useEffect, useMemo } from 'react'
import { supabase, fetchAll } from '../lib/supabase.js'
import { GlobalFiltersBar, useFilters } from '../lib/FilterContext.jsx'
import { SentimentBadge, PlatformBadge, RatingStars } from '../components/StatusBadge.jsx'
import KPICard from '../components/KPICard.jsx'

const PER_PAGE = 20

function normalizeSentiment(raw) {
  if (!raw) return null
  const lower = raw.toLowerCase()
  if (lower === 'positive' || lower === 'positif') return 'Positive'
  if (lower === 'negative' || lower === 'negatif' || lower === 'négatif') return 'Negative'
  if (lower === 'neutral' || lower === 'neutre') return 'Neutral'
  return raw
}

function normalizeRow(row, sourceTable) {
  return {
    ...row,
    source_table: sourceTable,
    sentiment: normalizeSentiment(row.sentiment || row.sentiment_detected),
    date: row.date || row.created_at || null,
    text: row.text || row.content || row.review_text || '',
    platform: row.platform || '-',
    rating: row.rating ? Number(row.rating) : null,
    store_name: row.store_name || row.location || '-',
    store_city: row.store_city || null,
    category: row.category || null,
    severity: row.severity || null,
    owner_response: row.owner_response || null,
  }
}

function SeverityBadge({ value }) {
  if (!value) return null
  const map = {
    critical: 'badge-severity-critical',
    high: 'badge-severity-high',
    medium: 'badge-severity-medium',
    low: 'badge-severity-low',
  }
  const labels = { critical: 'Critique', high: 'Haute', medium: 'Moyenne', low: 'Basse' }
  return <span className={`badge ${map[value] || ''}`}>{labels[value] || value}</span>
}

function CategoryBadge({ value }) {
  if (!value) return null
  return <span className="badge badge-blue">{value}</span>
}

export default function Verbatims() {
  const [allData, setAllData] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('tous')
  const [localCategory, setLocalCategory] = useState('all')
  const [localCity, setLocalCity] = useState('all')
  const [page, setPage] = useState(0)
  const { applyFilters } = useFilters()

  useEffect(() => {
    Promise.all([
      supabase.from('scraping_brand').select('*').order('date', { ascending: false }).limit(5000),
      supabase.from('voix_client_cx').select('*').order('date', { ascending: false }).limit(5000),
      supabase.from('reputation_crise').select('*').order('date', { ascending: false }).limit(5000),
    ]).then(([sb, vc, rc]) => {
      const rows = [
        ...(sb.data || []).map(r => normalizeRow(r, 'scraping_brand')),
        ...(vc.data || []).map(r => normalizeRow(r, 'voix_client_cx')),
        ...(rc.data || []).map(r => normalizeRow(r, 'reputation_crise')),
      ]
      rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      setAllData(rows)
      setLoading(false)
    })
  }, [])

  const globalFiltered = useMemo(() => applyFilters(allData), [allData, applyFilters])

  const categories = useMemo(() => {
    const set = new Set()
    globalFiltered.forEach(r => { if (r.category) set.add(r.category) })
    return [...set].sort()
  }, [globalFiltered])

  const cities = useMemo(() => {
    const set = new Set()
    globalFiltered.forEach(r => { if (r.store_city) set.add(r.store_city) })
    return [...set].sort()
  }, [globalFiltered])

  const filtered = useMemo(() => {
    let rows = globalFiltered
    if (localCategory !== 'all') rows = rows.filter(r => r.category === localCategory)
    if (localCity !== 'all') rows = rows.filter(r => r.store_city === localCity)
    if (tab === 'critiques') rows = rows.filter(r => r.severity === 'critical' || r.severity === 'high')
    if (tab === 'positifs') rows = rows.filter(r => (r.rating >= 5 || r.sentiment === 'Positive'))
    return rows
  }, [globalFiltered, localCategory, localCity, tab])

  useEffect(() => { setPage(0) }, [tab, localCategory, localCity, globalFiltered])

  const kpis = useMemo(() => {
    const total = filtered.length
    const critical = filtered.filter(r => r.severity === 'critical' || r.severity === 'high').length
    const catCounts = {}
    filtered.forEach(r => { if (r.category) catCounts[r.category] = (catCounts[r.category] || 0) + 1 })
    const topCategory = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]
    const rated = filtered.filter(r => r.rating)
    const avgRating = rated.length > 0 ? (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1) : '-'
    return { total, critical, topCategory: topCategory ? topCategory[0] : '-', avgRating }
  }, [filtered])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const pageRows = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE)

  if (loading) return <div className="loading-wrap"><div className="spinner" /><div className="loading-text">Chargement...</div></div>

  return (
    <div>
      <GlobalFiltersBar />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { key: 'critiques', label: 'Critiques' },
            { key: 'positifs', label: 'Positifs' },
            { key: 'tous', label: 'Tous' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="filter-chip">
          <select value={localCategory} onChange={e => setLocalCategory(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: 12, cursor: 'pointer' }}>
            <option value="all">Categorie: Toutes</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="filter-chip">
          <select value={localCity} onChange={e => setLocalCity(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: 12, cursor: 'pointer' }}>
            <option value="all">Ville: Toutes</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="kpi-grid">
        <KPICard label="Verbatims affiches" value={kpis.total.toLocaleString('fr-FR')} sub="dans le filtre actif" icon="◉" color="primary" />
        <KPICard label="Critiques / Hauts" value={kpis.critical.toLocaleString('fr-FR')} sub="severite critique ou haute" icon="⚠" color="negative" />
        <KPICard label="Categorie principale" value={kpis.topCategory} sub="la plus frequente" icon="◻" color="blue" />
        <KPICard label="Note moyenne" value={kpis.avgRating !== '-' ? `${kpis.avgRating}/5` : '-'} sub="dans le filtre actif" icon="★" color={Number(kpis.avgRating) >= 4 ? 'positive' : Number(kpis.avgRating) >= 3 ? 'neutral' : 'negative'} />
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>◎</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucun verbatim ne correspond aux filtres selectionnes.</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pageRows.map((row, i) => (
              <div
                key={`${row.source_table}-${row.id || i}-${page}`}
                className="verbatim-card"
                style={{
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius)',
                  padding: '14px 18px',
                  borderLeft: row.severity === 'critical' ? '3px solid var(--critical, #EF4444)' : row.severity === 'high' ? '3px solid var(--orange, #F59E0B)' : '3px solid transparent',
                }}
              >
                <div
                  className="verbatim-text"
                  style={{
                    fontStyle: 'italic',
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: 'var(--text)',
                    marginBottom: 10,
                    maxHeight: 80,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {row.text || '-'}
                </div>

                <div
                  className="verbatim-meta"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    alignItems: 'center',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                  }}
                >
                  <span>{row.date ? new Date(row.date).toLocaleDateString('fr-FR') : '-'}</span>
                  <span style={{ opacity: 0.3 }}>|</span>
                  <span>{row.store_name}{row.store_city ? ` — ${row.store_city}` : ''}</span>
                  <span style={{ opacity: 0.3 }}>|</span>
                  <PlatformBadge value={row.platform} />
                  <RatingStars value={row.rating} />
                  <SentimentBadge value={row.sentiment} />
                  {row.category && <CategoryBadge value={row.category} />}
                  {row.severity && <SeverityBadge value={row.severity} />}
                  <span className="badge" style={{ background: 'var(--border)', color: 'var(--text-muted)', fontSize: 9 }}>
                    {row.source_table === 'scraping_brand' ? 'Scraping' : row.source_table === 'voix_client_cx' ? 'CX' : 'Reputation'}
                  </span>
                </div>

                {row.owner_response && (
                  <div
                    style={{
                      marginTop: 10,
                      marginLeft: 20,
                      padding: '10px 14px',
                      background: 'var(--bg)',
                      borderRadius: 'var(--radius)',
                      borderLeft: '2px solid var(--primary)',
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      lineHeight: 1.5,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: 'var(--primary)', marginRight: 6 }}>Reponse :</span>
                    {row.owner_response}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 20, marginBottom: 20 }}>
            <button
              className="btn btn-sm btn-ghost"
              disabled={page === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
            >
              Precedent
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Page {page + 1} / {totalPages}
            </span>
            <button
              className="btn btn-sm btn-ghost"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            >
              Suivant
            </button>
          </div>
        </>
      )}
    </div>
  )
}
