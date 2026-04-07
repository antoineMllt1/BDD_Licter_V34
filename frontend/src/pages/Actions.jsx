import { useState, useEffect, useMemo } from 'react'
import { supabase, fetchAll } from '../lib/supabase.js'
import { useFilters } from '../lib/FilterContext.jsx'
import KPICard from '../components/KPICard.jsx'

const SEVERITY_COLORS = {
  critical: '#EF4444',
  high: '#FB923C',
  medium: '#F59E0B',
  low: '#10B981',
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }

const TABLES = ['scraping_brand', 'scraping_competitor', 'voix_client_cx', 'reputation_crise']

export default function Actions() {
  const [allRows, setAllRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [insightReady, setInsightReady] = useState(true)
  const { applyFilters } = useFilters()

  useEffect(() => {
    Promise.all(
      TABLES.map(t =>
        supabase.from(t).select('*').eq('is_actionable', true).not('recommended_action', 'is', null)
          .order('created_at', { ascending: false }).limit(2000)
          .then(({ data: d }) => (d || []).map(r => ({ ...r, _source: t })))
      )
    ).then(results => {
      const merged = results.flat()
      if (merged.length === 0) setInsightReady(false)
      setAllRows(merged)
      setLoading(false)
    })
  }, [])

  const filtered = useMemo(() => applyFilters(allRows), [allRows, applyFilters])

  const actionGroups = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      const key = (r.recommended_action || '').trim()
      if (!key) return
      if (!map[key]) {
        map[key] = {
          action: key,
          count: 0,
          rows: [],
          severities: { critical: 0, high: 0, medium: 0, low: 0 },
          teams: {},
          categories: {},
        }
      }
      const g = map[key]
      g.count++
      g.rows.push(r)
      const sev = (r.severity || 'medium').toLowerCase()
      if (g.severities[sev] !== undefined) g.severities[sev]++
      const team = r.team_owner || 'Non assigné'
      g.teams[team] = (g.teams[team] || 0) + 1
      const cat = r.category || 'Autre'
      g.categories[cat] = (g.categories[cat] || 0) + 1
    })
    return Object.values(map).map(g => {
      const topTeam = Object.entries(g.teams).sort((a, b) => b[1] - a[1])[0]
      const topCategory = Object.entries(g.categories).sort((a, b) => b[1] - a[1])[0]
      const maxSev = Object.entries(g.severities)
        .filter(([, v]) => v > 0)
        .sort((a, b) => SEVERITY_ORDER[a[0]] - SEVERITY_ORDER[b[0]])[0]
      return {
        ...g,
        team_owner: topTeam ? topTeam[0] : 'Non assigné',
        category: topCategory ? topCategory[0] : 'Autre',
        topSeverity: maxSev ? maxSev[0] : 'medium',
        recentVerbatims: g.rows
          .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
          .slice(0, 2)
          .map(r => (r.text || r.review_text || r.comment || '').slice(0, 100)),
      }
    })
  }, [filtered])

  const urgent = useMemo(() =>
    actionGroups
      .filter(g => g.topSeverity === 'critical' || g.topSeverity === 'high')
      .sort((a, b) => b.count - a.count),
    [actionGroups]
  )

  const planned = useMemo(() =>
    actionGroups
      .filter(g => g.topSeverity === 'medium' || g.topSeverity === 'low')
      .sort((a, b) => b.count - a.count),
    [actionGroups]
  )

  const stats = useMemo(() => {
    const totalActions = actionGroups.length
    const criticalCount = urgent.length
    const teamCounts = {}
    actionGroups.forEach(g => {
      teamCounts[g.team_owner] = (teamCounts[g.team_owner] || 0) + g.count
    })
    const topTeam = Object.entries(teamCounts).sort((a, b) => b[1] - a[1])[0]
    const totalReviews = allRows.length
    const actionableReviews = filtered.length
    const pctActionable = totalReviews > 0 ? Math.round((actionableReviews / totalReviews) * 100) : 0
    return { totalActions, criticalCount, topTeam: topTeam ? topTeam[0] : '—', pctActionable }
  }, [actionGroups, urgent, allRows, filtered])

  if (loading) return (
    <div>
      <div className="kpi-grid">
        {[1, 2, 3, 4].map(i => <div key={i} className="skeleton skeleton-kpi" />)}
      </div>
      <div className="skeleton skeleton-chart" style={{ marginTop: 24 }} />
    </div>
  )

  if (!insightReady) {
    return (
      <div>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.4 }}>&#x1F9E0;</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            Aucune action disponible
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Lancez l&rsquo;enrichissement IA pour g&eacute;n&eacute;rer les actions
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="kpi-grid">
        <KPICard label="Actions identifi\u00e9es" value={stats.totalActions} valueStyle={{ fontVariantNumeric: 'tabular-nums' }} sub="regroup\u00e9es par recommandation" icon="\u25C8" color="primary" />
        <KPICard label="Critiques / Urgentes" value={stats.criticalCount} valueStyle={{ fontVariantNumeric: 'tabular-nums' }} sub="severity critical ou high" icon="\u26A0" color="negative" />
        <KPICard label="\u00C9quipe la plus concern\u00e9e" value={stats.topTeam} sub="team_owner dominant" icon="\u25CB" color="neutral" />
        <KPICard label="% avis actionnables" value={`${stats.pctActionable}%`} valueStyle={{ fontVariantNumeric: 'tabular-nums' }} sub={`${filtered.length} / ${allRows.length} avis`} icon="\u2713" color="positive" />
      </div>

      <ActionSection title="\u00C0 faire maintenant" icon="\u26A0" subtitle="Critiques et haute priorit\u00e9" groups={urgent} />
      <ActionSection title="\u00C0 planifier" icon="\u25F7" subtitle="Moyenne et basse priorit\u00e9" groups={planned} />
    </div>
  )
}

function ActionSection({ title, icon, subtitle, groups }) {
  if (groups.length === 0) return null

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{subtitle} ({groups.length})</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
        {groups.map((g, i) => (
          <ActionCard key={i} group={g} />
        ))}
      </div>
    </div>
  )
}

function ActionCard({ group }) {
  const sevColor = SEVERITY_COLORS[group.topSeverity] || SEVERITY_COLORS.medium

  return (
    <div className={`alert-card severity-${group.topSeverity}`} style={{ borderLeft: `3px solid ${sevColor}` }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.4 }}>
        {group.action}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        <span className={`badge-severity-${group.topSeverity}`} style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
          background: `${sevColor}22`, color: sevColor, textTransform: 'uppercase',
        }}>
          {group.topSeverity}
        </span>
        <span style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
          background: 'var(--primary-soft)', color: 'var(--primary)',
        }}>
          {group.team_owner}
        </span>
        <span style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 500,
          background: 'var(--bg-tertiary, rgba(255,255,255,0.06))', color: 'var(--text-muted)',
        }}>
          {group.category}
        </span>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
        <strong style={{ color: 'var(--text-secondary)' }}>{group.count}</strong> verbatim{group.count > 1 ? 's' : ''} support
      </div>

      {group.recentVerbatims.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 6 }}>
          {group.recentVerbatims.map((v, i) => (
            <div key={i} style={{
              fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic',
              padding: '3px 0', lineHeight: 1.4,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              &laquo; {v}{v.length >= 100 ? '...' : ''} &raquo;
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
