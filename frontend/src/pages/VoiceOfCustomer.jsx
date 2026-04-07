import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GlobalFiltersBar } from '../lib/FilterContext.jsx'
import { useStrategicDashboardData } from '../lib/strategicData.js'
import ExpandableText from '../components/ExpandableText.jsx'
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

function scaleCount(value, factor) {
  return Math.round((Number(value) || 0) * factor)
}

export default function VoiceOfCustomer() {
  const { loading, error, cxModel } = useStrategicDashboardData()
  const [compareMode, setCompareMode] = useState('raw')
  const brand = cxModel?.brand
  const competitor = cxModel?.competitor
  const comparisonBase = useMemo(() => {
    if (!brand?.summary?.total || !competitor?.summary?.total) return 0
    return Math.min(brand.summary.total, competitor.summary.total)
  }, [brand?.summary?.total, competitor?.summary?.total])

  if (loading) return <LoadingState />

  if (error) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <div className="empty-text">Impossible de charger la Voix du Client</div>
        <div className="empty-sub">{error}</div>
      </div>
    )
  }

  const brandScraped = brand.summary.sourceMix?.scraping_brand || 0
  const brandCxImported = brand.summary.sourceMix?.voix_client_cx || 0
  const competitorScraped = competitor.summary.sourceMix?.scraping_competitor || 0
  const topFriction = brand.frictions[0]
  const delightLead = brand.delights[0]
  const ratingGap = Number((Number(brand.summary.avgRating) - Number(competitor.summary.avgRating)).toFixed(1))
  const brandFactor = comparisonBase && brand.summary.total ? comparisonBase / brand.summary.total : 1
  const competitorFactor = comparisonBase && competitor.summary.total ? comparisonBase / competitor.summary.total : 1
  const compareIsBalanced = compareMode === 'balanced' && comparisonBase > 0
  const displayBrandTotal = compareIsBalanced ? scaleCount(brand.summary.total, brandFactor) : brand.summary.total
  const displayCompetitorTotal = compareIsBalanced ? scaleCount(competitor.summary.total, competitorFactor) : competitor.summary.total
  const displayBrandNegative = compareIsBalanced ? scaleCount(brand.summary.negativeCount || brand.summary.total * (brand.summary.negativeRate / 100), brandFactor) : null
  const displayCompetitorNegative = compareIsBalanced ? scaleCount(competitor.summary.negativeCount || competitor.summary.total * (competitor.summary.negativeRate / 100), competitorFactor) : null
  const imbalanceRatio = comparisonBase
    ? (Math.max(brand.summary.total, competitor.summary.total) / comparisonBase)
    : null

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
          { label: compareIsBalanced ? 'Avis marque ratio' : 'Avis marque', value: displayBrandTotal.toLocaleString('fr-FR'), sub: `${brandScraped} scraping_brand | ${brandCxImported} voix_client_cx`, info: compareIsBalanced ? 'Volume Fnac Darty ramene a une base comparable avec le concurrent.' : 'Volume total d avis marque visible sur la periode, detaille entre scrape marque et base CX importee.' },
          { label: 'Avis notes', value: brand.summary.rated.toLocaleString('fr-FR'), sub: `${brand.summary.avgRating}/5 de moyenne`, info: 'Nombre d avis disposant d une note exploitable pour calculer la moyenne.' },
          { label: 'Avis negatifs', value: `${brand.summary.negativeRate}%`, sub: compareIsBalanced && displayBrandNegative !== null ? `${displayBrandNegative.toLocaleString('fr-FR')} avis ratio | ${brand.summary.criticalRate}% a criticite elevee` : `${brand.summary.criticalRate}% a criticite elevee`, info: 'Part d avis negatifs dans les bases clients marque. La criticite elevee depend des champs severity high/critical quand ils existent.' },
          { label: compareIsBalanced ? 'Avis concurrent ratio' : 'Avis concurrent scrapes', value: displayCompetitorTotal.toLocaleString('fr-FR'), sub: compareIsBalanced && displayCompetitorNegative !== null ? `${displayCompetitorNegative.toLocaleString('fr-FR')} negatifs ratio | ${competitorScraped} scraping_competitor` : `${competitorScraped} scraping_competitor`, info: compareIsBalanced ? 'Volume concurrent ramene a une base comparable avec Fnac Darty.' : 'Volume d avis concurrent visible, issu du scraping concurrent.' },
        ]}
      />

      <GlobalFiltersBar />

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
            {compareIsBalanced
              ? `Mode equilibre: les volumes avis sont ramenes a ${comparisonBase.toLocaleString('fr-FR')} lignes pour comparer Fnac Darty et Boulanger.`
              : 'Mode brut: les volumes avis restent affiches tels quels.'}
          </span>
          {imbalanceRatio && imbalanceRatio > 1.2 ? <span className="badge badge-primary" style={{ fontSize: 11 }}>ecart x{imbalanceRatio.toFixed(1)}</span> : null}
        </div>
      </div>

      <StrategicSection
        title="Vue satisfaction"
        subtitle="Note, pression negative, comparaison."
        actions={<Link to="/battle-matrix" className="btn btn-ghost btn-sm">Voir le benchmark</Link>}
      >
        <div className="signal-grid">
          <SignalCard label="Note moyenne marque" value={`${brand.summary.avgRating}/5`} note={compareIsBalanced ? `${displayBrandTotal.toLocaleString('fr-FR')} avis ratio | ${brandScraped} scraping_brand | ${brandCxImported} voix_client_cx` : `${brandScraped} scraping_brand | ${brandCxImported} voix_client_cx`} info="Moyenne des notes disponibles cote Fnac Darty, en combinant scrape marque et base CX importee." tone="neutral" />
          <SignalCard label="Top irritant" value={topFriction?.label || 'n/a'} note={topFriction ? `${topFriction.count} cas | ${topFriction.cityLabel}` : 'pas de foyer dominant'} info="Categorie d irritant la plus frequente dans les avis negatifs marque." tone={topFriction ? 'warning' : 'neutral'} />
          <SignalCard label="Note moyenne concurrent" value={`${competitor.summary.avgRating}/5`} note={compareIsBalanced ? `${displayCompetitorTotal.toLocaleString('fr-FR')} avis ratio | ${competitorScraped} scraping_competitor` : `${competitorScraped} scraping_competitor`} info="Moyenne des notes disponibles cote Boulanger, issue du scraping concurrent." tone="neutral" />
          <SignalCard label="Ecart note" value={`${ratingGap > 0 ? '+' : ''}${ratingGap}`} note={compareIsBalanced ? 'La note reste brute; seuls les volumes sont reequilibres.' : 'Comparaison brute Fnac Darty vs Boulanger'} info="Ecart de note moyenne entre Fnac Darty et Boulanger. Le mode ratio ne modifie pas les moyennes, seulement le contexte de volume." tone={ratingGap < 0 ? 'warning' : 'neutral'} />
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
                  <div key={quote} className="friction-evidence">
                    <ExpandableText text={`"${quote}"`} maxLength={170} />
                  </div>
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
                  {item.evidence[0] && (
                    <div className="battle-pocket-preview">
                      <ExpandableText text={`"${item.evidence[0]}"`} maxLength={160} />
                    </div>
                  )}
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
