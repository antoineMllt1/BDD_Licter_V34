import { useState, useEffect, useMemo } from 'react'
import { fetchAll } from '../lib/supabase.js'
import { useFilters } from '../lib/FilterContext.jsx'
import KPICard from '../components/KPICard.jsx'

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }
const SEVERITY_COLORS = { critical: '#EF4444', high: '#FB923C', medium: '#F59E0B', low: '#10B981' }

function normalizeSentiment(row) {
  return row.sentiment || row.sentiment_detected || null
}

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function generateAlerts(allRows) {
  const alerts = []
  const now = new Date()
  const cutoff7 = daysAgo(7)
  const cutoff30 = daysAgo(30)

  const rows30 = allRows.filter(r => r.date && r.date >= cutoff30)
  const rows7 = allRows.filter(r => r.date && r.date >= cutoff7)

  const catCount30 = {}
  rows30.forEach(r => {
    if (!r.category) return
    if (!catCount30[r.category]) catCount30[r.category] = { total30: 0, total7: 0 }
    catCount30[r.category].total30++
  })
  rows7.forEach(r => {
    if (!r.category || !catCount30[r.category]) return
    catCount30[r.category].total7++
  })
  Object.entries(catCount30).forEach(([cat, counts]) => {
    const avg30Weekly = counts.total30 / (30 / 7)
    if (avg30Weekly > 0 && counts.total7 > avg30Weekly * 1.3) {
      const pct = Math.round(((counts.total7 - avg30Weekly) / avg30Weekly) * 100)
      alerts.push({
        id: `cat-spike-${cat}`,
        title: `Pic de volume : ${cat}`,
        severity: pct > 100 ? 'critical' : pct > 60 ? 'high' : 'medium',
        scope: `Categorie: ${cat}`,
        trend: `+${pct}% vs moyenne 30j`,
        action: `Analyser les avis recents dans la categorie "${cat}" et identifier la cause racine.`,
        category: cat,
      })
    }
  })

  const neg7 = rows7.filter(r => normalizeSentiment(r) === 'Negative').length
  const negRate7 = rows7.length > 0 ? neg7 / rows7.length : 0
  if (negRate7 > 0.4) {
    alerts.push({
      id: 'neg-surge-global',
      title: 'Surge de negativite globale',
      severity: negRate7 > 0.6 ? 'critical' : 'high',
      scope: 'Global',
      trend: `${Math.round(negRate7 * 100)}% negatif sur 7j`,
      action: 'Revue urgente des avis negatifs recents. Identifier les themes recurrents et escalader.',
    })
  }

  const storeStats = {}
  rows30.forEach(r => {
    const city = r.store_city
    if (!city) return
    if (!storeStats[city]) storeStats[city] = { total: 0, neg: 0 }
    storeStats[city].total++
    if (normalizeSentiment(r) === 'Negative') storeStats[city].neg++
  })
  Object.entries(storeStats).forEach(([city, s]) => {
    if (s.total < 5) return
    const negPct = s.neg / s.total
    if (negPct > 0.6) {
      alerts.push({
        id: `store-${city}`,
        title: `Alerte magasin : ${city}`,
        severity: negPct > 0.8 ? 'critical' : 'high',
        scope: `Magasin: ${city}`,
        trend: `${Math.round(negPct * 100)}% negatif (${s.neg}/${s.total})`,
        action: `Contacter le responsable du point de vente ${city}. Audit qualite recommande.`,
        city,
      })
    }
  })

  const critical7 = rows7.filter(r => r.severity === 'critical')
  if (critical7.length > 0) {
    alerts.push({
      id: 'critical-severity-7d',
      title: `${critical7.length} avis critiques cette semaine`,
      severity: 'critical',
      scope: 'Global',
      trend: `${critical7.length} avis severity=critical`,
      action: 'Traiter immediatement chaque avis critique. Reponse sous 24h obligatoire.',
    })
  }

  const unresponded = allRows.filter(
    r => (r.severity === 'critical' || r.severity === 'high') && !r.owner_response
  )
  if (unresponded.length > 0) {
    alerts.push({
      id: 'unresponded-critical',
      title: `${unresponded.length} avis critiques/hauts sans reponse`,
      severity: unresponded.some(r => r.severity === 'critical') ? 'critical' : 'high',
      scope: 'Global',
      trend: `${unresponded.filter(r => r.severity === 'critical').length} critiques, ${unresponded.filter(r => r.severity === 'high').length} hauts`,
      action: 'Prioriser les reponses aux avis critiques non traites. Assigner aux responsables.',
    })
  }

  return alerts.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
}

export default function Alertes() {
  const [allRows, setAllRows] = useState([])
  const [loading, setLoading] = useState(true)
  const { applyFilters } = useFilters()

  useEffect(() => {
    const tables = ['scraping_brand', 'scraping_competitor', 'voix_client_cx', 'reputation_crise']
    Promise.all(tables.map(t => fetchAll(t).then(r => r.data).catch(() => [])))
      .then(results => {
        const merged = results.flat().map(r => ({
          ...r,
          sentiment: normalizeSentiment(r),
        }))
        setAllRows(merged)
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(() => applyFilters(allRows), [allRows, applyFilters])
  const alerts = useMemo(() => generateAlerts(filtered), [filtered])

  const criticalCount = alerts.filter(a => a.severity === 'critical').length

  const mostAffectedCategory = useMemo(() => {
    const cats = {}
    alerts.forEach(a => { if (a.category) cats[a.category] = (cats[a.category] || 0) + 1 })
    const entries = Object.entries(cats)
    return entries.length > 0 ? entries.sort((a, b) => b[1] - a[1])[0][0] : '—'
  }, [alerts])

  const mostAffectedCity = useMemo(() => {
    const cities = {}
    alerts.forEach(a => { if (a.city) cities[a.city] = (cities[a.city] || 0) + 1 })
    const entries = Object.entries(cities)
    return entries.length > 0 ? entries.sort((a, b) => b[1] - a[1])[0][0] : '—'
  }, [alerts])

  if (loading) {
    return (
      <div>
        <div className="kpi-grid">
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton skeleton-kpi" />)}
        </div>
        <div className="skeleton skeleton-chart" style={{ marginTop: '2rem' }} />
      </div>
    )
  }

  return (
    <div>
      <div className="kpi-grid">
        <KPICard
          label="Alertes actives"
          value={alerts.length}
          valueStyle={{ fontVariantNumeric: 'tabular-nums' }}
          icon="◉"
          color={alerts.length > 5 ? 'negative' : alerts.length > 0 ? 'neutral' : 'positive'}
          sub="alertes detectees"
        />
        <KPICard
          label="Alertes critiques"
          value={criticalCount}
          valueStyle={{ fontVariantNumeric: 'tabular-nums' }}
          icon="⚠"
          color={criticalCount > 0 ? 'negative' : 'positive'}
          sub="severite critique"
        />
        <KPICard
          label="Categorie la plus touchee"
          value={mostAffectedCategory}
          icon="◻"
          color="primary"
          sub="par nombre d'alertes"
        />
        <KPICard
          label="Ville la plus touchee"
          value={mostAffectedCity}
          icon="◈"
          color="primary"
          sub="par nombre d'alertes"
        />
      </div>

      {alerts.length === 0 ? (
        <div className="empty-state" style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          background: 'var(--surface)',
          borderRadius: '1rem',
          border: '1px solid var(--border)',
          marginTop: '2rem',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
          <h3 style={{ color: '#10B981', marginBottom: '0.5rem' }}>Aucune alerte active</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Tous les indicateurs sont dans les seuils normaux.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
          {alerts.map(alert => (
            <div
              key={alert.id}
              className={`alert-card severity-${alert.severity}`}
              style={{
                background: 'var(--surface)',
                borderRadius: '0.75rem',
                padding: '1.5rem',
                border: '1px solid var(--border)',
                borderLeft: `4px solid ${SEVERITY_COLORS[alert.severity] || 'var(--primary)'}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{alert.title}</h3>
                <span
                  className={`badge-severity-${alert.severity}`}
                  style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '999px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    background: `${SEVERITY_COLORS[alert.severity]}22`,
                    color: SEVERITY_COLORS[alert.severity],
                    border: `1px solid ${SEVERITY_COLORS[alert.severity]}44`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {alert.severity}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Perimetre : </span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{alert.scope}</span>
                </div>
                <div style={{ fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Tendance : </span>
                  <span style={{ color: SEVERITY_COLORS[alert.severity], fontWeight: 500 }}>{alert.trend}</span>
                </div>
              </div>

              <div style={{
                fontSize: '0.85rem',
                padding: '0.75rem 1rem',
                background: 'var(--background)',
                borderRadius: '0.5rem',
                color: 'var(--text-secondary)',
              }}>
                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>Action recommandee : </span>
                {alert.action}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
