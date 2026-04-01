import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import KPICard from '../components/KPICard.jsx'
import ChartCard from '../components/ChartCard.jsx'
import DataTable from '../components/DataTable.jsx'
import { SentimentBadge, PlatformBadge, RatingStars } from '../components/StatusBadge.jsx'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts'

export default function CX() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('irritants')

  useEffect(() => {
    supabase.from('voix_client_cx').select('*').order('date', { ascending: false }).limit(2000)
      .then(({ data: d }) => { setData(d || []); setLoading(false) })
  }, [])

  const stats = useMemo(() => {
    const rated = data.filter(r => r.rating)
    const avg = rated.length > 0 ? rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length : 0
    const pos = data.filter(r => r.sentiment === 'Positive').length
    const neg = data.filter(r => r.sentiment === 'Negative').length
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    rated.forEach(r => { const n = Math.round(Number(r.rating)); if (dist[n] !== undefined) dist[n]++ })
    return { avg: avg.toFixed(2), rated: rated.length, total: data.length, pos, neg, dist }
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

  const categoryData = useMemo(() => {
    const cats = {}
    data.forEach(r => {
      if (!r.category) return
      if (!cats[r.category]) cats[r.category] = { name: r.category, total: 0, pos: 0, neg: 0, sumRating: 0, countRating: 0 }
      cats[r.category].total++
      if (r.sentiment === 'Positive') cats[r.category].pos++
      if (r.sentiment === 'Negative') cats[r.category].neg++
      if (r.rating) { cats[r.category].sumRating += Number(r.rating); cats[r.category].countRating++ }
    })
    return Object.values(cats)
      .map(c => ({ ...c, avgRating: c.countRating > 0 ? (c.sumRating / c.countRating).toFixed(1) : null, negPct: Math.round(c.neg / c.total * 100) }))
      .sort((a, b) => b.total - a.total)
  }, [data])

  const ratingDist = useMemo(() => [1,2,3,4,5].map(n => ({ star: `${n}★`, count: stats.dist[n] || 0 })), [stats])

  const topIrritants = useMemo(() =>
    data.filter(r => r.sentiment === 'Negative' && r.text).slice(0, 10)
  , [data])

  const topEnchantements = useMemo(() =>
    data.filter(r => r.sentiment === 'Positive' && r.text).slice(0, 10)
  , [data])

  const tableColumns = [
    { key: 'date', label: 'Date', render: v => v ? new Date(v).toLocaleDateString('fr-FR') : '—' },
    { key: 'platform', label: 'Plateforme', render: v => <PlatformBadge value={v} /> },
    { key: 'category', label: 'Catégorie', render: v => v ? <span className="badge badge-blue">{v}</span> : '—' },
    { key: 'text', label: 'Avis', truncate: true },
    { key: 'rating', label: 'Note', render: v => <RatingStars value={v} /> },
    { key: 'sentiment', label: 'Sentiment', render: v => <SentimentBadge value={v} /> },
  ]

  if (loading) return <div className="loading-wrap"><div className="spinner" /><div className="loading-text">Chargement…</div></div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Expérience Client</div>
        <div className="page-subtitle">{stats.total.toLocaleString()} avis analysés</div>
      </div>

      <div className="kpi-grid">
        <KPICard label="Note Moyenne" value={`${stats.avg}/5`} sub={`${stats.rated} avis notés`} icon="★" color={Number(stats.avg) >= 4 ? 'positive' : Number(stats.avg) >= 3 ? 'neutral' : 'negative'} />
        <KPICard label="Avis Positifs" value={stats.pos} sub={`${Math.round(stats.pos / stats.total * 100)}% des avis`} icon="↑" color="positive" />
        <KPICard label="Avis Négatifs" value={stats.neg} sub={`${Math.round(stats.neg / stats.total * 100)}% des avis`} icon="↓" color="negative" />
        <KPICard label="Catégories" value={categoryData.length} sub="segments d'expérience" icon="◻" color="blue" />
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <ChartCard title="Évolution de la note dans le temps" icon="📈">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={ratingTrend}>
              <defs>
                <linearGradient id="ratingGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--positive)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--positive)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(2)} />
              <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} width={28} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} formatter={v => [`${v}/5`, 'Note moyenne']} />
              <Area type="monotone" dataKey="avg" stroke="var(--positive)" strokeWidth={2} fill="url(#ratingGrad)" name="Note" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Distribution des notes" icon="★">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={ratingDist} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
              <XAxis dataKey="star" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} width={35} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
              <Bar dataKey="count" name="Avis" radius={[4,4,0,0]}
                fill="var(--neutral)"
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Performance par catégorie d'expérience" icon="◻" meta="% négatif" style={{ marginBottom: 20 }}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={categoryData.slice(0, 10)} layout="vertical" barSize={14}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
            <Bar dataKey="pos" fill="var(--positive)" name="Positifs" stackId="a" />
            <Bar dataKey="neg" fill="var(--negative)" name="Négatifs" stackId="a" radius={[0,3,3,0]} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="card">
        <div className="card-header">
          <div className="card-title">◉ Verbatims clients</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setView('irritants')} className={`btn btn-sm ${view === 'irritants' ? 'btn-danger' : 'btn-ghost'}`}>↓ Top Irritants</button>
            <button onClick={() => setView('enchantements')} className={`btn btn-sm ${view === 'enchantements' ? 'btn-success' : 'btn-ghost'}`}>↑ Top Enchantements</button>
            <button onClick={() => setView('all')} className={`btn btn-sm ${view === 'all' ? 'btn-primary' : 'btn-ghost'}`}>Tout</button>
          </div>
        </div>
        <DataTable
          columns={tableColumns}
          rows={view === 'irritants' ? topIrritants : view === 'enchantements' ? topEnchantements : data.slice(0, 50)}
        />
      </div>
    </div>
  )
}
