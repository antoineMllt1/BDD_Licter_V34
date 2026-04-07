import { useState, useEffect, useMemo } from 'react'
import { supabase, fetchAll } from '../lib/supabase.js'
import { GlobalFiltersBar, useFilters } from '../lib/FilterContext.jsx'
import KPICard from '../components/KPICard.jsx'
import ChartCard from '../components/ChartCard.jsx'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const COLORS = {
  positive: '#10B981',
  negative: '#F43F5E',
  neutral: '#F59E0B',
  primary: 'var(--primary)',
  blue: '#3B82F6',
}

function normalizeSentiment(row) {
  return row.sentiment || row.sentiment_detected || 'Neutral'
}

function normalizeRow(row, source) {
  return {
    ...row,
    sentiment: normalizeSentiment(row),
    date: row.date || row.review_date || row.created_at || null,
    rating: row.rating ? Number(row.rating) : null,
    platform: row.platform || row.source || source,
    category: row.category || row.pain_point || row.delight_point || null,
    severity: row.severity || null,
    pain_point: row.pain_point || null,
    delight_point: row.delight_point || null,
    _source: source,
  }
}

export default function Overview() {
  const [rawData, setRawData] = useState([])
  const [loading, setLoading] = useState(true)
  const { applyFilters } = useFilters()

  useEffect(() => {
    Promise.all([
      supabase.from('reputation_crise').select('*').limit(5000),
      supabase.from('benchmark_marche').select('*').limit(5000),
      supabase.from('voix_client_cx').select('*').limit(5000),
      supabase.from('scraping_brand').select('*').limit(5000),
      supabase.from('scraping_competitor').select('*').limit(5000),
    ]).then(([rep, bench, cx, sb, sc]) => {
      const unified = [
        ...(rep.data || []).map(r => normalizeRow(r, 'reputation_crise')),
        ...(bench.data || []).map(r => normalizeRow(r, 'benchmark_marche')),
        ...(cx.data || []).map(r => normalizeRow(r, 'voix_client_cx')),
        ...(sb.data || []).map(r => normalizeRow(r, 'scraping_brand')),
        ...(sc.data || []).map(r => normalizeRow(r, 'scraping_competitor')),
      ]
      setRawData(unified)
      setLoading(false)
    })
  }, [])

  const data = useMemo(() => applyFilters(rawData), [rawData, applyFilters])

  const prevPeriodData = useMemo(() => {
    if (data.length === 0) return []
    const dates = data.filter(r => r.date).map(r => new Date(r.date))
    if (dates.length === 0) return []
    const maxDate = new Date(Math.max(...dates))
    const minDate = new Date(Math.min(...dates))
    const span = maxDate - minDate
    const prevStart = new Date(minDate - span)
    const prevEnd = minDate
    return rawData.filter(r => {
      if (!r.date) return false
      const d = new Date(r.date)
      return d >= prevStart && d < prevEnd
    })
  }, [data, rawData])

  const kpis = useMemo(() => {
    const rated = data.filter(r => r.rating)
    const avgRating = rated.length > 0
      ? (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1)
      : null

    const prevRated = prevPeriodData.filter(r => r.rating)
    const prevAvg = prevRated.length > 0
      ? prevRated.reduce((s, r) => s + Number(r.rating), 0) / prevRated.length
      : null
    const ratingTrend = avgRating && prevAvg
      ? Math.round(((avgRating - prevAvg) / prevAvg) * 100)
      : undefined

    const volume = data.length

    const negCount = data.filter(r => r.sentiment === 'Negative').length
    const negPct = volume > 0 ? Math.round((negCount / volume) * 100) : 0
    const prevNegCount = prevPeriodData.filter(r => normalizeSentiment(r) === 'Negative').length
    const prevNegPct = prevPeriodData.length > 0 ? Math.round((prevNegCount / prevPeriodData.length) * 100) : 0
    const negTrend = prevNegPct > 0 ? negPct - prevNegPct : undefined

    const negRows = data.filter(r => r.sentiment === 'Negative')
    const painCounts = {}
    negRows.forEach(r => {
      const key = r.pain_point || r.category
      if (key) painCounts[key] = (painCounts[key] || 0) + 1
    })
    const topIrritant = Object.entries(painCounts).sort((a, b) => b[1] - a[1])[0]

    const posRows = data.filter(r => r.sentiment === 'Positive')
    const delightCounts = {}
    posRows.forEach(r => {
      const key = r.delight_point || r.category
      if (key) delightCounts[key] = (delightCounts[key] || 0) + 1
    })
    const topStrength = Object.entries(delightCounts).sort((a, b) => b[1] - a[1])[0]

    const critHigh = data.filter(r => r.severity === 'critical' || r.severity === 'high').length
    const urgencyScore = volume > 0 ? Math.round((critHigh / volume) * 100) : 0

    return {
      avgRating, ratingTrend, volume, negPct, negTrend,
      topIrritant: topIrritant ? topIrritant[0] : 'N/A',
      topStrength: topStrength ? topStrength[0] : 'N/A',
      urgencyScore,
    }
  }, [data, prevPeriodData])

  const weeklyRatingData = useMemo(() => {
    const byWeek = {}
    data.forEach(r => {
      if (!r.date || !r.rating) return
      const d = new Date(r.date)
      const weekStart = new Date(d)
      weekStart.setDate(d.getDate() - d.getDay())
      const key = weekStart.toISOString().slice(0, 10)
      if (!byWeek[key]) byWeek[key] = { week: key, sum: 0, count: 0 }
      byWeek[key].sum += r.rating
      byWeek[key].count++
    })
    return Object.values(byWeek)
      .map(w => ({ week: w.week, avg: +(w.sum / w.count).toFixed(2) }))
      .sort((a, b) => a.week.localeCompare(b.week))
  }, [data])

  const sentimentDailyData = useMemo(() => {
    const byDay = {}
    data.forEach(r => {
      if (!r.date) return
      const d = r.date.slice(0, 10)
      if (!byDay[d]) byDay[d] = { date: d, Positive: 0, Negative: 0, Neutral: 0 }
      const s = r.sentiment
      if (s === 'Positive' || s === 'Negative' || s === 'Neutral') byDay[d][s]++
    })
    return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)).slice(-30)
  }, [data])

  const topNegCategories = useMemo(() => {
    const counts = {}
    data.filter(r => r.sentiment === 'Negative').forEach(r => {
      const cat = r.category || r.pain_point
      if (cat) counts[cat] = (counts[cat] || 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }))
  }, [data])

  const platformBreakdown = useMemo(() => {
    const platforms = {}
    data.forEach(r => {
      const p = r.platform
      if (!p) return
      if (!platforms[p]) platforms[p] = { platform: p, Positive: 0, Negative: 0, Neutral: 0, total: 0 }
      platforms[p][r.sentiment]++
      platforms[p].total++
    })
    return Object.values(platforms)
      .filter(p => p.platform === 'Google Reviews' || p.platform === 'Trustpilot')
      .sort((a, b) => b.total - a.total)
  }, [data])

  if (loading) {
    return (
      <div>
        <div className="kpi-grid">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="skeleton skeleton-kpi" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
        <div className="grid-2" style={{ marginBottom: 24 }}>
          <div className="skeleton skeleton-chart" />
          <div className="skeleton skeleton-chart" />
        </div>
        <div className="grid-2">
          <div className="skeleton skeleton-chart" />
          <div className="skeleton skeleton-chart" />
        </div>
      </div>
    )
  }

  return (
    <div>

      <GlobalFiltersBar />

      {data.length === 0 && (
        <div className="empty-state" style={{ marginBottom: 32 }}>
          <div className="empty-icon">◈</div>
          <div className="empty-text">Aucune donnee disponible</div>
          <div className="empty-sub">Ajustez les filtres ou importez des avis pour afficher le tableau de bord.</div>
        </div>
      )}

      {data.length > 0 && (<>
      <div className="kpi-grid">
        <KPICard
          label="Note moyenne"
          value={kpis.avgRating ? `${kpis.avgRating}/5` : 'N/A'}
          sub={kpis.ratingTrend !== undefined ? ' vs periode prec.' : 'toutes plateformes'}
          icon="★"
          color={kpis.avgRating >= 3.5 ? 'positive' : kpis.avgRating >= 2.5 ? 'neutral' : 'negative'}
          trend={kpis.ratingTrend}
        />
        <KPICard
          label="Volume d'avis (periode)"
          value={kpis.volume.toLocaleString('fr-FR')}
          sub="avis collectes"
          icon="◈"
          color="blue"
        />
        <KPICard
          label="% Avis negatifs"
          value={`${kpis.negPct}%`}
          sub={kpis.negTrend !== undefined ? ' vs periode prec.' : 'du total'}
          icon="⚠"
          color={kpis.negPct > 30 ? 'negative' : kpis.negPct > 15 ? 'neutral' : 'positive'}
          trend={kpis.negTrend !== undefined ? -kpis.negTrend : undefined}
        />
        <KPICard
          label="Top irritant"
          value={kpis.topIrritant}
          sub="categorie la plus citee (neg.)"
          icon="✗"
          color="negative"
        />
        <KPICard
          label="Top point fort"
          value={kpis.topStrength}
          sub="categorie la plus citee (pos.)"
          icon="✓"
          color="positive"
        />
        <KPICard
          label="Score d'urgence"
          value={`${kpis.urgencyScore}%`}
          sub="critique + haute severite"
          icon="◉"
          color={kpis.urgencyScore > 40 ? 'negative' : kpis.urgencyScore > 20 ? 'neutral' : 'positive'}
        />
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <ChartCard title="Note moyenne par semaine" icon="◔" meta={`${weeklyRatingData.length} semaines`}>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={weeklyRatingData}>
              <defs>
                <linearGradient id="ratingGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ECEEF6" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#8B8AA0' }} tickFormatter={d => d.slice(5)} interval="preserveStartEnd" axisLine={false} tickLine={false} />
              <YAxis domain={[0, 5]} tick={{ fontSize: 10, fill: '#8B8AA0' }} width={30} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #ECEEF6', borderRadius: 8, fontSize: 12, color: '#1E1B3A', boxShadow: '0 4px 16px rgba(30,27,58,0.08)' }} labelStyle={{ fontWeight: 600, marginBottom: 4 }} labelFormatter={l => `Semaine: ${l}`} />
              <Area type="monotone" dataKey="avg" stroke={COLORS.primary} strokeWidth={2} fill="url(#ratingGrad)" name="Note moy." />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Distribution sentiment (30j)" icon="◐" meta="par jour">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={sentimentDailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ECEEF6" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8B8AA0' }} tickFormatter={d => d.slice(5)} interval="preserveStartEnd" axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#8B8AA0' }} width={30} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #ECEEF6', borderRadius: 8, fontSize: 12, color: '#1E1B3A', boxShadow: '0 4px 16px rgba(30,27,58,0.08)' }} labelStyle={{ fontWeight: 600, marginBottom: 4 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Positive" stackId="a" fill={COLORS.positive} name="Positif" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Neutral" stackId="a" fill={COLORS.neutral} name="Neutre" />
              <Bar dataKey="Negative" stackId="a" fill={COLORS.negative} name="Negatif" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <ChartCard title="Top 5 categories negatives" icon="✗" meta={`${topNegCategories.reduce((s, c) => s + c.value, 0)} avis neg.`}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={topNegCategories} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#ECEEF6" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#8B8AA0' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#4A4670' }} width={120} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #ECEEF6', borderRadius: 8, fontSize: 12, color: '#1E1B3A', boxShadow: '0 4px 16px rgba(30,27,58,0.08)' }} labelStyle={{ fontWeight: 600, marginBottom: 4 }} />
              <Bar dataKey="value" fill={COLORS.negative} name="Volume" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Google Reviews vs Trustpilot" icon="◎" meta="comparaison sentiment">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={platformBreakdown}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ECEEF6" vertical={false} />
              <XAxis dataKey="platform" tick={{ fontSize: 11, fill: '#4A4670' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#8B8AA0' }} width={30} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #ECEEF6', borderRadius: 8, fontSize: 12, color: '#1E1B3A', boxShadow: '0 4px 16px rgba(30,27,58,0.08)' }} labelStyle={{ fontWeight: 600, marginBottom: 4 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Positive" fill={COLORS.positive} name="Positif" />
              <Bar dataKey="Neutral" fill={COLORS.neutral} name="Neutre" />
              <Bar dataKey="Negative" fill={COLORS.negative} name="Negatif" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      </>)}
    </div>
  )
}
