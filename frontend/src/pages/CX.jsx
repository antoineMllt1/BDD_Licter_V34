import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import { GlobalFiltersBar, useFilters } from '../lib/FilterContext.jsx'
import KPICard from '../components/KPICard.jsx'
import ChartCard from '../components/ChartCard.jsx'
import DataTable from '../components/DataTable.jsx'
import { SentimentBadge, PlatformBadge, RatingStars } from '../components/StatusBadge.jsx'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, Legend } from 'recharts'

const SEVERITY_COLORS = { critical: '#EF4444', high: '#FB923C', medium: '#F59E0B', low: '#10B981' }

const CX_TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: '1px solid #ECEEF6',
  borderRadius: 8,
  fontSize: 12,
  color: '#1e1e2e',
}

function CXSkeleton() {
  return (
    <div>
      <div className="kpi-grid" style={{ marginTop: 24 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="skeleton" style={{ height: 12, width: 90, borderRadius: 4 }} />
            <div className="skeleton" style={{ height: 32, width: 70, borderRadius: 6 }} />
            <div className="skeleton" style={{ height: 11, width: 60, borderRadius: 4 }} />
          </div>
        ))}
      </div>
      <div className="grid-2" style={{ marginTop: 20 }}>
        {[0, 1].map(i => (
          <div key={i} className="card" style={{ padding: 20 }}>
            <div className="skeleton" style={{ height: 14, width: 180, borderRadius: 4, marginBottom: 16 }} />
            <div className="skeleton" style={{ height: 200, borderRadius: 8 }} />
          </div>
        ))}
      </div>
      <div className="grid-2" style={{ marginTop: 20 }}>
        {[0, 1].map(i => (
          <div key={i} className="card" style={{ padding: 20 }}>
            <div className="skeleton" style={{ height: 14, width: 160, borderRadius: 4, marginBottom: 16 }} />
            <div className="skeleton" style={{ height: 200, borderRadius: 8 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '72px 24px', gap: 16, textAlign: 'center',
    }}>
      <div style={{ fontSize: 40, lineHeight: 1, opacity: 0.35 }}>◐</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
        Aucune donnee pour ces filtres
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 320 }}>
        Ajustez les filtres ou importez des avis clients pour commencer l'analyse.
      </div>
    </div>
  )
}

export default function CX() {
  const [raw, setRaw] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('irritants')
  const { applyFilters } = useFilters()

  useEffect(() => {
    Promise.all([
      supabase.from('voix_client_cx').select('*').order('date', { ascending: false }).limit(2000),
      supabase.from('scraping_brand').select('*').order('date', { ascending: false }).limit(2000),
    ]).then(([cx, brand]) => {
      const all = [
        ...(cx.data || []).map(r => ({ ...r, source_table: 'voix_client_cx' })),
        ...(brand.data || []).map(r => ({ ...r, source_table: 'scraping_brand' })),
      ]
      setRaw(all)
      setLoading(false)
    })
  }, [])

  const data = useMemo(() => applyFilters(raw), [raw, applyFilters])

  const stats = useMemo(() => {
    const rated = data.filter(r => r.rating)
    const avg = rated.length ? rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length : 0
    const pos = data.filter(r => r.sentiment === 'Positive').length
    const neg = data.filter(r => r.sentiment === 'Negative').length
    const actionable = data.filter(r => r.is_actionable).length
    const enriched = data.filter(r => r.insight_ready).length
    return { avg: avg.toFixed(2), rated: rated.length, total: data.length, pos, neg, actionable, enriched }
  }, [data])

  const ratingTrend = useMemo(() => {
    const byWeek = {}
    data.forEach(r => {
      if (!r.date || !r.rating) return
      const d = new Date(r.date)
      const weekStart = new Date(d)
      weekStart.setDate(d.getDate() - d.getDay())
      const key = weekStart.toISOString().slice(0, 10)
      if (!byWeek[key]) byWeek[key] = { week: key, sum: 0, count: 0 }
      byWeek[key].sum += Number(r.rating)
      byWeek[key].count++
    })
    return Object.values(byWeek)
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-16)
      .map(w => ({ week: w.week.slice(5), avg: parseFloat((w.sum / w.count).toFixed(2)) }))
  }, [data])

  const sentimentTrend = useMemo(() => {
    const byWeek = {}
    data.forEach(r => {
      if (!r.date) return
      const d = new Date(r.date)
      const weekStart = new Date(d)
      weekStart.setDate(d.getDate() - d.getDay())
      const key = weekStart.toISOString().slice(0, 10)
      if (!byWeek[key]) byWeek[key] = { week: key, Positive: 0, Negative: 0, Neutral: 0 }
      if (r.sentiment) byWeek[key][r.sentiment] = (byWeek[key][r.sentiment] || 0) + 1
    })
    return Object.values(byWeek).sort((a, b) => a.week.localeCompare(b.week)).slice(-16).map(w => ({ ...w, week: w.week.slice(5) }))
  }, [data])

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

  const painPoints = useMemo(() => {
    const counts = {}
    data.filter(r => r.pain_point).forEach(r => {
      counts[r.pain_point] = (counts[r.pain_point] || 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }))
  }, [data])

  const delightPoints = useMemo(() => {
    const counts = {}
    data.filter(r => r.delight_point).forEach(r => {
      counts[r.delight_point] = (counts[r.delight_point] || 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }))
  }, [data])

  const journeyData = useMemo(() => {
    const steps = {}
    data.filter(r => r.customer_journey_step).forEach(r => {
      if (!steps[r.customer_journey_step]) steps[r.customer_journey_step] = { step: r.customer_journey_step, total: 0, neg: 0, critical: 0 }
      steps[r.customer_journey_step].total++
      if (r.sentiment === 'Negative') steps[r.customer_journey_step].neg++
      if (r.severity === 'critical' || r.severity === 'high') steps[r.customer_journey_step].critical++
    })
    const order = ['pre_purchase', 'purchase', 'delivery', 'post_purchase', 'support']
    return order.map(s => steps[s] || { step: s, total: 0, neg: 0, critical: 0 }).filter(s => s.total > 0)
  }, [data])

  const topIrritants = useMemo(() => data.filter(r => r.sentiment === 'Negative' && r.text).slice(0, 15), [data])
  const topEnchantements = useMemo(() => data.filter(r => r.sentiment === 'Positive' && r.text).slice(0, 15), [data])

  const tableColumns = [
    { key: 'date', label: 'Date', render: v => v ? new Date(v).toLocaleDateString('fr-FR') : '—' },
    { key: 'platform', label: 'Source', render: v => <PlatformBadge value={v} /> },
    { key: 'category', label: 'Categorie', render: v => v ? <span className="badge badge-blue">{v}</span> : '—' },
    { key: 'severity', label: 'Severite', render: v => v ? <span className={`badge badge-severity-${v}`}>{v}</span> : '—' },
    { key: 'text', label: 'Avis', truncate: true },
    { key: 'rating', label: 'Note', render: v => <RatingStars value={v} /> },
    { key: 'sentiment', label: 'Sentiment', render: v => <SentimentBadge value={v} /> },
  ]

  if (loading) return <CXSkeleton />

  if (!loading && data.length === 0) {
    return (
      <div>
        <GlobalFiltersBar />
        <EmptyState />
      </div>
    )
  }

  return (
    <div>
      <GlobalFiltersBar />

      <div className="kpi-grid">
        {[
          { label: 'Note Moyenne', value: `${stats.avg}/5`, sub: `${stats.rated} notes`, icon: '★', color: Number(stats.avg) >= 4 ? 'positive' : Number(stats.avg) >= 3 ? 'neutral' : 'negative' },
          { label: 'Avis Positifs', value: stats.pos, sub: `${stats.total ? Math.round(stats.pos / stats.total * 100) : 0}%`, icon: '↑', color: 'positive' },
          { label: 'Avis Negatifs', value: stats.neg, sub: `${stats.total ? Math.round(stats.neg / stats.total * 100) : 0}%`, icon: '↓', color: 'negative' },
          { label: 'Actionnables', value: stats.actionable, sub: `${stats.enriched} enrichis par IA`, icon: '▸', color: 'blue' },
        ].map((kpi, i) => (
          <div key={kpi.label} style={{ animation: `fadeInUp 0.4s ease both`, animationDelay: `${i * 80}ms` }}>
            <KPICard
              label={kpi.label}
              value={<span style={{ fontVariantNumeric: 'tabular-nums' }}>{kpi.value}</span>}
              sub={<span style={{ fontVariantNumeric: 'tabular-nums' }}>{kpi.sub}</span>}
              icon={kpi.icon}
              color={kpi.color}
            />
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <ChartCard title="Note moyenne par semaine" icon="★">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={ratingTrend}>
              <defs>
                <linearGradient id="ratingGradCX" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} width={28} />
              <Tooltip contentStyle={CX_TOOLTIP_STYLE} cursor={{ fill: 'rgba(139,123,247,0.06)' }} />
              <Area type="monotone" dataKey="avg" stroke="#10B981" strokeWidth={2} fill="url(#ratingGradCX)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Sentiment par semaine" icon="◐">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sentimentTrend} barSize={8}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={28} />
              <Tooltip contentStyle={CX_TOOLTIP_STYLE} cursor={{ fill: 'rgba(139,123,247,0.06)' }} />
              <Bar dataKey="Positive" stackId="a" fill="#10B981" />
              <Bar dataKey="Neutral" stackId="a" fill="#F59E0B" />
              <Bar dataKey="Negative" stackId="a" fill="#F43F5E" radius={[3, 3, 0, 0]} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <ChartCard title="Categories (positifs vs negatifs)" icon="◻">
          <ResponsiveContainer width="100%" height={Math.max(180, categoryData.length * 28)}>
            <BarChart data={categoryData.slice(0, 10)} layout="vertical" barSize={12}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={CX_TOOLTIP_STYLE} cursor={{ fill: 'rgba(139,123,247,0.06)' }} />
              <Bar dataKey="pos" fill="#10B981" name="Positifs" stackId="a" />
              <Bar dataKey="neg" fill="#F43F5E" name="Negatifs" stackId="a" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {journeyData.length > 0 ? (
          <ChartCard title="Parcours client — points de friction" icon="→">
            <ResponsiveContainer width="100%" height={Math.max(180, journeyData.length * 36)}>
              <BarChart data={journeyData} layout="vertical" barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="step" type="category" width={100} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={CX_TOOLTIP_STYLE} cursor={{ fill: 'rgba(139,123,247,0.06)' }} />
                <Bar dataKey="total" fill="rgba(139,123,247,0.4)" name="Total" />
                <Bar dataKey="critical" fill="#EF4444" name="Critique/Haut" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : (
          <ChartCard title="Parcours client" icon="→">
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              Lancez l'enrichissement IA pour voir le parcours client
            </div>
          </ChartCard>
        )}
      </div>

      {(painPoints.length > 0 || delightPoints.length > 0) && (
        <div className="grid-2" style={{ marginBottom: 20 }}>
          <ChartCard title="Top Pain Points" icon="↓">
            {painPoints.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(160, painPoints.length * 28)}>
                <BarChart data={painPoints} layout="vertical" barSize={12}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" width={160} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={CX_TOOLTIP_STYLE} cursor={{ fill: 'rgba(139,123,247,0.06)' }} />
                  <Bar dataKey="count" fill="#F43F5E" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>En attente d'enrichissement IA</div>
            )}
          </ChartCard>
          <ChartCard title="Top Delight Points" icon="↑">
            {delightPoints.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(160, delightPoints.length * 28)}>
                <BarChart data={delightPoints} layout="vertical" barSize={12}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" width={160} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={CX_TOOLTIP_STYLE} cursor={{ fill: 'rgba(139,123,247,0.06)' }} />
                  <Bar dataKey="count" fill="#10B981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>En attente d'enrichissement IA</div>
            )}
          </ChartCard>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div className="card-title">Verbatims</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setView('irritants')} className={`btn btn-sm ${view === 'irritants' ? 'btn-danger' : 'btn-ghost'}`}>Irritants</button>
            <button onClick={() => setView('enchantements')} className={`btn btn-sm ${view === 'enchantements' ? 'btn-success' : 'btn-ghost'}`}>Enchantements</button>
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
