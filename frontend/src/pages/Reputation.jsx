import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import KPICard from '../components/KPICard.jsx'
import ChartCard from '../components/ChartCard.jsx'
import DataTable from '../components/DataTable.jsx'
import { SentimentBadge, PlatformBadge, RatingStars } from '../components/StatusBadge.jsx'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid } from 'recharts'

const COLORS_PIE = { Positive: '#10B981', Negative: '#F43F5E', Neutral: '#F59E0B' }

export default function Reputation() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    supabase.from('reputation_crise').select('*').order('date', { ascending: false }).limit(2000)
      .then(({ data: d }) => { setData(d || []); setLoading(false) })
  }, [])

  const stats = useMemo(() => {
    const neg = data.filter(r => r.sentiment === 'Negative').length
    const pos = data.filter(r => r.sentiment === 'Positive').length
    const neu = data.filter(r => r.sentiment === 'Neutral').length
    const crisisScore = data.length > 0 ? Math.round((neg / data.length) * 100) : 0
    const totalEngagement = data.reduce((s, r) => s + (r.likes || 0) + (r.share_count || 0), 0)
    const verified = data.filter(r => r.is_verified).length
    return { neg, pos, neu, crisisScore, totalEngagement, verified, total: data.length }
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

  const sentimentPie = useMemo(() => {
    return [
      { name: 'Positif', value: stats.pos },
      { name: 'Négatif', value: stats.neg },
      { name: 'Neutre', value: stats.neu },
    ].filter(e => e.value > 0)
  }, [stats])

  const crisisLevel = stats.crisisScore > 60 ? { label: 'CRITIQUE', color: 'var(--negative)', bg: 'var(--negative-light)' }
    : stats.crisisScore > 35 ? { label: 'MODÉRÉ', color: 'var(--neutral)', bg: 'var(--neutral-light)' }
    : { label: 'FAIBLE', color: 'var(--positive)', bg: 'var(--positive-light)' }

  const filtered = useMemo(() => {
    if (filter === 'all') return data
    if (filter === 'crisis') return data.filter(r => r.sentiment === 'Negative' && (r.likes > 50 || r.share_count > 20))
    return data.filter(r => r.sentiment === filter.charAt(0).toUpperCase() + filter.slice(1))
  }, [data, filter])

  const tableColumns = [
    { key: 'date', label: 'Date', width: 100, render: v => v ? new Date(v).toLocaleDateString('fr-FR') : '—' },
    { key: 'platform', label: 'Plateforme', render: v => <PlatformBadge value={v} /> },
    { key: 'text', label: 'Texte', truncate: true },
    { key: 'sentiment', label: 'Sentiment', render: v => <SentimentBadge value={v} /> },
    { key: 'likes', label: 'Likes', width: 60, render: v => (v || 0).toLocaleString() },
    { key: 'share_count', label: 'Partages', width: 70, render: v => (v || 0).toLocaleString() },
    { key: 'is_verified', label: 'Vérifié', width: 70, render: v => v ? '✓' : '—' },
  ]

  if (loading) return (
    <div>
      <div className="kpi-grid">
        {[1, 2, 3, 4].map(i => <div key={i} className="skeleton skeleton-kpi" />)}
      </div>
      <div className="grid-2" style={{ marginTop: 20 }}>
        <div className="skeleton skeleton-chart" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="skeleton skeleton-chart" style={{ height: 160 }} />
          <div className="skeleton skeleton-chart" style={{ height: 120 }} />
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <div className="kpi-grid">
        <KPICard label="Mentions Totales" value={stats.total.toLocaleString()} valueStyle={{ fontVariantNumeric: 'tabular-nums' }} sub="toutes plateformes" icon="◈" color="primary" />
        <KPICard label="Score de Crise" value={`${stats.crisisScore}%`} valueStyle={{ fontVariantNumeric: 'tabular-nums' }} sub={`Niveau: ${crisisLevel.label}`} icon="⚠" color={stats.crisisScore > 50 ? 'negative' : stats.crisisScore > 30 ? 'neutral' : 'positive'} />
        <KPICard label="Engagement Total" value={stats.totalEngagement.toLocaleString()} valueStyle={{ fontVariantNumeric: 'tabular-nums' }} sub="likes + partages" icon="♥" color="blue" />
        <KPICard label="Comptes Vérifiés" value={stats.verified} valueStyle={{ fontVariantNumeric: 'tabular-nums' }} sub={`${Math.round(stats.verified / stats.total * 100)}% des auteurs`} icon="✓" color="neutral" />
      </div>

      {/* Crisis Alert Banner */}
      {stats.crisisScore > 40 && (
        <div style={{ background: crisisLevel.bg, border: `1px solid ${crisisLevel.color}33`, borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: crisisLevel.color }}>Alerte Crise — Niveau {crisisLevel.label}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {stats.neg} mentions négatives détectées ({stats.crisisScore}%). Surveillance renforcée recommandée.
            </div>
          </div>
        </div>
      )}

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <ChartCard title="Volume de mentions par sentiment" icon="📊" meta="60 derniers jours">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={volumeByDay} barSize={6}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={d => d.slice(5)} interval={6} />
              <YAxis tick={{ fontSize: 10 }} width={28} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #ECEEF6', borderRadius: 8, fontSize: 12, color: '#1E1B3A' }} labelFormatter={l => `Date: ${l}`} />
              <Bar dataKey="Positive" stackId="a" fill="#10B981" name="Positif" />
              <Bar dataKey="Neutral" stackId="a" fill="#F59E0B" name="Neutre" />
              <Bar dataKey="Negative" stackId="a" fill="#F43F5E" name="Négatif" radius={[3,3,0,0]} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ChartCard title="Répartition du sentiment" icon="◐">
            <ResponsiveContainer width="100%" height={130}>
              <PieChart>
                <Pie data={sentimentPie} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3} dataKey="value">
                  {sentimentPie.map((entry) => (
                    <Cell key={entry.name} fill={entry.name === 'Positif' ? '#10B981' : entry.name === 'Négatif' ? '#F43F5E' : '#F59E0B'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #ECEEF6', borderRadius: 8, fontSize: 12, color: '#1E1B3A' }} />
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

      <div className="card">
        <div className="card-header">
          <div className="card-title">◉ Toutes les mentions</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['all', 'negative', 'positive', 'neutral', 'crisis'].map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}>
                {f === 'all' ? 'Tout' : f === 'crisis' ? '⚠ Crise' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <DataTable columns={tableColumns} rows={filtered.slice(0, 50)} emptyMessage="Aucune mention trouvée" />
        {filtered.length > 50 && (
          <div style={{ padding: '10px 20px', fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border-light)' }}>
            Affichage 50/{filtered.length} — Exportez en CSV pour voir tout
          </div>
        )}
      </div>
    </div>
  )
}
