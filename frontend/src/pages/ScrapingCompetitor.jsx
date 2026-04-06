import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import KPICard from '../components/KPICard.jsx'
import ChartCard from '../components/ChartCard.jsx'
import DataTable from '../components/DataTable.jsx'
import { SentimentBadge, PlatformBadge, RatingStars } from '../components/StatusBadge.jsx'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid, AreaChart, Area } from 'recharts'

const COLORS_PIE = { Positif: '#00B887', Negatif: '#E84393', Neutre: '#F6A623' }

export default function ScrapingCompetitor() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [brandFilter, setBrandFilter] = useState('all')

  useEffect(() => {
    supabase.from('scraping_competitor').select('*').order('date', { ascending: false }).limit(2000)
      .then(({ data: d }) => { setData(d || []); setLoading(false) })
  }, [])

  const brands = useMemo(() => {
    const set = new Set(data.map(r => r.brand).filter(Boolean))
    return [...set].sort()
  }, [data])

  const filteredByBrand = useMemo(() => {
    if (brandFilter === 'all') return data
    return data.filter(r => r.brand === brandFilter)
  }, [data, brandFilter])

  const stats = useMemo(() => {
    const d = filteredByBrand
    const neg = d.filter(r => r.sentiment === 'Negative').length
    const pos = d.filter(r => r.sentiment === 'Positive').length
    const neu = d.filter(r => r.sentiment === 'Neutral').length
    const rated = d.filter(r => r.rating)
    const avg = rated.length > 0 ? rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length : 0
    const crisisScore = d.length > 0 ? Math.round((neg / d.length) * 100) : 0
    return { neg, pos, neu, crisisScore, avg: avg.toFixed(2), rated: rated.length, total: d.length }
  }, [filteredByBrand])

  const volumeByDay = useMemo(() => {
    const byDay = {}
    filteredByBrand.forEach(r => {
      if (!r.date) return
      const d = r.date.slice(0, 10)
      if (!byDay[d]) byDay[d] = { date: d, Positive: 0, Negative: 0, Neutral: 0 }
      if (r.sentiment) byDay[d][r.sentiment]++
    })
    return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)).slice(-60)
  }, [filteredByBrand])

  const brandComparison = useMemo(() => {
    const byBrand = {}
    data.forEach(r => {
      if (!r.brand) return
      if (!byBrand[r.brand]) byBrand[r.brand] = { name: r.brand, total: 0, pos: 0, neg: 0, sumRating: 0, countRating: 0 }
      byBrand[r.brand].total++
      if (r.sentiment === 'Positive') byBrand[r.brand].pos++
      if (r.sentiment === 'Negative') byBrand[r.brand].neg++
      if (r.rating) { byBrand[r.brand].sumRating += Number(r.rating); byBrand[r.brand].countRating++ }
    })
    return Object.values(byBrand)
      .map(b => ({ ...b, avgRating: b.countRating > 0 ? (b.sumRating / b.countRating).toFixed(1) : '—', negPct: b.total > 0 ? Math.round(b.neg / b.total * 100) : 0 }))
      .sort((a, b) => b.total - a.total)
  }, [data])

  const sentimentPie = useMemo(() => [
    { name: 'Positif', value: stats.pos },
    { name: 'Negatif', value: stats.neg },
    { name: 'Neutre', value: stats.neu },
  ].filter(e => e.value > 0), [stats])

  const platformData = useMemo(() => {
    const byPlatform = {}
    filteredByBrand.forEach(r => {
      if (!r.platform) return
      byPlatform[r.platform] = (byPlatform[r.platform] || 0) + 1
    })
    return Object.entries(byPlatform).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [filteredByBrand])

  const filtered = useMemo(() => {
    if (filter === 'all') return filteredByBrand
    return filteredByBrand.filter(r => r.sentiment === filter.charAt(0).toUpperCase() + filter.slice(1))
  }, [filteredByBrand, filter])

  const tableColumns = [
    { key: 'date', label: 'Date', width: 100, render: v => v ? new Date(v).toLocaleDateString('fr-FR') : '—' },
    { key: 'brand', label: 'Concurrent', render: v => v ? <span className="badge" style={{ background: '#E1705520', color: '#E17055', fontWeight: 600 }}>{v}</span> : '—' },
    { key: 'platform', label: 'Plateforme', render: v => <PlatformBadge value={v} /> },
    { key: 'category', label: 'Categorie', render: v => v ? <span className="badge badge-blue">{v}</span> : '—' },
    { key: 'text', label: 'Texte', truncate: true },
    { key: 'rating', label: 'Note', render: v => <RatingStars value={v} /> },
    { key: 'sentiment', label: 'Sentiment', render: v => <SentimentBadge value={v} /> },
  ]

  if (loading) return <div className="loading-wrap"><div className="spinner" /><div className="loading-text">Chargement...</div></div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Scraping Concurrents</div>
        <div className="page-subtitle">Veille concurrentielle scrapee — {data.length.toLocaleString()} enregistrements (table scraping_competitor)</div>
      </div>

      {data.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: 60 }}>
            <div className="empty-icon">◻</div>
            <div className="empty-text">Aucune donnee concurrentielle</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Lancez un scraping depuis le Hub Scraping avec la destination "Concurrents"</div>
          </div>
        </div>
      ) : (
        <>
          {/* Brand filter */}
          {brands.length > 1 && (
            <div style={{ marginBottom: 16, display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 4 }}>Concurrent :</span>
              <button onClick={() => setBrandFilter('all')} className={`btn btn-sm ${brandFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}>Tous</button>
              {brands.map(b => (
                <button key={b} onClick={() => setBrandFilter(b)} className={`btn btn-sm ${brandFilter === b ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ borderColor: brandFilter === b ? '#E17055' : undefined, color: brandFilter === b ? '#E17055' : undefined }}
                >{b}</button>
              ))}
            </div>
          )}

          <div className="kpi-grid">
            <KPICard label="Mentions Concurrents" value={stats.total.toLocaleString()} sub="base scraping concurrents" icon="◎" color="primary" />
            <KPICard label="Negativite" value={`${stats.crisisScore}%`} sub={`${stats.neg} negatives`} icon="⚠" color={stats.crisisScore > 50 ? 'negative' : stats.crisisScore > 30 ? 'neutral' : 'positive'} />
            <KPICard label="Note Moyenne" value={stats.rated > 0 ? `${stats.avg}/5` : '—'} sub={`${stats.rated} notes`} icon="★" color="neutral" />
            <KPICard label="Concurrents Suivis" value={brands.length} sub="marques distinctes" icon="◈" color="blue" />
          </div>

          <div className="grid-2" style={{ marginBottom: 20 }}>
            <ChartCard title="Volume par sentiment" icon="◔">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={volumeByDay} barSize={6}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={d => d.slice(5)} interval={6} />
                  <YAxis tick={{ fontSize: 10 }} width={28} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                  <Bar dataKey="Positive" stackId="a" fill="#00B887" name="Positif" />
                  <Bar dataKey="Neutral" stackId="a" fill="#F6A623" name="Neutre" />
                  <Bar dataKey="Negative" stackId="a" fill="#E84393" name="Negatif" radius={[3,3,0,0]} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <ChartCard title="Sentiment" icon="◐">
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie data={sentimentPie} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3} dataKey="value">
                      {sentimentPie.map(entry => (
                        <Cell key={entry.name} fill={COLORS_PIE[entry.name] || '#aaa'} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Plateformes" icon="◈">
                <div style={{ padding: '0 0 8px' }}>
                  {platformData.slice(0, 5).map(p => (
                    <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border-light)', fontSize: 12 }}>
                      <span style={{ fontWeight: 500 }}>{p.name}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{p.value}</span>
                    </div>
                  ))}
                </div>
              </ChartCard>
            </div>
          </div>

          {/* Brand comparison */}
          {brandComparison.length > 1 && (
            <ChartCard title="Comparaison concurrents" icon="◎" style={{ marginBottom: 20 }}>
              <ResponsiveContainer width="100%" height={Math.max(120, brandComparison.length * 40)}>
                <BarChart data={brandComparison} layout="vertical" barSize={16}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                  <Bar dataKey="pos" fill="#00B887" name="Positifs" stackId="a" />
                  <Bar dataKey="neg" fill="#E84393" name="Negatifs" stackId="a" radius={[0,3,3,0]} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          <div className="card">
            <div className="card-header">
              <div className="card-title">◉ Donnees concurrentielles</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['all', 'negative', 'positive', 'neutral'].map(f => (
                  <button key={f} onClick={() => setFilter(f)} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}>
                    {f === 'all' ? 'Tout' : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <DataTable columns={tableColumns} rows={filtered.slice(0, 50)} emptyMessage="Aucune donnee" />
            {filtered.length > 50 && (
              <div style={{ padding: '10px 20px', fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border-light)' }}>
                Affichage 50/{filtered.length}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
