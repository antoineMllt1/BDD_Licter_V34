import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import KPICard from '../components/KPICard.jsx'
import ChartCard from '../components/ChartCard.jsx'
import DataTable from '../components/DataTable.jsx'
import { SentimentBadge, PlatformBadge } from '../components/StatusBadge.jsx'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid, AreaChart, Area } from 'recharts'

const SENTIMENT_COLORS = { Positive: '#10B981', Negative: '#F43F5E', Neutral: '#F59E0B' }
const PLATFORM_COLORS = {
  'Twitter/X': '#1DA1F2',
  'TikTok': '#FF0050',
  'Facebook': '#1877F2',
  'Reddit': '#FF4500',
}
const BRAND_COLOR = 'var(--primary)'
const COMPETITOR_COLOR = '#F97316'
const ALL_PLATFORMS = ['Twitter/X', 'TikTok', 'Facebook', 'Reddit']

function computeStats(rows) {
  const byPlatform = {}
  ALL_PLATFORMS.forEach(p => { byPlatform[p] = rows.filter(r => r.platform === p).length })
  const twitter = byPlatform['Twitter/X']
  const tiktok = byPlatform['TikTok']
  const facebook = byPlatform['Facebook']
  const neg = rows.filter(r => r.sentiment === 'Negative').length
  const pos = rows.filter(r => r.sentiment === 'Positive').length
  const neu = rows.filter(r => r.sentiment === 'Neutral').length
  const enriched = rows.filter(r => r.insight_ready).length
  const totalLikes = rows.reduce((s, r) => s + (r.likes || 0), 0)
  const totalShares = rows.reduce((s, r) => s + (r.shares || 0), 0)
  const totalReplies = rows.reduce((s, r) => s + (r.replies || 0), 0)
  const totalViews = rows.reduce((s, r) => s + (r.views || 0), 0)
  const verified = rows.filter(r => r.is_verified).length
  const avgFollowers = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + (r.author_followers || 0), 0) / rows.length) : 0
  const negPct = rows.length > 0 ? Math.round((neg / rows.length) * 100) : 0
  const enrichPct = rows.length > 0 ? Math.round((enriched / rows.length) * 100) : 0
  return { twitter, tiktok, facebook, byPlatform, neg, pos, neu, enriched, totalLikes, totalShares, totalReplies, totalViews, verified, avgFollowers, negPct, enrichPct, total: rows.length }
}

export default function SocialMedia() {
  const [brandData, setBrandData] = useState([])
  const [competitorData, setCompetitorData] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('brand') // 'brand' | 'competitor' | 'compare'
  const [platformFilter, setPlatformFilter] = useState('all')
  const [sentimentFilter, setSentimentFilter] = useState('all')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 25

  useEffect(() => {
    Promise.all([
      supabase.from('social_mentions').select('*').order('date', { ascending: false }).limit(3000),
      supabase.from('social_mentions_competitor').select('*').order('date', { ascending: false }).limit(3000)
    ]).then(([brand, comp]) => {
      setBrandData(brand.data || [])
      setCompetitorData(comp.data || [])
      setLoading(false)
    })
  }, [])

  const activeData = view === 'competitor' ? competitorData : brandData

  const filtered = useMemo(() => {
    let rows = activeData
    if (platformFilter !== 'all') rows = rows.filter(r => r.platform === platformFilter)
    if (sentimentFilter !== 'all') rows = rows.filter(r => r.sentiment === sentimentFilter)
    return rows
  }, [activeData, platformFilter, sentimentFilter])

  const brandStats = useMemo(() => computeStats(brandData), [brandData])
  const compStats = useMemo(() => computeStats(competitorData), [competitorData])
  const activeStats = view === 'competitor' ? compStats : brandStats

  // Volume by day for active view
  const volumeByDay = useMemo(() => {
    const byDay = {}
    filtered.forEach(r => {
      if (!r.date) return
      const d = r.date.slice(0, 10)
      if (!byDay[d]) {
        byDay[d] = { date: d }
        ALL_PLATFORMS.forEach(p => { byDay[d][p] = 0 })
      }
      if (r.platform && byDay[d][r.platform] !== undefined) byDay[d][r.platform]++
    })
    return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)).slice(-60)
  }, [filtered])

  // Sentiment by day for active view
  const sentimentByDay = useMemo(() => {
    const byDay = {}
    filtered.forEach(r => {
      if (!r.date || !r.sentiment) return
      const d = r.date.slice(0, 10)
      if (!byDay[d]) byDay[d] = { date: d, Positive: 0, Negative: 0, Neutral: 0 }
      byDay[d][r.sentiment]++
    })
    return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)).slice(-60)
  }, [filtered])

  // Compare: sentiment by category brand vs competitor
  const compareCategoryData = useMemo(() => {
    if (view !== 'compare') return []
    const brandCats = {}
    const compCats = {}
    brandData.filter(r => r.category).forEach(r => { brandCats[r.category] = (brandCats[r.category] || 0) + 1 })
    competitorData.filter(r => r.category).forEach(r => { compCats[r.category] = (compCats[r.category] || 0) + 1 })
    const allCats = [...new Set([...Object.keys(brandCats), ...Object.keys(compCats)])]
    return allCats.map(cat => ({ category: cat, Marque: brandCats[cat] || 0, Concurrent: compCats[cat] || 0 })).sort((a, b) => (b.Marque + b.Concurrent) - (a.Marque + a.Concurrent)).slice(0, 10)
  }, [view, brandData, competitorData])

  // Compare: sentiment split
  const compareSentimentData = useMemo(() => {
    if (view !== 'compare') return []
    return [
      { name: 'Positif', Marque: brandStats.pos, Concurrent: compStats.pos },
      { name: 'Neutre', Marque: brandStats.neu, Concurrent: compStats.neu },
      { name: 'Negatif', Marque: brandStats.neg, Concurrent: compStats.neg },
    ]
  }, [view, brandStats, compStats])

  // Compare: engagement
  const compareEngagementData = useMemo(() => {
    if (view !== 'compare') return []
    return [
      { name: 'Likes', Marque: brandStats.totalLikes, Concurrent: compStats.totalLikes },
      { name: 'Partages', Marque: brandStats.totalShares, Concurrent: compStats.totalShares },
      { name: 'Reponses', Marque: brandStats.totalReplies, Concurrent: compStats.totalReplies },
    ]
  }, [view, brandStats, compStats])

  // Compare: volume by day overlay
  const compareVolumeByDay = useMemo(() => {
    if (view !== 'compare') return []
    const byDay = {}
    brandData.forEach(r => {
      if (!r.date) return
      const d = r.date.slice(0, 10)
      if (!byDay[d]) byDay[d] = { date: d, Marque: 0, Concurrent: 0 }
      byDay[d].Marque++
    })
    competitorData.forEach(r => {
      if (!r.date) return
      const d = r.date.slice(0, 10)
      if (!byDay[d]) byDay[d] = { date: d, Marque: 0, Concurrent: 0 }
      byDay[d].Concurrent++
    })
    return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)).slice(-60)
  }, [view, brandData, competitorData])

  const sentimentPie = useMemo(() => [
    { name: 'Positif', value: activeStats.pos, color: SENTIMENT_COLORS.Positive },
    { name: 'Negatif', value: activeStats.neg, color: SENTIMENT_COLORS.Negative },
    { name: 'Neutre', value: activeStats.neu, color: SENTIMENT_COLORS.Neutral },
  ].filter(e => e.value > 0), [activeStats])

  const topAuthors = useMemo(() => {
    const counts = {}
    filtered.filter(r => r.author).forEach(r => {
      const key = r.author
      if (!counts[key]) counts[key] = { name: key, mentions: 0, followers: r.author_followers || 0, platform: r.platform }
      counts[key].mentions++
      counts[key].followers = Math.max(counts[key].followers, r.author_followers || 0)
    })
    return Object.values(counts).sort((a, b) => b.followers - a.followers).slice(0, 10)
  }, [filtered])

  const pagedRows = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page])
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const tableColumns = [
    { key: 'date', label: 'Date', width: 90, render: v => v ? new Date(v).toLocaleDateString('fr-FR') : '—' },
    { key: 'platform', label: 'Source', width: 90, render: v => <PlatformBadge value={v} /> },
    { key: 'brand', label: 'Marque', width: 100 },
    { key: 'author', label: 'Auteur', width: 120, render: (v, row) => v ? (
      <span style={{ fontWeight: 500 }}>{row.platform === 'Twitter/X' ? `@${v}` : v}{row.is_verified ? ' ✓' : ''}</span>
    ) : '—' },
    { key: 'text', label: 'Contenu', truncate: true },
    { key: 'sentiment', label: 'Sentiment', width: 90, render: v => v ? <SentimentBadge value={v} /> : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>En attente</span> },
    { key: 'likes', label: 'Likes', width: 55, render: v => (v || 0).toLocaleString() },
    { key: 'shares', label: 'Partages', width: 65, render: v => (v || 0).toLocaleString() },
    { key: 'location', label: 'Lieu', width: 100, render: v => v || '—' },
  ]

  if (loading) return (
    <div className="loading-state">
      <div className="loading-spinner" />
      <p>Chargement des mentions sociales...</p>
    </div>
  )

  return (
    <div className="page-content">
      {/* View Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { key: 'brand', label: 'Marque', color: BRAND_COLOR, count: brandStats.total },
          { key: 'competitor', label: 'Concurrent', color: COMPETITOR_COLOR, count: compStats.total },
          { key: 'compare', label: 'Comparaison', color: '#1E1B3A', count: null },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => { setView(tab.key); setPage(0) }}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: view === tab.key ? `2px solid ${tab.color}` : '2px solid var(--border)',
              background: view === tab.key ? `${tab.color}10` : 'white',
              color: view === tab.key ? tab.color : 'var(--text-muted)',
              fontWeight: view === tab.key ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all .2s'
            }}
          >
            {tab.label}{tab.count !== null ? ` (${tab.count})` : ''}
          </button>
        ))}
      </div>

      {/* ============ COMPARE VIEW ============ */}
      {view === 'compare' && (
        <>
          {/* Side-by-side KPIs */}
          <div className="kpi-grid">
            <KPICard label="Mentions Marque" value={brandStats.total.toLocaleString()} sub={`X: ${brandStats.twitter} · TT: ${brandStats.tiktok} · FB: ${brandStats.facebook}`} color="primary" />
            <KPICard label="Mentions Concurrent" value={compStats.total.toLocaleString()} sub={`X: ${compStats.twitter} · TT: ${compStats.tiktok} · FB: ${compStats.facebook}`} color="neutral" />
            <KPICard label="% Negatif Marque" value={`${brandStats.negPct}%`} sub={`${brandStats.neg} mentions`} color={brandStats.negPct > 30 ? 'negative' : 'positive'} />
            <KPICard label="% Negatif Concurrent" value={`${compStats.negPct}%`} sub={`${compStats.neg} mentions`} color={compStats.negPct > 30 ? 'negative' : 'positive'} />
            <KPICard label="Engagement Marque" value={(brandStats.totalLikes + brandStats.totalShares).toLocaleString()} sub={`${brandStats.totalLikes} likes`} color="primary" />
            <KPICard label="Engagement Concurrent" value={(compStats.totalLikes + compStats.totalShares).toLocaleString()} sub={`${compStats.totalLikes} likes`} color="neutral" />
          </div>

          {/* Compare: Volume overlay */}
          <div className="grid-2">
            <ChartCard title="Volume compare par jour">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={compareVolumeByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="Marque" stroke={BRAND_COLOR} fill={BRAND_COLOR} fillOpacity={0.3} />
                  <Area type="monotone" dataKey="Concurrent" stroke={COMPETITOR_COLOR} fill={COMPETITOR_COLOR} fillOpacity={0.3} />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Sentiment compare">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={compareSentimentData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="Marque" fill={BRAND_COLOR} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Concurrent" fill={COMPETITOR_COLOR} radius={[4, 4, 0, 0]} />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid-2">
            <ChartCard title="Engagement compare">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={compareEngagementData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="Marque" fill={BRAND_COLOR} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Concurrent" fill={COMPETITOR_COLOR} radius={[4, 4, 0, 0]} />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {compareCategoryData.length > 0 && (
              <ChartCard title="Categories comparees (IA)">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={compareCategoryData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={130} />
                    <Tooltip />
                    <Bar dataKey="Marque" fill={BRAND_COLOR} radius={[0, 4, 4, 0]} />
                    <Bar dataKey="Concurrent" fill={COMPETITOR_COLOR} radius={[0, 4, 4, 0]} />
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>
        </>
      )}

      {/* ============ BRAND / COMPETITOR VIEW ============ */}
      {view !== 'compare' && (
        <>
          {/* Filters */}
          <div className="filters-bar">
            <select value={platformFilter} onChange={e => { setPlatformFilter(e.target.value); setPage(0) }}>
              <option value="all">Toutes les plateformes</option>
              <option value="Twitter/X">Twitter / X</option>
              <option value="TikTok">TikTok</option>
              <option value="Facebook">Facebook</option>
              <option value="Reddit">Reddit</option>
            </select>
            <select value={sentimentFilter} onChange={e => { setSentimentFilter(e.target.value); setPage(0) }}>
              <option value="all">Tous les sentiments</option>
              <option value="Positive">Positif</option>
              <option value="Negative">Negatif</option>
              <option value="Neutral">Neutre</option>
            </select>
            <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-muted)' }}>
              {filtered.length.toLocaleString()} mentions
            </span>
          </div>

          {/* KPIs */}
          <div className="kpi-grid">
            <KPICard label="Mentions totales" value={activeStats.total.toLocaleString()} sub={`X: ${activeStats.twitter} · TikTok: ${activeStats.tiktok} · FB: ${activeStats.facebook}`} color="primary" />
            <KPICard label="Engagement total" value={(activeStats.totalLikes + activeStats.totalShares + activeStats.totalReplies).toLocaleString()} sub={`${activeStats.totalLikes.toLocaleString()} likes · ${activeStats.totalViews.toLocaleString()} vues`} color="blue" />
            <KPICard label="Sentiment negatif" value={activeStats.total > 0 ? `${activeStats.negPct}%` : '—'} sub={`${activeStats.neg} mentions negatives`} color={activeStats.negPct > 30 ? 'negative' : 'neutral'} />
            <KPICard label="Enrichissement IA" value={`${activeStats.enrichPct}%`} sub={`${activeStats.enriched} / ${activeStats.total} traites`} color={activeStats.enrichPct > 80 ? 'positive' : activeStats.enrichPct > 40 ? 'neutral' : 'negative'} />
            <KPICard label="Comptes verifies" value={activeStats.verified} sub={`Followers moy. ${activeStats.avgFollowers.toLocaleString()}`} color="primary" />
            <KPICard label="Vues TikTok + videos" value={activeStats.totalViews.toLocaleString()} sub={`${activeStats.totalReplies.toLocaleString()} reponses`} color="blue" />
          </div>

          {/* Charts Row 1 */}
          <div className="grid-2">
            <ChartCard title="Volume par jour">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={volumeByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  {ALL_PLATFORMS.map(p => (
                    <Area key={p} type="monotone" dataKey={p} stackId="1" stroke={PLATFORM_COLORS[p]} fill={PLATFORM_COLORS[p]} fillOpacity={0.4} />
                  ))}
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Repartition sentiment">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={sentimentPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {sentimentPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Charts Row 2 */}
          <div className="grid-2">
            <ChartCard title="Sentiment dans le temps">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={sentimentByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="Positive" stackId="1" stroke={SENTIMENT_COLORS.Positive} fill={SENTIMENT_COLORS.Positive} fillOpacity={0.4} />
                  <Area type="monotone" dataKey="Neutral" stackId="1" stroke={SENTIMENT_COLORS.Neutral} fill={SENTIMENT_COLORS.Neutral} fillOpacity={0.4} />
                  <Area type="monotone" dataKey="Negative" stackId="1" stroke={SENTIMENT_COLORS.Negative} fill={SENTIMENT_COLORS.Negative} fillOpacity={0.4} />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Auteurs les plus visibles">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={topAuthors.slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip />
                  <Bar dataKey="followers" fill="var(--primary)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Top Authors */}
          {topAuthors.length > 0 && (
            <ChartCard title="Top auteurs par influence">
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Auteur</th>
                      <th>Plateforme</th>
                      <th>Mentions</th>
                      <th>Followers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topAuthors.map((a, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{['Twitter/X', 'TikTok'].includes(a.platform) ? `@${a.name}` : a.name}</td>
                        <td><PlatformBadge value={a.platform} /></td>
                        <td>{a.mentions}</td>
                        <td>{a.followers.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          )}

          {/* Data Table */}
          <ChartCard title={`Mentions recentes (${filtered.length})`}>
            <DataTable columns={tableColumns} rows={pagedRows} rowKey="review_id" emptyMessage="Aucune mention sociale trouvee. Lancez un scrape depuis le Hub Scraping." />
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '16px 0', fontSize: 13 }}>
                <button className="btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Precedent</button>
                <span style={{ color: 'var(--text-muted)' }}>Page {page + 1} / {totalPages}</span>
                <button className="btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Suivant</button>
              </div>
            )}
          </ChartCard>
        </>
      )}
    </div>
  )
}
