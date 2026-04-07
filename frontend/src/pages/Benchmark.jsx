import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import { GlobalFiltersBar, useFilters } from '../lib/FilterContext.jsx'
import KPICard from '../components/KPICard.jsx'
import ChartCard from '../components/ChartCard.jsx'
import DataTable from '../components/DataTable.jsx'
import { SentimentBadge, PlatformBadge } from '../components/StatusBadge.jsx'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend, CartesianGrid } from 'recharts'

const URGENCY_COLORS = { critical: '#EF4444', high: '#FB923C', medium: '#F59E0B', low: '#10B981' }

export default function Benchmark() {
  const [raw, setRaw] = useState([])
  const [loading, setLoading] = useState(true)
  const [topicFilter, setTopicFilter] = useState('all')
  const { applyFilters } = useFilters()

  useEffect(() => {
    supabase.from('benchmark_marche').select('*').order('date', { ascending: false }).limit(3000)
      .then(({ data: d }) => { setRaw(d || []); setLoading(false) })
  }, [])

  const data = useMemo(() => applyFilters(raw), [raw, applyFilters])

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
      return { pos: Math.round(pos / total * 100), neg: Math.round(neg / total * 100), neu: Math.round(neu / total * 100) }
    }
    const fnac = calc(fnacData)
    const boul = calc(boulData)
    return [
      { name: 'Positif', Fnac: fnac.pos, Boulanger: boul.pos },
      { name: 'Negatif', Fnac: fnac.neg, Boulanger: boul.neg },
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
    const topics = ['Prix', 'SAV', 'Qualite', 'Livraison', 'Produit', 'Site Web']
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

  // Level 3: Battle Matrix — where brand wins vs loses by benchmark_dimension
  const battleMatrix = useMemo(() => {
    const dims = {}
    data.forEach(r => {
      const dim = r.benchmark_dimension || r.topic
      if (!dim) return
      if (!dims[dim]) dims[dim] = { dimension: dim, fnacPos: 0, fnacNeg: 0, boulPos: 0, boulNeg: 0 }
      const isFnac = r.entity_analyzed === 'Fnac Darty' || r.target_brand_vs_competitor === 'Brand'
      const sent = r.sentiment_detected
      if (isFnac) {
        if (sent === 'Positive') dims[dim].fnacPos++
        if (sent === 'Negative') dims[dim].fnacNeg++
      } else {
        if (sent === 'Positive') dims[dim].boulPos++
        if (sent === 'Negative') dims[dim].boulNeg++
      }
    })
    return Object.values(dims).map(d => {
      const fnacScore = d.fnacPos - d.fnacNeg
      const boulScore = d.boulPos - d.boulNeg
      return { ...d, fnacScore, boulScore, delta: fnacScore - boulScore, winner: fnacScore > boulScore ? 'Fnac' : fnacScore < boulScore ? 'Boulanger' : 'Egal' }
    }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8)
  }, [data])

  // Level 3: Business Impact distribution
  const impactData = useMemo(() => {
    const counts = {}
    data.filter(r => r.business_impact).forEach(r => {
      counts[r.business_impact] = (counts[r.business_impact] || 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))
  }, [data])

  // Level 3: Urgency distribution
  const urgencyData = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 }
    data.forEach(r => { if (r.urgency_level && counts[r.urgency_level] !== undefined) counts[r.urgency_level]++ })
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, count]) => ({ name, count }))
  }, [data])

  const allTopics = useMemo(() => {
    const t = new Set(data.map(r => r.topic).filter(Boolean))
    return Array.from(t).slice(0, 12)
  }, [data])

  const executiveInsight = useMemo(() => {
    if (data.length === 0) return null

    // Sentiment leaders
    const fnacPosRate = fnacData.length ? Math.round(fnacData.filter(r => r.sentiment_detected === 'Positive').length / fnacData.length * 100) : 0
    const boulPosRate = boulData.length ? Math.round(boulData.filter(r => r.sentiment_detected === 'Positive').length / boulData.length * 100) : 0
    const sentimentLeader = fnacPosRate >= boulPosRate ? 'Fnac Darty' : 'Boulanger'
    const sentimentTrailer = sentimentLeader === 'Fnac Darty' ? 'Boulanger' : 'Fnac Darty'
    const sentimentGap = Math.abs(fnacPosRate - boulPosRate)

    // SOV leader
    const sovLeader = sov.fnac >= sov.boul ? 'Fnac Darty' : 'Boulanger'
    const sovGap = Math.abs(sov.fnac - sov.boul)

    // Biggest topic gap
    const topicGaps = topicData.map(t => ({ topic: t.topic, gap: Math.abs(t.Fnac - t.Boulanger), leader: t.Fnac >= t.Boulanger ? 'Fnac Darty' : 'Boulanger' }))
    const biggestGap = topicGaps.length > 0 ? topicGaps.sort((a, b) => b.gap - a.gap)[0] : null

    // Weakest dimension for Fnac (from battle matrix)
    const fnacWeakest = battleMatrix.length > 0
      ? [...battleMatrix].sort((a, b) => a.fnacScore - b.fnacScore)[0]
      : null

    // Summary
    const fnacWins = battleMatrix.filter(b => b.winner === 'Fnac').length
    const boulWins = battleMatrix.filter(b => b.winner === 'Boulanger').length
    const summary = `${sovLeader} domine le Share of Voice (${Math.max(sov.fnac, sov.boul)}%) tandis que ${sentimentLeader} affiche un meilleur taux de sentiment positif (${Math.max(fnacPosRate, boulPosRate)}%), revelant des profils concurrentiels distincts sur ${data.length.toLocaleString()} mentions.`

    // Findings
    const findings = [
      `${sovLeader} detient ${Math.max(sov.fnac, sov.boul)}% du Share of Voice avec un ecart de ${sovGap} points — ${sovGap > 15 ? 'une avance significative' : 'un ecart serre'} en visibilite.`,
      `${sentimentLeader} surpasse ${sentimentTrailer} en sentiment positif de ${sentimentGap} points (${Math.max(fnacPosRate, boulPosRate)}% vs ${Math.min(fnacPosRate, boulPosRate)}%).`,
      biggestGap ? `Le sujet "${biggestGap.topic}" montre le plus grand ecart concurrentiel (${biggestGap.gap} mentions), domine par ${biggestGap.leader}.` : `Les sujets de conversation sont equilibres entre les deux marques.`,
      `Sur la matrice de bataille, Fnac Darty remporte ${fnacWins} dimension${fnacWins > 1 ? 's' : ''} vs ${boulWins} pour Boulanger.`,
    ]

    // Recommendation
    const recommendation = fnacWeakest
      ? `Priorite : renforcer la dimension "${fnacWeakest.dimension}" ou Fnac Darty affiche un score net de ${fnacWeakest.fnacScore > 0 ? '+' : ''}${fnacWeakest.fnacScore}, le point le plus faible du benchmark.`
      : `Continuer le monitoring pour identifier les dimensions a renforcer.`

    // Risk
    const risks = `Cette analyse repose sur ${data.length.toLocaleString()} mentions collectees — un echantillon ${data.length < 200 ? 'limite qui peut biaiser les conclusions' : 'suffisant mais qui merite un suivi longitudinal pour confirmer les tendances'}.`

    return { summary, findings, recommendation, risks }
  }, [data, fnacData, boulData, sov, topicData, battleMatrix])

  const tableColumns = [
    { key: 'date', label: 'Date', render: v => v ? new Date(v).toLocaleDateString('fr-FR') : '—' },
    { key: 'entity_analyzed', label: 'Entite', render: v => <span className="badge badge-primary">{v || '—'}</span> },
    { key: 'platform', label: 'Plateforme', render: v => <PlatformBadge value={v} /> },
    { key: 'topic', label: 'Sujet', render: v => v ? <span className="badge badge-blue">{v}</span> : '—' },
    { key: 'benchmark_dimension', label: 'Dimension', render: v => v ? <span className="badge badge-purple">{v}</span> : '—' },
    { key: 'business_impact', label: 'Impact', render: v => v ? <span className="badge badge-orange">{v}</span> : '—' },
    { key: 'urgency_level', label: 'Urgence', render: v => v ? <span className={`badge badge-severity-${v}`}>{v}</span> : '—' },
    { key: 'text', label: 'Texte', truncate: true },
    { key: 'sentiment_detected', label: 'Sentiment', render: v => <SentimentBadge value={v} /> },
  ]

  const filteredRows = useMemo(() => {
    if (topicFilter === 'all') return data.slice(0, 60)
    return data.filter(r => r.topic === topicFilter).slice(0, 60)
  }, [data, topicFilter])

  if (loading) return (
    <div>
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="skeleton" style={{ width: 90, height: 12, borderRadius: 4 }} />
            <div className="skeleton" style={{ width: 64, height: 32, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: 120, height: 11, borderRadius: 4 }} />
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: '28px 32px', marginBottom: 20 }}>
        <div className="skeleton" style={{ width: 200, height: 24, borderRadius: 6, marginBottom: 16 }} />
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton" style={{ width: '100%', height: 14, borderRadius: 4, marginBottom: 10 }} />
        ))}
      </div>
      <div className="grid-2" style={{ marginBottom: 20 }}>
        {[1, 2].map(i => (
          <div key={i} className="card" style={{ padding: '20px 24px' }}>
            <div className="skeleton" style={{ width: 160, height: 16, borderRadius: 4, marginBottom: 16 }} />
            <div className="skeleton" style={{ width: '100%', height: 200, borderRadius: 8 }} />
          </div>
        ))}
      </div>
    </div>
  )

  if (data.length === 0) return (
    <div>
      <GlobalFiltersBar />
      <div className="card" style={{ padding: '64px 32px', textAlign: 'center', marginTop: 24 }}>
        <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.25 }}>◈</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, color: '#1E1B3A', marginBottom: 8 }}>Aucune donnee disponible</div>
        <div style={{ fontSize: 14, color: '#8B8AA0', lineHeight: 1.6, maxWidth: 400, margin: '0 auto' }}>
          Aucune mention benchmark ne correspond aux filtres actifs. Modifiez les filtres ou importez des donnees depuis la table <code style={{ background: '#F4F4FB', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>benchmark_marche</code>.
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <GlobalFiltersBar />

      <div className="kpi-grid">
        <KPICard label="SOV Fnac Darty" value={`${sov.fnac}%`} sub={`${fnacData.length.toLocaleString()} mentions`} icon="◈" color="primary" />
        <KPICard label="SOV Boulanger" value={`${sov.boul}%`} sub={`${boulData.length.toLocaleString()} mentions`} icon="◈" color="blue" />
        <KPICard label="Score Sentiment Net" value={`${fnacSentScore > 0 ? '+' : ''}${fnacSentScore}`} sub="Fnac Darty (Pos - Neg) / Total" icon="◐" color={fnacSentScore >= 0 ? 'positive' : 'negative'} />
        <KPICard label="Sujets Identifies" value={allTopics.length} sub="themes distincts" icon="◻" color="neutral" />
      </div>

      {executiveInsight && (
        <div className="card" style={{ marginBottom: 20, padding: '28px 32px', background: '#FFFFFF', border: '1px solid #E2E5F1' }}>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 22, fontWeight: 400, color: '#1E1B3A', margin: '0 0 4px' }}>Executive Insight</h2>
            <div style={{ fontSize: 12, color: '#8B8AA0', fontWeight: 500 }}>Analyse concurrentielle auto-generee</div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--primary)', marginBottom: 8 }}>Resume</div>
            <p style={{ fontSize: 14, lineHeight: 1.65, color: '#1E1B3A', margin: 0 }}>{executiveInsight.summary}</p>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--primary)', marginBottom: 10 }}>Constats cles</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {executiveInsight.findings.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ minWidth: 22, height: 22, borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ fontSize: 13, lineHeight: 1.55, color: '#1E1B3A' }}>{f}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ padding: '14px 18px', borderRadius: 8, background: '#F0F0FF', border: '1px solid #E2E5F1' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--primary)', marginBottom: 6 }}>Recommandation</div>
              <p style={{ fontSize: 13, lineHeight: 1.55, color: '#1E1B3A', margin: 0 }}>{executiveInsight.recommendation}</p>
            </div>
            <div style={{ padding: '14px 18px', borderRadius: 8, background: '#FFFBF0', border: '1px solid #E2E5F1' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#B45309', marginBottom: 6 }}>Risque / Caveat</div>
              <p style={{ fontSize: 13, lineHeight: 1.55, color: '#1E1B3A', margin: 0 }}>{executiveInsight.risks}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <ChartCard title="Share of Voice" icon="◎" meta="par volume de mentions">
          <div style={{ padding: '16px 0 8px' }}>
            <div className="sov-bars">
              <div className="sov-item">
                <div className="sov-label">
                  <span style={{ fontWeight: 600 }}>Fnac Darty</span>
                  <span style={{ color: 'var(--primary)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{sov.fnac}%</span>
                </div>
                <div className="sov-bar-track">
                  <div className="sov-bar-fill" style={{ width: `${sov.fnac}%`, background: 'var(--primary)' }} />
                </div>
              </div>
              <div className="sov-item">
                <div className="sov-label">
                  <span style={{ fontWeight: 600 }}>Boulanger</span>
                  <span style={{ color: 'var(--blue)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{sov.boul}%</span>
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
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #ECEEF6', borderRadius: 8, fontSize: 12, color: '#1E1B3A' }} formatter={v => `${v}%`} />
                  <Bar dataKey="Fnac" fill="var(--primary)" name="Fnac Darty" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Boulanger" fill="var(--blue)" name="Boulanger" radius={[3, 3, 0, 0]} />
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

      {/* Battle Matrix — where brand wins vs loses */}
      {battleMatrix.length > 0 && (
        <ChartCard title="Matrice de Bataille — Dimensions gagnees / perdues" icon="⚔" meta="Score net sentiment (Pos - Neg)" style={{ marginBottom: 20 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>Dimension</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--primary)', fontWeight: 600, fontSize: 11 }}>Fnac Darty</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px', color: '#3B82F6', fontWeight: 600, fontSize: 11 }}>Boulanger</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>Delta</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>Leader</th>
                </tr>
              </thead>
              <tbody>
                {battleMatrix.map(row => (
                  <tr key={row.dimension}
                    style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.025)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>{row.dimension}</td>
                    <td style={{ textAlign: 'center', padding: '8px 12px', color: row.fnacScore >= 0 ? '#10B981' : '#F43F5E', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {row.fnacScore > 0 ? '+' : ''}{row.fnacScore}
                    </td>
                    <td style={{ textAlign: 'center', padding: '8px 12px', color: row.boulScore >= 0 ? '#10B981' : '#F43F5E', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {row.boulScore > 0 ? '+' : ''}{row.boulScore}
                    </td>
                    <td style={{ textAlign: 'center', padding: '8px 12px', color: row.delta > 0 ? '#10B981' : row.delta < 0 ? '#F43F5E' : 'var(--text-muted)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {row.delta > 0 ? '+' : ''}{row.delta}
                    </td>
                    <td style={{ textAlign: 'center', padding: '8px 12px' }}>
                      <span style={{
                        padding: '2px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                        background: row.winner === 'Fnac' ? 'var(--primary-soft)' : row.winner === 'Boulanger' ? '#3B82F622' : 'var(--border-light)',
                        color: row.winner === 'Fnac' ? 'var(--primary)' : row.winner === 'Boulanger' ? '#3B82F6' : 'var(--text-muted)',
                      }}>
                        {row.winner === 'Fnac' ? 'Fnac Darty' : row.winner === 'Boulanger' ? 'Boulanger' : 'Egal'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <ChartCard title="Top sujets de conversation" icon="◻" meta="Fnac vs Boulanger">
          <ResponsiveContainer width="100%" height={Math.max(200, topicData.length * 28)}>
            <BarChart data={topicData} layout="vertical" barSize={12}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis dataKey="topic" type="category" width={90} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #ECEEF6', borderRadius: 8, fontSize: 12, color: '#1E1B3A' }} />
              <Bar dataKey="Fnac" fill="var(--primary)" name="Fnac Darty" radius={[0, 3, 3, 0]} />
              <Bar dataKey="Boulanger" fill="var(--blue)" name="Boulanger" radius={[0, 3, 3, 0]} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {impactData.length > 0 ? (
          <ChartCard title="Business Impact" icon="◎" meta="impact metier identifie par IA">
            <ResponsiveContainer width="100%" height={Math.max(180, impactData.length * 28)}>
              <BarChart data={impactData} layout="vertical" barSize={12}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #ECEEF6', borderRadius: 8, fontSize: 12, color: '#1E1B3A' }} />
                <Bar dataKey="count" fill="#FB923C" name="Mentions" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : (
          <ChartCard title="Business Impact" icon="◎">
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              Lancez l'enrichissement IA pour voir l'impact metier
            </div>
          </ChartCard>
        )}
      </div>

      {urgencyData.length > 0 && (
        <ChartCard title="Distribution Urgence" icon="⚡" meta="urgency_level par IA" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 16, padding: '16px 0', justifyContent: 'center', flexWrap: 'wrap' }}>
            {urgencyData.map(u => (
              <div key={u.name} style={{ textAlign: 'center', minWidth: 80 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: URGENCY_COLORS[u.name] || 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{u.count}</div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: URGENCY_COLORS[u.name] || 'var(--text-muted)', marginTop: 4 }}>{u.name}</div>
              </div>
            ))}
          </div>
        </ChartCard>
      )}

      <div className="card">
        <div className="card-header">
          <div className="card-title">Donnees benchmark</div>
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
