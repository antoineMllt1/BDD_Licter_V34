import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { GlobalFiltersBar } from '../lib/FilterContext.jsx'
import { useStrategicDashboardData } from '../lib/strategicData.js'
import ChartCard from '../components/ChartCard.jsx'
import {
  EvidenceFeed,
  SignalCard,
  StrategicHero,
  StrategicSection,
} from '../components/StrategicUI.jsx'

function toneFromSeverity(value) {
  if (value === 'critical') return 'critical'
  if (value === 'high') return 'warning'
  return 'neutral'
}

function formatPercent(value) {
  const text = String(value ?? '')
  return text.includes('%') ? text : `${Number(value || 0)}%`
}

function LoadingState() {
  return (
    <div className="strategic-hero loading-wrap">
      <div className="spinner" />
      <div className="loading-text">Assemblage de la War Room...</div>
    </div>
  )
}

export default function WarRoom() {
  const { loading, error, warRoomModel } = useStrategicDashboardData()

  if (loading) return <LoadingState />

  if (error) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <div className="empty-text">Impossible de charger la War Room</div>
        <div className="empty-sub">{error}</div>
      </div>
    )
  }

  const topPlatform = warRoomModel.reviewReputation.platforms[0]
  const socialSignals = [
    {
      id: 'social-volume',
      label: 'Volume social',
      value: warRoomModel.social.total.toLocaleString('fr-FR'),
      note: 'mentions visibles cote marque',
      tone: toneFromSeverity(
        warRoomModel.social.total > 40 ? 'high' : warRoomModel.social.total > 12 ? 'medium' : 'low'
      ),
    },
    {
      id: 'social-engagement',
      label: 'Engagement critique',
      value: warRoomModel.social.engagement.toLocaleString('fr-FR'),
      note: 'likes + shares + replies',
      tone: toneFromSeverity(
        warRoomModel.social.engagement > 250 ? 'high' : warRoomModel.social.engagement > 80 ? 'medium' : 'low'
      ),
    },
    {
      id: 'social-verified',
      label: 'Profils verifies',
      value: warRoomModel.social.verifiedAuthors.toLocaleString('fr-FR'),
      note: 'auteurs verifies dans le flux social',
      tone: toneFromSeverity(
        warRoomModel.social.verifiedAuthors > 2 ? 'critical' : warRoomModel.social.verifiedAuthors > 0 ? 'high' : 'low'
      ),
    },
    {
      id: 'social-competitor',
      label: 'Buzz concurrent',
      value: warRoomModel.social.competitorBuzz.length.toLocaleString('fr-FR'),
      note: 'posts concurrents a forte traction',
      tone: 'neutral',
    },
  ]

  const reviewSignals = [
    {
      id: 'review-negative',
      label: 'Part negative',
      value: formatPercent(warRoomModel.signals.find((signal) => signal.id === 'review-pressure')?.value),
      note: 'pression reputation cote avis',
      tone: toneFromSeverity(warRoomModel.signals.find((signal) => signal.id === 'review-pressure')?.severity),
    },
    {
      id: 'review-backlog',
      label: 'Backlog critique',
      value: warRoomModel.reviewReputation.backlog.length.toLocaleString('fr-FR'),
      note: 'avis severes sans reponse',
      tone: toneFromSeverity(warRoomModel.signals.find((signal) => signal.id === 'response-backlog')?.severity),
    },
    {
      id: 'review-platform',
      label: 'Plateforme sous tension',
      value: topPlatform?.name || 'n/a',
      note: topPlatform ? `${topPlatform.value} mentions, ${topPlatform.negativeRate}% negatives` : 'aucune plateforme dominante',
      tone: topPlatform?.negativeRate > 35 ? 'warning' : 'neutral',
    },
    {
      id: 'review-risk',
      label: 'Niveau crise',
      value: warRoomModel.crisisLevel.toUpperCase(),
      note: 'lecture combinee social + avis',
      tone: toneFromSeverity(warRoomModel.crisisLevel),
    },
  ]

  return (
    <div>
      <StrategicHero
        eyebrow="War Room"
        title="Separer le social des avis pour agir vite."
        summary={
          warRoomModel.crisisLevel === 'critical'
            ? 'La marque entre dans une phase de tension elevee: les posts critiques circulent vite et le backlog d avis non traites cree une seconde couche de risque.'
            : 'Le risque reste pilotable, mais il faut tenir deux fronts distincts: la traction sociale d un cote, la satisfaction et la reponse aux avis de l autre.'
        }
        whyItMatters="Le social montre la propagation. Les avis montrent la satisfaction et la dette de reponse."
        whatNow={
          warRoomModel.reviewReputation.backlog.length > 0
            ? `Priorite immediate: absorber ${warRoomModel.reviewReputation.backlog.length} avis severes sans reponse et neutraliser les posts a plus forte traction.`
            : 'Priorite immediate: surveiller les auteurs a risque et garder le backlog de reponse a zero.'
        }
        actions={[
          { label: 'Voir les actions', to: '/action-center' },
          { label: 'Revenir au cockpit', to: '/', kind: 'secondary' },
          { label: 'Generer le PDF', to: '/comex', kind: 'ghost' },
        ]}
        stats={[
          { label: 'Niveau crise', value: warRoomModel.crisisLevel.toUpperCase(), sub: 'lecture fusionnee mais non melangee' },
          { label: 'Flux social', value: warRoomModel.social.total.toLocaleString('fr-FR'), sub: `${warRoomModel.social.engagement.toLocaleString('fr-FR')} interactions` },
          { label: 'Backlog avis', value: warRoomModel.reviewReputation.backlog.length.toLocaleString('fr-FR'), sub: 'cas critiques sans owner_response' },
          { label: 'Auteurs a risque', value: warRoomModel.signals.find((signal) => signal.id === 'verified-critics')?.value || '0', sub: 'profils verifies ou forte audience' },
        ]}
      />

      <GlobalFiltersBar />

      <StrategicSection
        title="Social traction"
        subtitle="Ce bloc suit la propagation et les auteurs a risque."
        actions={<Link to="/battle-matrix" className="btn btn-ghost btn-sm">Voir la concurrence</Link>}
      >
        <div className="lane-panel social-lane">
          <div className="signal-grid">
            {socialSignals.map((signal) => (
              <SignalCard
                key={signal.id}
                label={signal.label}
                value={signal.value}
                note={signal.note}
                tone={signal.tone}
              />
            ))}
          </div>

          <div className="strategic-grid-2">
            <ChartCard title="Traction sociale 21 jours" icon="SOC" meta="positif, negatif, neutre">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={warRoomModel.social.volumeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(value) => value.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="Negative" stackId="a" stroke="#F43F5E" fill="#F43F5E" fillOpacity={0.24} />
                  <Area type="monotone" dataKey="Positive" stackId="a" stroke="#10B981" fill="#10B981" fillOpacity={0.18} />
                  <Area type="monotone" dataKey="Neutral" stackId="a" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.16} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <EvidenceFeed
              title="Posts critiques a surveiller"
              items={warRoomModel.social.topRiskPosts}
              emptyMessage="Aucun post critique significatif sur la periode."
            />
          </div>

          <div className="strategic-grid-2">
            <EvidenceFeed
              title="Buzz concurrent a forte traction"
              items={warRoomModel.social.competitorBuzz}
              emptyMessage="Pas de traction concurrente notable sur la periode."
            />

            <div className="card lane-note-card">
              <div className="card-title" style={{ marginBottom: 12 }}>Cadre d usage</div>
              <div className="section-note">
                Cette couche reste volontairement centree sur la traction sociale disponible aujourd hui.
                L architecture est prete pour ajouter d autres sources reseau plus tard, sans les melanger avec les avis.
              </div>
            </div>
          </div>
        </div>
      </StrategicSection>

      <StrategicSection
        title="Avis et reputation"
        subtitle="Ce bloc suit la satisfaction, l irritant et le backlog."
        actions={<Link to="/voix-du-client" className="btn btn-ghost btn-sm">Voir les clients</Link>}
      >
        <div className="lane-panel review-lane">
          <div className="signal-grid">
            {reviewSignals.map((signal) => (
              <SignalCard
                key={signal.id}
                label={signal.label}
                value={signal.value}
                note={signal.note}
                tone={signal.tone}
              />
            ))}
          </div>

          <div className="strategic-grid-2">
            <ChartCard title="Pression reputation 21 jours" icon="REP" meta="evolution par sentiment">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={warRoomModel.reviewReputation.volumeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(value) => value.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="Negative" stackId="a" stroke="#F43F5E" fill="#F43F5E" fillOpacity={0.24} />
                  <Area type="monotone" dataKey="Positive" stackId="a" stroke="#10B981" fill="#10B981" fillOpacity={0.18} />
                  <Area type="monotone" dataKey="Neutral" stackId="a" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.16} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <EvidenceFeed
              title="Avis et preuves les plus risquants"
              items={warRoomModel.reviewReputation.topRiskRows}
              emptyMessage="Aucune preuve critique cote reputation."
            />
          </div>

          <div className="strategic-grid-2">
            <ChartCard title="Plateformes sous tension" icon="PLAT" meta="negative rate par source">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={warRoomModel.reviewReputation.platforms.slice(0, 6)} barSize={18}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="negativeRate" fill="#F97316" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <div className="card lane-note-card">
              <div className="card-title" style={{ marginBottom: 14 }}>Lecture operationnelle</div>
              <div className="stack-list">
                <div className="compact-metric-row">
                  <span>Backlog sans reponse</span>
                  <strong>{warRoomModel.reviewReputation.backlog.length}</strong>
                </div>
                <div className="compact-metric-row">
                  <span>Volume negatif</span>
                  <strong>{warRoomModel.reviewReputation.negativeRows.length}</strong>
                </div>
                <div className="compact-metric-row">
                  <span>Plateforme la plus exposee</span>
                  <strong>{topPlatform?.name || 'n/a'}</strong>
                </div>
                <div className="compact-metric-row">
                  <span>Negative rate de tete</span>
                  <strong>{topPlatform ? `${topPlatform.negativeRate}%` : 'n/a'}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </StrategicSection>
    </div>
  )
}
