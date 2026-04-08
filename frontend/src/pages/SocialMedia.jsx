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
  TikTok: '#FF0050',
  Facebook: '#1877F2',
  Reddit: '#FF4500',
  Instagram: '#C13584',
  YouTube: '#FF0000',
  LinkedIn: '#0A66C2',
  Threads: '#1E1E1E',
}
const BRAND_COLOR = 'var(--primary)'
const COMPETITOR_COLOR = '#F97316'
const SOCIAL_PLATFORMS = ['Twitter/X', 'TikTok', 'Facebook', 'Reddit', 'Instagram', 'YouTube', 'LinkedIn', 'Threads']
const SOCIAL_KEYWORDS = [
  ['twitter/x', 'Twitter/X'],
  ['twitter', 'Twitter/X'],
  ['x.com', 'Twitter/X'],
  ['tweet', 'Twitter/X'],
  ['tiktok', 'TikTok'],
  ['facebook', 'Facebook'],
  ['reddit', 'Reddit'],
  ['instagram', 'Instagram'],
  ['youtube', 'YouTube'],
  ['linkedin', 'LinkedIn'],
  ['threads', 'Threads'],
]
const SOCIAL_TABLES = [
  { table: 'social_mentions', side: 'brand', sourceLabel: 'social_mentions' },
  { table: 'social_mentions_competitor', side: 'competitor', sourceLabel: 'social_mentions_competitor' },
  { table: 'benchmark_marche', side: 'unknown', sourceLabel: 'benchmark_marche' },
  { table: 'scraping_brand', side: 'brand', sourceLabel: 'scraping_brand' },
  { table: 'scraping_competitor', side: 'competitor', sourceLabel: 'scraping_competitor' },
  { table: 'voix_client_cx', side: 'brand', sourceLabel: 'voix_client_cx' },
  { table: 'reputation_crise', side: 'brand', sourceLabel: 'reputation_crise' },
]

function asText(value) {
  return value == null ? '' : String(value).trim()
}

function asNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function detectPlatform(...values) {
  const haystack = values
    .map((value) => asText(value).toLowerCase())
    .filter(Boolean)
    .join(' ')

  for (const [keyword, label] of SOCIAL_KEYWORDS) {
    if (haystack.includes(keyword)) return label
  }

  return null
}

function detectSide(row, fallbackSide) {
  const target = asText(row.target_brand_vs_competitor).toLowerCase()
  if (target === 'brand') return 'brand'
  if (target === 'competitor') return 'competitor'

  const entity = asText(row.entity_analyzed || row.brand || row.company || row.client_name).toLowerCase()
  if (entity.includes('fnac') || entity.includes('darty')) return 'brand'
  if (entity.includes('boulanger')) return 'competitor'

  return fallbackSide === 'unknown' ? 'brand' : fallbackSide
}

function normalizeSentiment(row) {
  const raw = asText(row.sentiment || row.sentiment_detected || row.sentiment_label)
  const value = raw.toLowerCase()
  if (!value) return ''
  if (value.includes('neg')) return 'Negative'
  if (value.includes('pos')) return 'Positive'
  if (value.includes('neu')) return 'Neutral'
  return raw
}

function normalizeSocialRow(row, source) {
  const platform = detectPlatform(
    row.platform,
    row.network,
    row.source,
    row.channel,
    row.topic,
    row.category,
    row.text,
    row.comment,
    row.review_text,
    row.summary
  )

  if (!platform) return null

  const side = detectSide(row, source.side)
  const sentiment = normalizeSentiment(row)
  const text = asText(row.text || row.review_text || row.comment || row.summary || row.title)
  const author = asText(row.author || row.username || row.handle || row.account_name || row.entity_analyzed)
  const date = asText(row.date || row.created_at || row.published_at || row.inserted_at)
  const likes = asNumber(row.likes || row.like_count || row.favorite_count)
  const shares = asNumber(row.shares || row.share_count || row.retweets || row.retweet_count)
  const replies = asNumber(row.replies || row.reply_count || row.comments || row.comment_count)
  const views = asNumber(row.views || row.view_count || row.impressions)
  const followers = asNumber(row.author_followers || row.followers || row.subscribers)
  const brand = side === 'competitor'
    ? 'Boulanger'
    : asText(row.brand || row.entity_analyzed) || 'Fnac Darty'

  return {
    id: `${source.table}-${row.id || row.review_id || row.created_at || date || text.slice(0, 24)}`,
    source_table: source.table,
    source_label: source.sourceLabel,
    side,
    platform,
    sentiment,
    text,
    author,
    date,
    likes,
    shares,
    replies,
    views,
    author_followers: followers,
    brand,
    location: asText(row.location || row.city || row.store_city || row.region),
    category: asText(row.category || row.topic),
    is_verified: Boolean(row.is_verified || row.verified || row.author_verified),
  }
}

function computeStats(rows) {
  const byPlatform = {}
  SOCIAL_PLATFORMS.forEach((platform) => { byPlatform[platform] = rows.filter((row) => row.platform === platform).length })

  const neg = rows.filter((row) => row.sentiment === 'Negative').length
  const pos = rows.filter((row) => row.sentiment === 'Positive').length
  const neu = rows.filter((row) => row.sentiment === 'Neutral').length
  const enriched = rows.filter((row) => row.sentiment).length
  const totalLikes = rows.reduce((sum, row) => sum + (row.likes || 0), 0)
  const totalShares = rows.reduce((sum, row) => sum + (row.shares || 0), 0)
  const totalReplies = rows.reduce((sum, row) => sum + (row.replies || 0), 0)
  const totalViews = rows.reduce((sum, row) => sum + (row.views || 0), 0)
  const verified = rows.filter((row) => row.is_verified).length
  const avgFollowers = rows.length > 0 ? Math.round(rows.reduce((sum, row) => sum + (row.author_followers || 0), 0) / rows.length) : 0
  const negPct = rows.length > 0 ? Math.round((neg / rows.length) * 100) : 0
  const enrichPct = rows.length > 0 ? Math.round((enriched / rows.length) * 100) : 0
  const sourceMix = rows.reduce((accumulator, row) => {
    accumulator[row.source_table] = (accumulator[row.source_table] || 0) + 1
    return accumulator
  }, {})

  return {
    byPlatform,
    neg,
    pos,
    neu,
    enriched,
    totalLikes,
    totalShares,
    totalReplies,
    totalViews,
    verified,
    avgFollowers,
    negPct,
    enrichPct,
    total: rows.length,
    sourceMix,
  }
}

function scaleStats(stats, factor) {
  const scale = (value) => Math.round(value * factor)
  const byPlatform = Object.fromEntries(
    Object.entries(stats.byPlatform || {}).map(([platform, value]) => [platform, scale(value)])
  )
  const sourceMix = Object.fromEntries(
    Object.entries(stats.sourceMix || {}).map(([source, value]) => [source, scale(value)])
  )

  return {
    ...stats,
    byPlatform,
    neg: scale(stats.neg),
    pos: scale(stats.pos),
    neu: scale(stats.neu),
    enriched: scale(stats.enriched),
    totalLikes: scale(stats.totalLikes),
    totalShares: scale(stats.totalShares),
    totalReplies: scale(stats.totalReplies),
    totalViews: scale(stats.totalViews),
    verified: scale(stats.verified),
    total: scale(stats.total),
    sourceMix,
  }
}

export default function SocialMedia() {
  const [allRows, setAllRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('brand')
  const [platformFilter, setPlatformFilter] = useState('all')
  const [sentimentFilter, setSentimentFilter] = useState('all')
  const [compareMode, setCompareMode] = useState('raw')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 25

  useEffect(() => {
    Promise.all(
      SOCIAL_TABLES.map((source) =>
        supabase.from(source.table).select('*').order('date', { ascending: false }).limit(3000)
      )
    ).then((results) => {
      const merged = results.flatMap((result, index) => {
        const source = SOCIAL_TABLES[index]
        return (result.data || [])
          .map((row) => normalizeSocialRow(row, source))
          .filter(Boolean)
      })

      setAllRows(merged)
      setLoading(false)
    })
  }, [])

  const brandData = useMemo(() => allRows.filter((row) => row.side === 'brand'), [allRows])
  const competitorData = useMemo(() => allRows.filter((row) => row.side === 'competitor'), [allRows])
  const activeData = view === 'competitor' ? competitorData : brandData

  const filtered = useMemo(() => {
    let rows = activeData
    if (platformFilter !== 'all') rows = rows.filter((row) => row.platform === platformFilter)
    if (sentimentFilter !== 'all') rows = rows.filter((row) => row.sentiment === sentimentFilter)
    return rows
  }, [activeData, platformFilter, sentimentFilter])

  const brandStats = useMemo(() => computeStats(brandData), [brandData])
  const compStats = useMemo(() => computeStats(competitorData), [competitorData])
  const activeStats = view === 'competitor' ? compStats : brandStats
  const comparisonBase = useMemo(() => {
    if (!brandData.length || !competitorData.length) return 0
    return Math.min(brandData.length, competitorData.length)
  }, [brandData.length, competitorData.length])
  const brandCompareFactor = comparisonBase && brandData.length ? comparisonBase / brandData.length : 1
  const competitorCompareFactor = comparisonBase && competitorData.length ? comparisonBase / competitorData.length : 1
  const compareIsBalanced = compareMode === 'balanced' && comparisonBase > 0
  const compareBrandStats = useMemo(
    () => (compareIsBalanced ? scaleStats(brandStats, brandCompareFactor) : brandStats),
    [brandStats, compareIsBalanced, brandCompareFactor]
  )
  const compareCompStats = useMemo(
    () => (compareIsBalanced ? scaleStats(compStats, competitorCompareFactor) : compStats),
    [compStats, compareIsBalanced, competitorCompareFactor]
  )
  const compareModeLabel = compareIsBalanced
    ? `Mode equilibre: Fnac Darty ramene a ${comparisonBase.toLocaleString('fr-FR')} lignes pour comparer avec Boulanger.`
    : 'Mode brut: volumes reels sans correction d ecart.'
  const imbalanceRatio = useMemo(() => {
    if (!brandData.length || !competitorData.length) return null
    const bigger = Math.max(brandData.length, competitorData.length)
    const smaller = Math.min(brandData.length, competitorData.length)
    return smaller ? bigger / smaller : null
  }, [brandData.length, competitorData.length])

  const volumeByDay = useMemo(() => {
    const byDay = {}
    filtered.forEach((row) => {
      if (!row.date) return
      const day = row.date.slice(0, 10)
      if (!byDay[day]) {
        byDay[day] = { date: day }
        SOCIAL_PLATFORMS.forEach((platform) => { byDay[day][platform] = 0 })
      }
      if (byDay[day][row.platform] !== undefined) byDay[day][row.platform] += 1
    })
    return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)).slice(-60)
  }, [filtered])

  const sentimentByDay = useMemo(() => {
    const byDay = {}
    filtered.forEach((row) => {
      if (!row.date || !row.sentiment) return
      const day = row.date.slice(0, 10)
      if (!byDay[day]) byDay[day] = { date: day, Positive: 0, Negative: 0, Neutral: 0 }
      byDay[day][row.sentiment] += 1
    })
    return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)).slice(-60)
  }, [filtered])

  const compareCategoryData = useMemo(() => {
    if (view !== 'compare') return []

    const brandCats = {}
    const compCats = {}
    brandData.filter((row) => row.category).forEach((row) => { brandCats[row.category] = (brandCats[row.category] || 0) + 1 })
    competitorData.filter((row) => row.category).forEach((row) => { compCats[row.category] = (compCats[row.category] || 0) + 1 })
    const categories = [...new Set([...Object.keys(brandCats), ...Object.keys(compCats)])]

    return categories
      .map((category) => ({
        category,
        'Fnac Darty': compareIsBalanced ? Math.round((brandCats[category] || 0) * brandCompareFactor) : (brandCats[category] || 0),
        Boulanger: compareIsBalanced ? Math.round((compCats[category] || 0) * competitorCompareFactor) : (compCats[category] || 0),
      }))
      .sort((a, b) => (b['Fnac Darty'] + b.Boulanger) - (a['Fnac Darty'] + a.Boulanger))
      .slice(0, 10)
  }, [view, brandData, competitorData, compareIsBalanced, brandCompareFactor, competitorCompareFactor])

  const compareSentimentData = useMemo(() => {
    if (view !== 'compare') return []
    return [
      { name: 'Positif', 'Fnac Darty': compareBrandStats.pos, Boulanger: compareCompStats.pos },
      { name: 'Neutre', 'Fnac Darty': compareBrandStats.neu, Boulanger: compareCompStats.neu },
      { name: 'Negatif', 'Fnac Darty': compareBrandStats.neg, Boulanger: compareCompStats.neg },
    ]
  }, [view, compareBrandStats, compareCompStats])

  const compareEngagementData = useMemo(() => {
    if (view !== 'compare') return []
    return [
      { name: 'Likes', 'Fnac Darty': compareBrandStats.totalLikes, Boulanger: compareCompStats.totalLikes },
      { name: 'Partages', 'Fnac Darty': compareBrandStats.totalShares, Boulanger: compareCompStats.totalShares },
      { name: 'Reponses', 'Fnac Darty': compareBrandStats.totalReplies, Boulanger: compareCompStats.totalReplies },
    ]
  }, [view, compareBrandStats, compareCompStats])

  const compareVolumeByDay = useMemo(() => {
    if (view !== 'compare') return []
    const byDay = {}

    brandData.forEach((row) => {
      if (!row.date) return
      const day = row.date.slice(0, 10)
      if (!byDay[day]) byDay[day] = { date: day, 'Fnac Darty': 0, Boulanger: 0 }
      byDay[day]['Fnac Darty'] += compareIsBalanced ? brandCompareFactor : 1
    })

    competitorData.forEach((row) => {
      if (!row.date) return
      const day = row.date.slice(0, 10)
      if (!byDay[day]) byDay[day] = { date: day, 'Fnac Darty': 0, Boulanger: 0 }
      byDay[day].Boulanger += compareIsBalanced ? competitorCompareFactor : 1
    })

    return Object.values(byDay)
      .map((row) => ({
        ...row,
        'Fnac Darty': Math.round(row['Fnac Darty'] * 10) / 10,
        Boulanger: Math.round(row.Boulanger * 10) / 10,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-60)
  }, [view, brandData, competitorData, compareIsBalanced, brandCompareFactor, competitorCompareFactor])

  const sentimentPie = useMemo(() => [
    { name: 'Positif', value: activeStats.pos, color: SENTIMENT_COLORS.Positive },
    { name: 'Negatif', value: activeStats.neg, color: SENTIMENT_COLORS.Negative },
    { name: 'Neutre', value: activeStats.neu, color: SENTIMENT_COLORS.Neutral },
  ].filter((entry) => entry.value > 0), [activeStats])

  const topAuthors = useMemo(() => {
    const counts = {}
    filtered.filter((row) => row.author).forEach((row) => {
      const key = row.author
      if (!counts[key]) counts[key] = { name: key, mentions: 0, followers: row.author_followers || 0, platform: row.platform }
      counts[key].mentions += 1
      counts[key].followers = Math.max(counts[key].followers, row.author_followers || 0)
    })
    return Object.values(counts).sort((a, b) => b.followers - a.followers).slice(0, 10)
  }, [filtered])

  const sourceMixLabel = useMemo(() => {
    const entries = Object.entries(activeStats.sourceMix || {}).sort((a, b) => b[1] - a[1])
    return entries.length ? entries.map(([source, count]) => `${count} ${source}`).join(' | ') : 'Aucune source'
  }, [activeStats.sourceMix])

  const pagedRows = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page])
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const tableColumns = [
    { key: 'date', label: 'Date', width: 90, render: (value) => value ? new Date(value).toLocaleDateString('fr-FR') : '-' },
    { key: 'platform', label: 'Source', width: 100, render: (value) => <PlatformBadge value={value} /> },
    { key: 'brand', label: 'Entite', width: 110 },
    { key: 'source_table', label: 'Base', width: 150 },
    {
      key: 'author',
      label: 'Auteur',
      width: 140,
      render: (value, row) => value ? (
        <span style={{ fontWeight: 500 }}>
          {['Twitter/X', 'TikTok', 'Threads', 'Instagram'].includes(row.platform) ? `@${value}` : value}
          {row.is_verified ? ' *' : ''}
        </span>
      ) : '-'
    },
    { key: 'text', label: 'Contenu', truncate: true },
    {
      key: 'sentiment',
      label: 'Sentiment',
      width: 100,
      render: (value) => value ? <SentimentBadge value={value} /> : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>En attente</span>
    },
    { key: 'likes', label: 'Likes', width: 70, render: (value) => (value || 0).toLocaleString('fr-FR') },
    { key: 'shares', label: 'Partages', width: 80, render: (value) => (value || 0).toLocaleString('fr-FR') },
    { key: 'location', label: 'Lieu', width: 110, render: (value) => value || '-' },
  ]

  if (loading) {
    return (
      <div className="loading-state">
        <div className="loading-spinner" />
        <p>Chargement des signaux sociaux multi-bases...</p>
      </div>
    )
  }

  return (
    <div className="page-content">
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { key: 'brand', label: 'Fnac Darty', color: BRAND_COLOR, count: brandStats.total },
          { key: 'competitor', label: 'Boulanger', color: COMPETITOR_COLOR, count: compStats.total },
          { key: 'compare', label: 'Comparaison', color: '#1E1B3A', count: null },
        ].map((tab) => (
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

      <div className="filters-bar" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            className={compareMode === 'balanced' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
            onClick={() => setCompareMode((current) => current === 'balanced' ? 'raw' : 'balanced')}
            disabled={!comparisonBase}
          >
            {compareMode === 'balanced' ? 'Ratio ON' : 'Ratio OFF'}
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {compareModeLabel}
          </span>
          {imbalanceRatio && imbalanceRatio > 1.2 ? (
            <span className="badge badge-primary" style={{ fontSize: 11 }}>
              ecart x{imbalanceRatio.toFixed(1)}
            </span>
          ) : null}
          {!comparisonBase ? (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Le mode ratio s active quand les deux cotes ont des donnees.
            </span>
          ) : null}
        </div>
      </div>

      {view === 'compare' && (
        <>
          <div className="kpi-grid">
            <KPICard label={compareIsBalanced ? 'Mentions Fnac Darty ratio' : 'Mentions Fnac Darty'} value={compareBrandStats.total.toLocaleString('fr-FR')} sub={Object.entries(compareBrandStats.sourceMix).map(([source, count]) => `${count} ${source}`).join(' | ')} color="primary" info={compareIsBalanced ? 'Volume Fnac Darty repondere pour matcher le volume Boulanger avant comparaison.' : 'Volume brut Fnac Darty sans correction d ecart.'} />
            <KPICard label={compareIsBalanced ? 'Mentions Boulanger ratio' : 'Mentions Boulanger'} value={compareCompStats.total.toLocaleString('fr-FR')} sub={Object.entries(compareCompStats.sourceMix).map(([source, count]) => `${count} ${source}`).join(' | ')} color="neutral" info={compareIsBalanced ? 'Volume Boulanger sur base equilibree de comparaison.' : 'Volume brut Boulanger sans correction d ecart.'} />
            <KPICard label="% negatif Fnac Darty" value={`${compareBrandStats.negPct}%`} sub={`${compareBrandStats.neg} mentions negatives`} color={compareBrandStats.negPct > 30 ? 'negative' : 'positive'} info="Le pourcentage negatif reste stable; seul le volume est repondere en mode ratio." />
            <KPICard label="% negatif Boulanger" value={`${compareCompStats.negPct}%`} sub={`${compareCompStats.neg} mentions negatives`} color={compareCompStats.negPct > 30 ? 'negative' : 'positive'} info="Le pourcentage negatif reste stable; seul le volume est repondere en mode ratio." />
            <KPICard label={compareIsBalanced ? 'Engagement Fnac Darty ratio' : 'Engagement Fnac Darty'} value={(compareBrandStats.totalLikes + compareBrandStats.totalShares).toLocaleString('fr-FR')} sub={`${compareBrandStats.totalLikes.toLocaleString('fr-FR')} likes`} color="primary" info={compareIsBalanced ? 'Engagement ramene a une base de volume comparable.' : 'Engagement brut Fnac Darty.'} />
            <KPICard label={compareIsBalanced ? 'Engagement Boulanger ratio' : 'Engagement Boulanger'} value={(compareCompStats.totalLikes + compareCompStats.totalShares).toLocaleString('fr-FR')} sub={`${compareCompStats.totalLikes.toLocaleString('fr-FR')} likes`} color="neutral" info={compareIsBalanced ? 'Engagement ramene a une base de volume comparable.' : 'Engagement brut Boulanger.'} />
          </div>

          <div className="grid-2">
            <ChartCard title="Volume compare par jour" info="Fusion des bases sociales pertinentes: social_mentions, social_mentions_competitor, benchmark_marche et toute ligne ou un reseau social est detecte dans les autres tables.">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={compareVolumeByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(value) => value.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="Fnac Darty" stroke={BRAND_COLOR} fill={BRAND_COLOR} fillOpacity={0.3} />
                  <Area type="monotone" dataKey="Boulanger" stroke={COMPETITOR_COLOR} fill={COMPETITOR_COLOR} fillOpacity={0.3} />
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
                  <Bar dataKey="Fnac Darty" fill={BRAND_COLOR} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Boulanger" fill={COMPETITOR_COLOR} radius={[4, 4, 0, 0]} />
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
                  <Bar dataKey="Fnac Darty" fill={BRAND_COLOR} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Boulanger" fill={COMPETITOR_COLOR} radius={[4, 4, 0, 0]} />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {compareCategoryData.length > 0 && (
              <ChartCard title="Themes sociaux compares">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={compareCategoryData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={130} />
                    <Tooltip />
                    <Bar dataKey="Fnac Darty" fill={BRAND_COLOR} radius={[0, 4, 4, 0]} />
                    <Bar dataKey="Boulanger" fill={COMPETITOR_COLOR} radius={[0, 4, 4, 0]} />
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>
        </>
      )}

      {view !== 'compare' && (
        <>
          <div className="filters-bar">
            <select value={platformFilter} onChange={(event) => { setPlatformFilter(event.target.value); setPage(0) }}>
              <option value="all">Toutes les plateformes</option>
              {SOCIAL_PLATFORMS.map((platform) => (
                <option key={platform} value={platform}>{platform}</option>
              ))}
            </select>
            <select value={sentimentFilter} onChange={(event) => { setSentimentFilter(event.target.value); setPage(0) }}>
              <option value="all">Tous les sentiments</option>
              <option value="Positive">Positif</option>
              <option value="Negative">Negatif</option>
              <option value="Neutral">Neutre</option>
            </select>
            <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-muted)' }}>
              {filtered.length.toLocaleString('fr-FR')} mentions
            </span>
          </div>

          <div className="kpi-grid">
            <KPICard label="Mentions totales" value={activeStats.total.toLocaleString('fr-FR')} sub={sourceMixLabel} color="primary" />
            <KPICard label="Engagement total" value={(activeStats.totalLikes + activeStats.totalShares + activeStats.totalReplies).toLocaleString('fr-FR')} sub={`${activeStats.totalLikes.toLocaleString('fr-FR')} likes | ${activeStats.totalViews.toLocaleString('fr-FR')} vues`} color="blue" />
            <KPICard label="Sentiment negatif" value={activeStats.total > 0 ? `${activeStats.negPct}%` : '-'} sub={`${activeStats.neg.toLocaleString('fr-FR')} mentions negatives`} color={activeStats.negPct > 30 ? 'negative' : 'neutral'} />
            <KPICard label="Comptes verifies" value={activeStats.verified.toLocaleString('fr-FR')} sub={`Followers moy. ${activeStats.avgFollowers.toLocaleString('fr-FR')}`} color="primary" />
            <KPICard label="Plateformes actives" value={Object.values(activeStats.byPlatform).filter(Boolean).length} sub={SOCIAL_PLATFORMS.filter((platform) => activeStats.byPlatform[platform] > 0).join(' | ') || 'Aucune'} color="blue" />
          </div>

          <div className="grid-2">
            <ChartCard title="Volume par jour" info="Agrege tous les signaux sociaux visibles, y compris benchmark_marche et les autres bases ou une plateforme sociale est detectee.">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={volumeByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(value) => value.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  {SOCIAL_PLATFORMS.map((platform) => (
                    <Area key={platform} type="monotone" dataKey={platform} stackId="1" stroke={PLATFORM_COLORS[platform] || '#94A3B8'} fill={PLATFORM_COLORS[platform] || '#94A3B8'} fillOpacity={0.4} />
                  ))}
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Repartition sentiment">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={sentimentPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {sentimentPie.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid-2">
            <ChartCard title="Sentiment dans le temps">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={sentimentByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(value) => value.slice(5)} />
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
                    {topAuthors.map((author, index) => (
                      <tr key={index}>
                        <td style={{ fontWeight: 500 }}>{['Twitter/X', 'TikTok', 'Instagram', 'Threads'].includes(author.platform) ? `@${author.name}` : author.name}</td>
                        <td><PlatformBadge value={author.platform} /></td>
                        <td>{author.mentions}</td>
                        <td>{author.followers.toLocaleString('fr-FR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          )}

          <ChartCard title={`Mentions recentes (${filtered.length.toLocaleString('fr-FR')})`} info="Table unifiee de toutes les bases ou un reseau social est cite ou detecte.">
            <DataTable columns={tableColumns} rows={pagedRows} rowKey="id" emptyMessage="Aucune mention sociale trouvee. Lancez un scrape depuis le Hub Scraping." />
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '16px 0', fontSize: 13 }}>
                <button className="btn-sm" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Precedent</button>
                <span style={{ color: 'var(--text-muted)' }}>Page {page + 1} / {totalPages}</span>
                <button className="btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage((current) => current + 1)}>Suivant</button>
              </div>
            )}
          </ChartCard>
        </>
      )}
    </div>
  )
}
