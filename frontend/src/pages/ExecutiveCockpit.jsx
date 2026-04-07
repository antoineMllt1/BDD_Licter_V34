import { Link } from 'react-router-dom'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { GlobalFiltersBar } from '../lib/FilterContext.jsx'
import { useStrategicDashboardData } from '../lib/strategicData.js'
import ChartCard from '../components/ChartCard.jsx'
import {
  StrategicHero,
  StrategicSection,
  SignalCard,
  EvidenceFeed,
  PriorityStack,
} from '../components/StrategicUI.jsx'

const SOURCE_LABELS = {
  reputation: 'Reputation',
  benchmark: 'Benchmark',
  cx: 'CX',
  brandReviews: 'Avis marque',
  competitorReviews: 'Avis concurrent',
  socialBrand: 'Social marque',
  socialCompetitor: 'Social concurrent',
}

function toneFromSeverity(value) {
  if (value === 'critical') return 'critical'
  if (value === 'high') return 'warning'
  return 'neutral'
}

function ExecutiveLoading() {
  return (
    <div>
      <div className="strategic-hero loading-wrap">
        <div className="spinner" />
        <div className="loading-text">Construction du cockpit COMEX...</div>
      </div>
    </div>
  )
}

export default function ExecutiveCockpit() {
  const {
    loading,
    error,
    executiveSnapshot,
    warRoomModel,
    battleModel,
    cxModel,
    actionModel,
    coverageModel,
  } = useStrategicDashboardData()

  if (loading) return <ExecutiveLoading />

  if (error) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <div className="empty-text">Impossible de charger le cockpit</div>
        <div className="empty-sub">{error}</div>
      </div>
    )
  }

  const marketBars = [
    { name: 'Fnac Darty', value: battleModel.sovBrand },
    { name: 'Boulanger', value: battleModel.sovCompetitor },
  ]

  const frictionBars = executiveSnapshot.frictions.map((friction) => ({
    name: friction.label,
    value: friction.count,
  }))

  return (
    <div>
      <StrategicHero
        eyebrow="Cockpit COMEX 2026"
        title="Voir les signaux qui comptent."
        summary={executiveSnapshot.editorial.whatHappens}
        whyItMatters={executiveSnapshot.editorial.whyItMatters}
        whatNow={executiveSnapshot.editorial.whatNow}
        actions={[
          { label: 'Ouvrir la crise', to: '/war-room' },
          { label: 'Voir les actions', to: '/action-center', kind: 'secondary' },
          { label: 'Generer le PDF', to: '/comex', kind: 'ghost' },
        ]}
        stats={[
          { label: 'Score marque', value: `${executiveSnapshot.brandHealth.score}/100`, sub: `${executiveSnapshot.brandHealth.avgRating}/5 en note moyenne` },
          { label: 'Niveau crise', value: executiveSnapshot.crisis.level.toUpperCase(), sub: `${executiveSnapshot.crisis.backlog} backlog critique` },
          { label: 'Momentum marche', value: `${executiveSnapshot.market.sovBrand}% SOV`, sub: `${executiveSnapshot.market.sentimentDelta >= 0 ? '+' : ''}${executiveSnapshot.market.sentimentDelta} pts sentiment` },
          { label: 'Couverture IA', value: `${coverageModel.aiCoverage}%`, sub: `${coverageModel.totalRows.toLocaleString('fr-FR')} lignes visibles` },
        ]}
      />

      <GlobalFiltersBar />

      <div className="strategic-grid-2" style={{ marginTop: 24 }}>
        <ChartCard title="Sante de marque" icon="HLTH" meta="lecture executive">
          <div className="executive-metric-stack">
            <div className="executive-metric-row">
              <span>Note moyenne percue</span>
              <strong>{executiveSnapshot.brandHealth.avgRating}/5</strong>
            </div>
            <div className="executive-metric-row">
              <span>Part d avis negatifs</span>
              <strong>{executiveSnapshot.brandHealth.negativeRate}%</strong>
            </div>
            <div className="executive-metric-row">
              <span>Volume CX exploitable</span>
              <strong>{executiveSnapshot.brandHealth.reviewVolume.toLocaleString('fr-FR')}</strong>
            </div>
            <div className="executive-health-bar">
              <div className="executive-health-fill" style={{ width: `${executiveSnapshot.brandHealth.score}%` }} />
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Alerte crise" icon="RISK" meta="signaux faibles et backlog">
          <div className="signal-grid">
            {warRoomModel.signals.map((signal) => (
              <SignalCard
                key={signal.id}
                label={signal.title}
                value={signal.value}
                note={signal.note}
                tone={toneFromSeverity(signal.severity)}
              />
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="strategic-grid-2">
        <ChartCard title="Momentum concurrentiel" icon="SOV" meta="share of voice et leadership">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={marketBars} barSize={26}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="var(--primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="executive-inline-note">
            Dimension a reprendre: <strong>{executiveSnapshot.market.weakestDimension}</strong>
          </div>
        </ChartCard>

        <ChartCard title="Frictions clients" icon="CX" meta="les 3 irritants majeurs">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={frictionBars} layout="vertical" barSize={16}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#F43F5E" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <StrategicSection
        title="3 actions prioritaires"
        subtitle="Le cockpit sert d abord a arbitrer."
        actions={<Link to="/action-center" className="btn btn-ghost btn-sm">Toutes les actions</Link>}
      >
        <div className="strategic-grid-2">
          <PriorityStack items={actionModel.top3} />
          <EvidenceFeed title="Preuves recentes" items={cxModel.brand.recentQuotes.slice(0, 4)} />
        </div>
      </StrategicSection>

      <StrategicSection
        title="Fraicheur des donnees et couverture"
        subtitle="D ou viennent les signaux et jusqu ou ils sont fiables."
      >
        <div className="strategic-grid-2">
          <ChartCard title="Traction recente" icon="FLOW" meta="social + reputation 21 jours">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={warRoomModel.social.volumeSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(value) => value.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Area type="monotone" dataKey="Negative" stackId="a" stroke="#F43F5E" fill="#F43F5E" fillOpacity={0.24} />
                <Area type="monotone" dataKey="Positive" stackId="a" stroke="#10B981" fill="#10B981" fillOpacity={0.18} />
                <Area type="monotone" dataKey="Neutral" stackId="a" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.18} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="card" style={{ padding: 22 }}>
            <div className="card-title" style={{ marginBottom: 14 }}>Couverture et activation</div>
            <div className="coverage-list">
              {coverageModel.sources.map((source) => (
                <div key={source.key} className="coverage-item">
                  <div>
                    <div className="coverage-source">{SOURCE_LABELS[source.key] || source.key}</div>
                    <div className="coverage-date">
                      {source.latestAt ? new Date(source.latestAt).toLocaleString('fr-FR') : 'Pas de date'}
                    </div>
                  </div>
                  <strong>{source.count.toLocaleString('fr-FR')}</strong>
                </div>
              ))}
            </div>
            <div className="divider" />
            <div className="executive-inline-note" style={{ marginBottom: 12 }}>
              Derniere donnee visible: <strong>{coverageModel.latestAt ? new Date(coverageModel.latestAt).toLocaleString('fr-FR') : 'n/a'}</strong>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link to="/scraping" className="btn btn-secondary btn-sm">Scraping</Link>
              <Link to="/automation" className="btn btn-secondary btn-sm">Automation Make</Link>
              <Link to="/data" className="btn btn-ghost btn-sm">Back-office data</Link>
            </div>
          </div>
        </div>
      </StrategicSection>
    </div>
  )
}
