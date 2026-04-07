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
  const topPlatformSevere = topPlatform?.severeCount || 0
  const socialSignals = [
    {
      id: 'social-negative',
      label: 'Mentions negatives',
      value: warRoomModel.social.negativeTotal.toLocaleString('fr-FR'),
      note: 'Source: social_mentions | posts critiques detectes',
      info: 'Mentions negatives detectees dans social_mentions. On ne suit ici que la pression critique, pas le volume social total.',
      tone: toneFromSeverity(
        warRoomModel.social.negativeTotal > 40 ? 'high' : warRoomModel.social.negativeTotal > 12 ? 'medium' : 'low'
      ),
    },
    {
      id: 'social-engagement',
      label: 'Engagement critique',
      value: warRoomModel.social.engagement.toLocaleString('fr-FR'),
      note: 'Source: social_mentions | likes + shares + replies',
      info: 'Somme des interactions sur les mentions sociales marque. Plus ce chiffre monte, plus un signal peut se diffuser.',
      tone: toneFromSeverity(
        warRoomModel.social.engagement > 250 ? 'high' : warRoomModel.social.engagement > 80 ? 'medium' : 'low'
      ),
    },
    {
      id: 'social-verified',
      label: 'Profils verifies',
      value: warRoomModel.social.verifiedAuthors.toLocaleString('fr-FR'),
      note: 'Source: social_mentions | auteurs verifies',
      info: 'Comptes verifies reperes dans social_mentions. Ce KPI aide a isoler les auteurs plus visibles ou plus sensibles.',
      tone: toneFromSeverity(
        warRoomModel.social.verifiedAuthors > 2 ? 'critical' : warRoomModel.social.verifiedAuthors > 0 ? 'high' : 'low'
      ),
    },
    {
      id: 'social-competitor',
      label: 'Buzz concurrent',
      value: warRoomModel.social.competitorBuzz.length.toLocaleString('fr-FR'),
      note: 'Source: social_mentions_competitor | posts a forte traction',
      info: 'Posts a forte traction issus de social_mentions_competitor pour comparer la chauffe media autour du concurrent.',
      tone: 'neutral',
    },
  ]

  const reviewSignals = [
    {
      id: 'review-cases',
      label: 'Cas crise',
      value: warRoomModel.reviewReputation.total.toLocaleString('fr-FR'),
      note: 'Source: reputation_crise | cas ouverts cote marque',
      info: 'Ce chiffre vient de reputation_crise. Cette table etant deja orientee negatif/crise, on lit un volume de cas et non un taux de sentiment.',
      tone: toneFromSeverity(warRoomModel.signals.find((signal) => signal.id === 'review-pressure')?.severity),
    },
    {
      id: 'review-severe',
      label: 'Cas severes',
      value: warRoomModel.reviewReputation.severeRows.length.toLocaleString('fr-FR'),
      note: `Source: reputation_crise | ${warRoomModel.reviewReputation.severeRate}% du flux crise`,
      info: 'Nombre de cas reputation_crise marques high/critical. C est le meilleur indicateur de gravite interne du flux.',
      tone: toneFromSeverity(warRoomModel.reviewReputation.severeRate > 45 ? 'critical' : warRoomModel.reviewReputation.severeRate > 20 ? 'high' : 'low'),
    },
    {
      id: 'review-backlog',
      label: 'Backlog critique',
      value: warRoomModel.reviewReputation.backlog.length.toLocaleString('fr-FR'),
      note: 'Source: voix_client_cx + scraping_brand | severes sans reponse',
      info: 'Avis de voix_client_cx et scraping_brand avec severite high/critical et sans owner_response. C est la dette d action la plus immediate.',
      tone: toneFromSeverity(warRoomModel.signals.find((signal) => signal.id === 'response-backlog')?.severity),
    },
    {
      id: 'review-platform',
      label: 'Plateforme sous tension',
      value: topPlatform?.name || 'n/a',
      note: topPlatform ? `Source: reputation_crise | ${topPlatform.value} cas, ${topPlatformSevere} severes` : 'Source: reputation_crise | aucune plateforme dominante',
      info: 'Plateforme la plus representee dans reputation_crise sur la periode. On suit ici la concentration des cas, pas un negatif rate.',
      tone: topPlatform?.share > 45 ? 'warning' : 'neutral',
    },
    {
      id: 'review-risk',
      label: 'Niveau crise',
      value: warRoomModel.crisisLevel.toUpperCase(),
      note: 'Source: modele composite | social + reputation + backlog',
      info: 'Niveau calcule a partir de trois facteurs: volume de cas reputation_crise, backlog critique d avis et presence de profils visibles.',
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
            ? 'Fnac Darty entre dans une phase de tension elevee: les posts critiques circulent vite et le backlog d avis non traites cree une seconde couche de risque.'
            : 'Le risque reste pilotable, mais il faut tenir deux fronts distincts: la propagation sociale critique d un cote, et le traitement des cas crise de l autre.'
        }
        whyItMatters="Le social montre la propagation du risque. reputation_crise montre les cas deja qualifies negatif/crise. Le backlog montre la dette de traitement."
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
          { label: 'Mentions negatives', value: warRoomModel.social.negativeTotal.toLocaleString('fr-FR'), sub: 'Source: social_mentions', info: 'Mentions negatives detectees dans les flux sociaux marque.' },
          { label: 'Engagement critique', value: warRoomModel.social.engagement.toLocaleString('fr-FR'), sub: 'Source: social_mentions', info: 'Interactions cumulees sur les mentions critiques detectees.' },
          { label: 'Cas crise', value: warRoomModel.reviewReputation.total.toLocaleString('fr-FR'), sub: 'Source: reputation_crise', info: 'Volume de cas deja qualifies negatif/crise dans reputation_crise.' },
          { label: 'Backlog critique', value: warRoomModel.reviewReputation.backlog.length.toLocaleString('fr-FR'), sub: 'Source: voix_client_cx + scraping_brand', info: 'Avis severes provenant des bases clients marque sans reponse visible du proprietaire.' },
        ]}
      />

      <GlobalFiltersBar />

      <StrategicSection
        title="Propagation sociale"
        subtitle="4 KPI relies a une seule base: social_mentions."
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
                info={signal.info}
                tone={signal.tone}
              />
            ))}
          </div>

          <div className="strategic-grid-2">
            <ChartCard title="Mentions negatives 21 jours" icon="SOC" meta="flux social critique" info="Serie quotidienne des mentions negatives issues de social_mentions. On ne montre pas les posts positifs ici car ils ne servent pas a lire une crise.">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={warRoomModel.social.negativeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(value) => value.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="value" stroke="#F43F5E" fill="#F43F5E" fillOpacity={0.24} />
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
        title="Cas crise et backlog"
        subtitle="4 KPI relies a une seule base a la fois: reputation_crise pour les cas, voix_client_cx + scraping_brand pour le backlog."
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
                info={signal.info}
                tone={signal.tone}
              />
            ))}
          </div>

          <div className="strategic-grid-2">
            <ChartCard title="Cas severes 21 jours" icon="REP" meta="gravite reputation_crise" info="Serie quotidienne des cas reputation_crise de severite high/critical. C est la meilleure vue pour suivre l intensite reelle de la crise.">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={warRoomModel.reviewReputation.severeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(value) => value.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="value" stroke="#F43F5E" fill="#F43F5E" fillOpacity={0.24} />
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
            <ChartCard title="Plateformes sous tension" icon="PLAT" meta="poids dans reputation_crise" info="Repartition des cas reputation_crise par plateforme. Le but est d identifier ou les cas se concentrent le plus, pas de recalculer un negatif rate.">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={warRoomModel.reviewReputation.platforms.slice(0, 6)} barSize={18}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#F97316" radius={[6, 6, 0, 0]} />
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
                  <span>Cas severes</span>
                  <strong>{warRoomModel.reviewReputation.severeRows.length}</strong>
                </div>
                <div className="compact-metric-row">
                  <span>Plateforme la plus exposee</span>
                  <strong>{topPlatform?.name || 'n/a'}</strong>
                </div>
                <div className="compact-metric-row">
                  <span>Cas severes sur la plateforme</span>
                  <strong>{topPlatform ? `${topPlatformSevere}` : 'n/a'}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </StrategicSection>
    </div>
  )
}
