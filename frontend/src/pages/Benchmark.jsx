import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import KPICard from '../components/KPICard.jsx'
import ChartCard from '../components/ChartCard.jsx'
import DataTable from '../components/DataTable.jsx'
import { SentimentBadge, PlatformBadge } from '../components/StatusBadge.jsx'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend, PieChart, Pie, Cell, CartesianGrid } from 'recharts'

export default function Benchmark() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [topicFilter, setTopicFilter] = useState('all')

  useEffect(() => {
    supabase.from('benchmark_marche').select('*').order('date', { ascending: false }).limit(2000)
      .then(({ data: d }) => { setData(d || []); setLoading(false) })
  }, [])

  const fnacData = useMemo(() => data.filter(r => r.entity_analyzed === 'Fnac Darty' || r.target_brand_vs_competitor === 'Brand'), [data])
  const boulData = useMemo(() => data.filter(r => r.entity_analyzed === 'Boulanger' || r.target_brand_vs_competitor === 'Competitor'), [data])

  const sov = useMemo(() => {
    const total = fnacData.length + boulData.length
    if (total === 0) return { fnac: 0, boul: 0 }
    return { fnac: Math.round((fnacData.length / total) * 100), boul: Math.round((boulData.length / total) * 100) }
  }, [fnacData, boulData])

  const sentimentComparison = useMemo(() => {
    const calc = (arr) => {
      const pos = arr.filter(r => r.sentiment_detected === 'Positive').length
      const neg = arr.filter(r => r.sentiment_detected === 'Negative').length
      const neu = arr.filter(r => r.sentiment_detected === 'Neutral').length
      const total = arr.length || 1
      return { pos: Math.round(pos/total*100), neg: Math.round(neg/total*100), neu: Math.round(neu/total*100) }
    }
    const fnac = calc(fnacData)
    const boul = calc(boulData)
    return [
      { name: 'Positif', Fnac: fnac.pos, Boulanger: boul.pos },
      { name: 'Négatif', Fnac: fnac.neg, Boulanger: boul.neg },
      { name: 'Neutre', Fnac: fnac.neu, Boulanger: boul.neu },
    ]
  }, [fnacData, boulData])

  const topicData = useMemo(() => {
    const fnacTopics = {}; const boulTopics = {}
    fnacData.forEach(r => { if (r.topic) fnacTopics[r.topic] = (fnacTopics[r.topic] || 0) + 1 })
    boulData.forEach(r => { if (r.topic) boulTopics[r.topic] = (boulTopics[r.topic] || 0) + 1 })
    const allTopics = new Set([...Object.keys(fnacTopics), ...Object.keys(boulTopics)])
    return Array.from(allTopics).map(topic => ({
      topic,
      Fnac: fnacTopics[topic] || 0,
      Boulanger: boulTopics[topic] || 0,
    })).sort((a, b) => (b.Fnac + b.Boulanger) - (a.Fnac + a.Boulanger)).slice(0, 10)
  }, [fnacData, boulData])

  const radarData = useMemo(() => {
    const topics = ['Prix', 'SAV', 'Qualité', 'Livraison', 'Produit', 'Site Web']
    const fnacPos = {}; const boulPos = {}
    fnacData.forEach(r => {
      if (r.topic && r.sentiment_detected === 'Positive') fnacPos[r.topic] = (fnacPos[r.topic] || 0) + 1
    })
    boulData.forEach(r => {
      if (r.topic && r.sentiment_detected === 'Positive') boulPos[r.topic] = (boulPos[r.topic] || 0) + 1
    })
    return topics.map(t => ({
      subject: t,
      Fnac: Math.min(100, (fnacPos[t] || 1) * 10),
      Boulanger: Math.min(100, (boulPos[t] || 1) * 10),
    }))
  }, [fnacData, boulData])

  const fnacSentScore = useMemo(() => {
    const pos = fnacData.filter(r => r.sentiment_detected === 'Positive').length
    const neg = fnacData.filter(r => r.sentiment_detected === 'Negative').length
    const total = fnacData.length || 1
    return Math.round(((pos - neg) / total) * 100)
  }, [fnacData])

  const tableColumns = [
    { key: 'date', label: 'Date', render: v => v ? new Date(v).toLocaleDateString('fr-FR') : '—' },
    { key: 'entity_analyzed', label: 'Entité', render: v => <span className="badge badge-primary">{v || '—'}</span> },
    { key: 'platform', label: 'Plateforme', render: v => <PlatformBadge value={v} /> },
    { key: 'topic', label: 'Sujet', render: v => v ? <span className="badge badge-blue">{v}</span> : '—' },
    { key: 'text', label: 'Texte', truncate: true },
    { key: 'sentiment_detected', label: 'Sentiment IA', render: v => <SentimentBadge value={v} /> },
  ]

  const filteredRows = useMemo(() => {
    if (topicFilter === 'all') return data.slice(0, 60)
    return data.filter(r => r.topic === topicFilter).slice(0, 60)
  }, [data, topicFilter])

  const allTopics = useMemo(() => {
    const t = new Set(data.map(r => r.topic).filter(Boolean))
    return Array.from(t).slice(0, 12)
  }, [data])

  if (loading) return <div className="loading-wrap"><div className="spinner" /><div className="loading-text">Chargement…</div></div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Benchmark Marché</div>
        <div className="page-subtitle">Fnac Darty vs Boulanger — {data.length.toLocaleString()} mentions analysées</div>
      </div>

      <div className="kpi-grid">
        <KPICard label="SOV Fnac Darty" value={`${sov.fnac}%`} sub={`${fnacData.length.toLocaleString()} mentions`} icon="◈" color="primary" />
        <KPICard label="SOV Boulanger" value={`${sov.boul}%`} sub={`${boulData.length.toLocaleString()} mentions`} icon="◈" color="blue" />
        <KPICard label="Score Sentiment Net" value={`${fnacSentScore > 0 ? '+' : ''}${fnacSentScore}`} sub="Fnac Darty (Pos - Nég) / Total" icon="◐" color={fnacSentScore >= 0 ? 'positive' : 'negative'} />
        <KPICard label="Sujets Identifiés" value={allTopics.length} sub="thèmes distincts" icon="◻" color="neutral" />
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <ChartCard title="Share of Voice" icon="◎" meta="par volume de mentions">
          <div style={{ padding: '16px 0 8px' }}>
            <div className="sov-bars">
              <div className="sov-item">
                <div className="sov-label">
                  <span style={{ fontWeight: 600 }}>Fnac Darty</span>
                  <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{sov.fnac}%</span>
                </div>
                <div className="sov-bar-track">
                  <div className="sov-bar-fill" style={{ width: `${sov.fnac}%`, background: 'var(--primary)' }} />
                </div>
              </div>
              <div className="sov-item">
                <div className="sov-label">
                  <span style={{ fontWeight: 600 }}>Boulanger</span>
                  <span style={{ color: 'var(--blue)', fontWeight: 700 }}>{sov.boul}%</span>
                </div>
                <div className="sov-bar-track">
                  <div className="sov-bar-fill" style={{ width: `${sov.boul}%`, background: 'var(--blue)' }} />
                </div>
              </div>
            </div>
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Comparaison Sentiment (%)</div>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={sentimentComparison} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit="%" width={32} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} formatter={v => `${v}%`} />
                  <Bar dataKey="Fnac" fill="var(--primary)" name="Fnac Darty" radius={[3,3,0,0]} />
                  <Bar dataKey="Boulanger" fill="var(--blue)" name="Boulanger" radius={[3,3,0,0]} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Radar des forces / faiblesses" icon="◈" meta="positif par sujet">
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
              <PolarRadiusAxis tick={{ fontSize: 9 }} />
              <Radar name="Fnac Darty" dataKey="Fnac" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.25} />
              <Radar name="Boulanger" dataKey="Boulanger" stroke="var(--blue)" fill="var(--blue)" fillOpacity={0.2} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Top sujets de conversation" icon="◻" meta="Fnac vs Boulanger" actions={null} style={{ marginBottom: 20 }}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={topicData} layout="vertical" barSize={12}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis dataKey="topic" type="category" width={90} tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
            <Bar dataKey="Fnac" fill="var(--primary)" name="Fnac Darty" radius={[0,3,3,0]} />
            <Bar dataKey="Boulanger" fill="var(--blue)" name="Boulanger" radius={[0,3,3,0]} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="card">
        <div className="card-header">
          <div className="card-title">◉ Données benchmark</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => setTopicFilter('all')} className={`btn btn-sm ${topicFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}>Tout</button>
            {allTopics.slice(0, 8).map(t => (
              <button key={t} onClick={() => setTopicFilter(t)} className={`btn btn-sm ${topicFilter === t ? 'btn-primary' : 'btn-ghost'}`}>{t}</button>
            ))}
          </div>
        </div>
        <DataTable columns={tableColumns} rows={filteredRows} />
      </div>
    </div>
  )
}
