import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import { buildUnifiedReputationDataset } from '../lib/reputation.js'
import KPICard from '../components/KPICard.jsx'
import ChartCard from '../components/ChartCard.jsx'
import { SentimentBadge, PlatformBadge } from '../components/StatusBadge.jsx'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

const COLORS = { Positive: '#00B887', Negative: '#E84393', Neutral: '#F6A623' }

export default function Overview() {
  const [rep, setRep] = useState([])
  const [bench, setBench] = useState([])
  const [cx, setCx] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('reputation_crise').select('*').limit(5000),
      supabase.from('benchmark_marche').select('*').limit(5000),
      supabase.from('voix_client_cx').select('*').limit(5000)
    ]).then(([r, b, c]) => {
      setRep(buildUnifiedReputationDataset(r.data || [], b.data || [], c.data || []))
      setBench(b.data || [])
      setCx(c.data || [])
      setLoading(false)
    })
  }, [])

  const kpis = useMemo(() => {
    const totalMentions = rep.length
    const negCount = rep.filter(r => r.sentiment === 'Negative').length
    const crisisScore = rep.length > 0 ? Math.round((negCount / rep.length) * 100) : 0
    const fnacBench = bench.filter(b => b.entity_analyzed === 'Fnac Darty').length
    const totalBench = bench.length
    const sov = totalBench > 0 ? Math.round((fnacBench / totalBench) * 100) : 0
    const cxRated = cx.filter(c => c.rating)
    const avgRating = cxRated.length > 0
      ? (cxRated.reduce((sum, item) => sum + Number(item.rating), 0) / cxRated.length).toFixed(1)
      : '-'
    return { totalMentions, crisisScore, sov, avgRating, negCount }
  }, [rep, bench, cx])

  const trendData = useMemo(() => {
    const byDay = {}
    rep.forEach(r => {
      if (!r.date) return
      const d = r.date.slice(0, 10)
      if (!byDay[d]) byDay[d] = { date: d, total: 0, negative: 0, positive: 0 }
      byDay[d].total++
      if (r.sentiment === 'Negative') byDay[d].negative++
      if (r.sentiment === 'Positive') byDay[d].positive++
    })
    return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)).slice(-30)
  }, [rep])

  const sentimentPie = useMemo(() => {
    const counts = { Positive: 0, Negative: 0, Neutral: 0 }
    rep.forEach(r => {
      if (r.sentiment) counts[r.sentiment]++
    })
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .filter(entry => entry.value > 0)
  }, [rep])

  const recentMentions = useMemo(
    () => [...rep].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8),
    [rep]
  )

  if (loading) {
    return <div className="loading-wrap"><div className="spinner" /><div className="loading-text">Chargement des donnees...</div></div>
  }

  const crisisColor = kpis.crisisScore > 60 ? 'negative' : kpis.crisisScore > 30 ? 'neutral' : 'positive'

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Vue d'ensemble</div>
        <div className="page-subtitle">Brand Intelligence - Fnac Darty x Boulanger</div>
      </div>

      <div className="kpi-grid">
        <KPICard label="Mentions Totales" value={kpis.totalMentions.toLocaleString('fr-FR')} sub="agreges sur 3 bases Supabase" icon="◈" color="primary" />
        <KPICard label="Score de Crise" value={`${kpis.crisisScore}%`} sub={`${kpis.negCount} mentions negatives consolidees`} icon="⚠" color={crisisColor} />
        <KPICard label="Share of Voice" value={`${kpis.sov}%`} sub="Fnac Darty vs Boulanger" icon="◎" color="blue" />
        <KPICard label="Note CX Moyenne" value={kpis.avgRating} sub={`sur 5 - ${cx.length} avis`} icon="★" color="neutral" />
      </div>

      <div className="grid-2-1" style={{ marginBottom: 20 }}>
        <ChartCard title="Volume de mentions - 30 derniers jours" icon="◔" meta={`${rep.length} mentions`}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} width={28} />
              <Tooltip formatter={(v, n) => [v, n]} labelFormatter={l => `Date: ${l}`} contentStyle={{ fontSize: 11, borderRadius: 6 }} />
              <Line type="monotone" dataKey="total" stroke="var(--primary)" strokeWidth={2} dot={false} name="Total" />
              <Line type="monotone" dataKey="negative" stroke="var(--negative)" strokeWidth={1.5} dot={false} name="Negatif" strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Repartition sentiment" icon="◐">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={sentimentPie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {sentimentPie.map(entry => (
                  <Cell key={entry.name} fill={COLORS[entry.name] || '#aaa'} />
                ))}
              </Pie>
              <Tooltip formatter={(v, n) => [`${v} (${Math.round(v / rep.length * 100)}%)`, n]} contentStyle={{ fontSize: 11, borderRadius: 6 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Dernieres mentions" icon="◉" meta="Vue consolidee 3 bases">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Plateforme</th>
              <th>Texte</th>
              <th>Sentiment</th>
              <th>Likes</th>
            </tr>
          </thead>
          <tbody>
            {recentMentions.map((r, i) => (
              <tr key={i}>
                <td style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{r.date ? new Date(r.date).toLocaleDateString('fr-FR') : '-'}</td>
                <td><PlatformBadge value={r.platform} /></td>
                <td><span className="text-truncate" title={r.text}>{r.text || '-'}</span></td>
                <td><SentimentBadge value={r.sentiment} /></td>
                <td style={{ fontSize: 11 }}>{r.likes ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>
    </div>
  )
}
