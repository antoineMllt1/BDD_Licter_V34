import { Link } from 'react-router-dom'
import { GlobalFiltersBar } from '../lib/FilterContext.jsx'
import { useStrategicDashboardData } from '../lib/strategicData.js'
import {
  EvidenceFeed,
  SignalCard,
  StrategicHero,
  StrategicSection,
} from '../components/StrategicUI.jsx'

function LoadingState() {
  return (
    <div className="strategic-hero loading-wrap">
      <div className="spinner" />
      <div className="loading-text">Assemblage de la Voix du Client...</div>
    </div>
  )
}

export default function VoiceOfCustomer() {
  const { loading, error, cxModel } = useStrategicDashboardData()

  if (loading) return <LoadingState />

  if (error) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <div className="empty-text">Impossible de charger la Voix du Client</div>
        <div className="empty-sub">{error}</div>
      </div>
    )
  }

  const brand = cxModel.brand
  const competitor = cxModel.competitor
  const topFriction = brand.frictions[0]
  const delightLead = brand.delights[0]
  const ratingGap = Number((Number(brand.summary.avgRating) - Number(competitor.summary.avgRating)).toFixed(1))

  return (
    <div>
      <StrategicHero
        eyebrow="Voix du Client"
        title="Relier les avis aux irritants concrets."
        summary={
          topFriction
            ? `Le principal irritant remonte sur ${topFriction.label.toLowerCase()} avec un foyer dominant sur ${topFriction.cityLabel.toLowerCase()} et un point de parcours cote ${topFriction.journeyLabel.toLowerCase()}.`
            : 'Le volume de verbatims exploitable reste limite. La priorite est de consolider plus de signaux clients et leur enrichissement.'
        }
        whyItMatters="La note seule ne suffit pas. Il faut relier l irritant au parcours, a la ville et a une preuve."
        whatNow={
          topFriction
            ? `A traiter maintenant: ${topFriction.label.toLowerCase()} avant qu il ne degrade plus fortement la note et la perception magasin.`
            : 'A faire maintenant: fiabiliser la collecte et l enrichissement pour rendre les irritants comparables.'
        }
        actions={[
          { label: 'Voir les actions', to: '/action-center' },
          { label: 'Voir les magasins', to: '/magasins', kind: 'secondary' },
          { label: 'Retour cockpit', to: '/', kind: 'ghost' },
        ]}
        stats={[
          { label: 'Note Fnac Darty', value: `${brand.summary.avgRating}/5`, sub: `${brand.summary.total} verbatims exploites` },
          { label: 'Part negative', value: `${brand.summary.negativeRate}%`, sub: `${brand.summary.criticalRate}% a criticite elevee` },
          { label: 'Gap vs Boulanger', value: `${ratingGap >= 0 ? '+' : ''}${ratingGap}`, sub: `${competitor.summary.avgRating}/5 cote concurrent` },
          { label: 'Top delight', value: delightLead?.label || 'n/a', sub: delightLead ? `${delightLead.count} preuves positives` : 'pas de signal fort' },
        ]}
      />

      <GlobalFiltersBar />

      <StrategicSection
        title="Vue satisfaction"
        subtitle="Note, pression negative, comparaison."
        actions={<Link to="/battle-matrix" className="btn btn-ghost btn-sm">Voir le benchmark</Link>}
      >
        <div className="signal-grid">
          <SignalCard label="Note moyenne marque" value={`${brand.summary.avgRating}/5`} note={`${brand.summary.rated} avis notes`} tone="neutral" />
          <SignalCard label="Negative rate marque" value={`${brand.summary.negativeRate}%`} note="part negative de la base client" tone={brand.summary.negativeRate > 35 ? 'warning' : 'neutral'} />
          <SignalCard label="Note moyenne concurrent" value={`${competitor.summary.avgRating}/5`} note={`${competitor.summary.rated} avis notes`} tone="neutral" />
          <SignalCard label="Negative rate concurrent" value={`${competitor.summary.negativeRate}%`} note="part negative cote Boulanger" tone={competitor.summary.negativeRate > brand.summary.negativeRate ? 'warning' : 'neutral'} />
        </div>
      </StrategicSection>

      <StrategicSection
        title="Irritants majeurs"
        subtitle="Les frictions prioritaires, avec contexte et preuves."
      >
        <div className="friction-grid">
          {brand.frictions.slice(0, 6).map((friction) => (
            <div key={friction.id} className="friction-card">
              <div className="friction-topline">
                <span className={`badge badge-severity-${friction.severity || 'medium'}`}>{friction.severity || 'medium'}</span>
                <span>{friction.count} cas</span>
              </div>
              <div className="friction-title">{friction.label}</div>
              <div className="friction-meta">
                <span>Parcours: {friction.journeyLabel}</span>
                <span>Ville: {friction.cityLabel}</span>
              </div>
              <div className="friction-evidence-list">
                {friction.evidence.slice(0, 1).map((quote) => (
                  <div key={quote} className="friction-evidence">"{quote}"</div>
                ))}
              </div>
            </div>
          ))}
          {brand.frictions.length === 0 && <div className="evidence-empty">Aucun irritant prioritaire sur la periode selectionnee.</div>}
        </div>
      </StrategicSection>

      <StrategicSection
        title="Delight points et parcours client"
        subtitle="Ce qui fonctionne, et ou le parcours casse."
      >
        <div className="strategic-grid-2">
          <div className="battle-pocket-card">
            <div className="battle-pocket-title">Delight points</div>
            <div className="battle-pocket-list">
              {brand.delights.slice(0, 6).map((item) => (
                <div key={item.label} className="battle-pocket-item">
                  <strong>{item.label}</strong>
                  <span>{item.count} preuves positives</span>
                  {item.evidence[0] && <div className="battle-pocket-preview">"{item.evidence[0]}"</div>}
                </div>
              ))}
              {brand.delights.length === 0 && <div className="evidence-empty">Pas de delight point dominant sur la periode.</div>}
            </div>
          </div>

          <div className="journey-list">
            {brand.journey.slice(0, 5).map((step) => (
              <div key={step.step} className="journey-card">
                <div className="journey-title">{step.label}</div>
                <div className="journey-meta">
                  <span>{step.total} cas</span>
                  <span>{step.negative} negatifs</span>
                  <span>{step.critical} critiques</span>
                </div>
              </div>
            ))}
            {brand.journey.length === 0 && <div className="evidence-empty">Pas de lecture parcours disponible sur la periode.</div>}
          </div>
        </div>
      </StrategicSection>

      <StrategicSection
        title="Magasins et villes sous tension"
        subtitle="Ou les irritants se concentrent dans le reseau."
      >
        <div className="store-list">
          {brand.summary.stores.slice(0, 8).map((store) => (
            <div key={store.name} className="store-row store-row-static">
              <div className="store-row-main">
                <div>
                  <div className="store-name">{store.name}</div>
                  <div className="store-meta">{store.count} verbatims, {store.criticalCount} critiques</div>
                </div>
                <div className="store-row-rating">{store.avgRating}/5</div>
              </div>
              <div className="store-stats">
                <span>{store.avgRating}/5</span>
                <span>{store.negativeRate}% negatifs</span>
              </div>
            </div>
          ))}
          {brand.summary.stores.length === 0 && <div className="evidence-empty">Aucune concentration geographique disponible.</div>}
        </div>
      </StrategicSection>

      <StrategicSection
        title="Preuves verbatim"
        subtitle="Des preuves courtes, pas un dump."
      >
        <div className="strategic-grid-2">
          <EvidenceFeed title="Marque" items={brand.recentQuotes} emptyMessage="Pas de verbatims marque disponibles." />
          <EvidenceFeed title="Concurrent" items={competitor.recentQuotes} emptyMessage="Pas de verbatims concurrent disponibles." />
        </div>
      </StrategicSection>
    </div>
  )
}
