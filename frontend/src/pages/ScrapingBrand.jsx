import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import KPICard from '../components/KPICard.jsx'
import ChartCard from '../components/ChartCard.jsx'
import DataTable from '../components/DataTable.jsx'
import { SentimentBadge, PlatformBadge, RatingStars } from '../components/StatusBadge.jsx'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid, AreaChart, Area } from 'recharts'

const COLORS_PIE = { Positif: '#00B887', Negatif: '#E84393', Neutre: '#F6A623' }

export default function ScrapingBrand() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    supabase.from('scraping_brand').select('*').order('date', { ascending: false }).limit(2000)
      .then(({ data: d }) => { setData(d || []); setLoading(false) })
  }, [])

  const stats = useMemo(() => {
    const neg = data.filter(r => r.sentiment === 'Negative').length
    const pos = data.filter(r => r.sentiment === 'Positive').length
    const neu = data.filter(r => r.sentiment === 'Neutral').length
    const rated = data.filter(r => r.rating)
    const avg = rated.length > 0 ? rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length : 0
    const crisisScore = data.length > 0 ? Math.round((neg / data.length) * 100) : 0
    return { neg, pos, neu, crisisScore, avg: avg.toFixed(2), rated: rated.length, total: data.length }
  }, [data])

  const volumeByDay = useMemo(() => {
    const byDay = {}
    data.forEach(r => {
      if (!r.date) return
      const d = r.date.slice(0, 10)
      if (!byDay[d]) byDay[d] = { date: d, Positive: 0, Negative: 0, Neutral: 0 }
      if (r.sentiment) byDay[d][r.sentiment]++
    })
    return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)).slice(-60)
  }, [data])

  const platformData = useMemo(() => {
    const byPlatform = {}
    data.forEach(r => {
      if (!r.platform) return
      byPlatform[r.platform] = (byPlatform[r.platform] || 0) + 1
    })
    return Object.entries(byPlatform).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [data])

  const sentimentPie = useMemo(() => [
    { name: 'Positif', value: stats.pos },
    { name: 'Negatif', value: stats.neg },
    { name: 'Neutre', value: stats.neu },
  ].filter(e => e.value > 0), [stats])

  const categoryData = useMemo(() => {
    const cats = {}
    data.forEach(r => {
      if (!r.category) return
      if (!cats[r.category]) cats[r.category] = { name: r.category, total: 0, pos: 0, neg: 0 }
      cats[r.category].total++
      if (r.sentiment === 'Positive') cats[r.category].pos++
      if (r.sentiment === 'Negative') cats[r.category].neg++
    })
    return Object.values(cats).sort((a, b) => b.total - a.total)
  }, [data])

  const ratingTrend = useMemo(() => {
    const byMonth = {}
    data.forEach(r => {
      if (!r.date || !r.rating) return
      const m = r.date.slice(0, 7)
      if (!byMonth[m]) byMonth[m] = { month: m, sum: 0, count: 0 }
      byMonth[m].sum += Number(r.rating)
      byMonth[m].count++
    })
    return Object.values(byMonth)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({ month: m.month, avg: parseFloat((m.sum / m.count).toFixed(2)) }))
  }, [data])

  const filtered = useMemo(() => {
    if (filter === 'all') return data
    return data.filter(r => r.sentiment === filter.charAt(0).toUpperCase() + filter.slice(1))
  }, [data, filter])

  const tableColumns = [
    { key: 'date', label: 'Date', width: 100, render: v => v ? new Date(v).toLocaleDateString('fr-FR') : '—' },
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
        <div className="page-title">Scraping Marque</div>
        <div className="page-subtitle">Donnees scrapees — {stats.total.toLocaleString()} enregistrements (table scraping_brand)</div>
      </div>

      {stats.total === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: 60 }}>
            <div className="empty-icon">◻</div>
            <div className="empty-text">Aucune donnee scrapee</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Lancez un scraping depuis le Hub Scraping avec la destination "Scraping"</div>
          </div>
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <KPICard label="Mentions Scrapees" value={stats.total.toLocaleString()} sub="base scraping marque" icon="◉" color="primary" />
            <KPICard label="Score de Crise" value={`${stats.crisisScore}%`} sub={`${stats.neg} negatives`} icon="⚠" color={stats.crisisScore > 50 ? 'negative' : stats.crisisScore > 30 ? 'neutral' : 'positive'} />
            <KPICard label="Note Moyenne" value={stats.rated > 0 ? `${stats.avg}/5` : '—'} sub={`${stats.rated} notes`} icon="★" color="neutral" />
            <KPICard label="Avis Positifs" value={stats.pos} sub={`${stats.total > 0 ? Math.round(stats.pos / stats.total * 100) : 0}%`} icon="↑" color="positive" />
          </div>

          <div className="grid-2" style={{ marginBottom: 20 }}>
            <ChartCard title="Volume par sentiment" icon="◔" meta="60 derniers jours">
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
                      <span style={{ color: 'var(--text-muted)' }}>{p.value} <span style={{ fontSize: 10 }}>({Math.round(p.value / stats.total * 100)}%)</span></span>
                    </div>
                  ))}
                </div>
              </ChartCard>
            </div>
          </div>

          {ratingTrend.length > 0 && (
            <div className="grid-2" style={{ marginBottom: 20 }}>
              <ChartCard title="Evolution de la note" icon="★">
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={ratingTrend}>
                    <defs>
                      <linearGradient id="ratingGradSB" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--positive)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--positive)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(2)} />
                    <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} width={28} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} formatter={v => [`${v}/5`, 'Note moyenne']} />
                    <Area type="monotone" dataKey="avg" stroke="var(--positive)" strokeWidth={2} fill="url(#ratingGradSB)" name="Note" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Par categorie" icon="◻">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={categoryData.slice(0, 8)} layout="vertical" barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                    <Bar dataKey="pos" fill="var(--positive)" name="Positifs" stackId="a" />
                    <Bar dataKey="neg" fill="var(--negative)" name="Negatifs" stackId="a" radius={[0,3,3,0]} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <div className="card-title">◉ Donnees scrapees</div>
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
