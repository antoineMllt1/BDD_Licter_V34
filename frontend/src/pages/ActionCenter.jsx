import { Link } from 'react-router-dom'
import { GlobalFiltersBar } from '../lib/FilterContext.jsx'
import { useStrategicDashboardData } from '../lib/strategicData.js'
import {
  EvidenceFeed,
  PriorityStack,
  SignalCard,
  StrategicHero,
  StrategicSection,
} from '../components/StrategicUI.jsx'

function LoadingState() {
  return (
    <div className="strategic-hero loading-wrap">
      <div className="spinner" />
      <div className="loading-text">Assemblage de l Action Center...</div>
    </div>
  )
}

function groupByOwner(items) {
  return Object.entries(
    items.reduce((accumulator, item) => {
      const key = item.owner || 'A assigner'
      accumulator[key] = (accumulator[key] || 0) + 1
      return accumulator
    }, {})
  ).sort((left, right) => right[1] - left[1])
}

function flattenProofs(items) {
  return items
    .flatMap((item) => item.proofs.map((proof) => ({ ...proof, id: `${item.id}-${proof.id || proof.text}`, source: item.label })))
    .slice(0, 12)
}

export default function ActionCenter() {
  const { loading, error, actionModel, storeModel } = useStrategicDashboardData()

  if (loading) return <LoadingState />

  if (error) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <div className="empty-text">Impossible de charger l Action Center</div>
        <div className="empty-sub">{error}</div>
      </div>
    )
  }

  const nowItems = actionModel.now
  const laterItems = actionModel.later
  const visibleNowItems = nowItems.slice(0, 12)
  const visibleLaterItems = laterItems.slice(0, 12)
  const storeNowItems = storeModel.activations.slice(0, 6)
  const allActionItems = [...actionModel.items, ...storeModel.activations]
  const ownerLoad = groupByOwner(allActionItems).slice(0, 6)
  const unassignedCount = allActionItems.filter((item) => item.owner === 'A assigner').length
  const actionFamilies = Object.entries(
    actionModel.items.reduce((accumulator, item) => {
      const key = item.family || 'other'
      accumulator[key] = (accumulator[key] || 0) + 1
      return accumulator
    }, {})
  ).sort((left, right) => right[1] - left[1])
  const sourceCoverage = Array.from(new Set(actionModel.items.map((item) => item.sourceSummary).filter(Boolean))).slice(0, 4)

  return (
    <div>
      <StrategicHero
        eyebrow="Action Center"
        title="Passer des preuves aux decisions."
        summary={
          nowItems[0]
            ? `${nowItems.length} chantiers transverses demandent une execution immediate, auxquels s ajoutent ${storeNowItems.length} activations locales cote magasins. Les decisions agregent maintenant avis, reputation, social et benchmark.`
            : 'Aucune priorite chaude ne remonte sur la periode. Le travail porte surtout sur la planification et la couverture des donnees.'
        }
        whyItMatters="Un dashboard utile transforme les preuves en priorites, les priorites en owners, puis en execution."
        whatNow={
          nowItems[0]
            ? `Lancer maintenant: ${nowItems[0].label.toLowerCase()} avec ${nowItems[0].count} preuves et un impact dominant classe ${nowItems[0].impact.toLowerCase()}.`
            : 'Maintenir une logique de veille et preparer le backlog planifie.'
        }
        actions={[
          { label: 'Retour cockpit', to: '/' },
          { label: 'Voir les magasins', to: '/magasins', kind: 'secondary' },
          { label: 'Exporter le PDF', to: '/comex', kind: 'ghost' },
        ]}
        stats={[
          { label: 'Actions immediates', value: nowItems.length.toLocaleString('fr-FR'), sub: 'Sources: reviews + reputation + social + benchmark', info: 'Actions prioritaires a lancer maintenant a partir des preuves visibles sur plusieurs tables.' },
          { label: 'Actions a planifier', value: laterItems.length.toLocaleString('fr-FR'), sub: 'backlog multi-tables', info: 'Actions de fond ou de suivi, moins urgentes que le flux immediat.' },
          { label: 'Activations magasins', value: storeNowItems.length.toLocaleString('fr-FR'), sub: 'Source: storeModel.activations', info: 'Actions locales recommandees a l echelle des magasins.' },
          { label: 'Actions sans owner', value: unassignedCount.toLocaleString('fr-FR'), sub: 'a assigner', info: 'Nombre d actions encore non attribuees a une equipe.' },
        ]}
      />

      <GlobalFiltersBar />

      <StrategicSection
        title="Ce qu il faut faire maintenant"
        subtitle={
          nowItems.length > visibleNowItems.length
            ? `${nowItems.length} actions immediates consolidees. Cette vue affiche les ${visibleNowItems.length} plus prioritaires avec davantage de preuves.`
            : `${nowItems.length} actions immediates consolidees, avec plus de preuves visibles par decision.`
        }
      >
        <div className="signal-grid" style={{ marginBottom: 18 }}>
          <SignalCard label="Famille dominante" value={actionFamilies[0]?.[0] || 'n/a'} note={actionFamilies[0] ? `${actionFamilies[0][1]} actions` : 'pas de famille dominante'} info="Famille de source qui alimente le plus les decisions: review, reputation, social ou benchmark." tone="neutral" />
          <SignalCard label="Sources couvertes" value={sourceCoverage.length} note={sourceCoverage[0] || 'pas de source'} info="Nombre de blocs de sources visibles dans les actions consolidees." tone="neutral" />
          <SignalCard label="Top owner" value={ownerLoad[0]?.[0] || 'n/a'} note={ownerLoad[0] ? `${ownerLoad[0][1]} actions` : 'pas de charge'} info="Equipe qui porte actuellement le plus d actions dans le flux consolide." tone="neutral" />
          <SignalCard label="Actions concurrent" value={actionModel.items.filter((item) => item.side === 'competitor').length} note="signaux cote Boulanger" info="Nombre d actions derivees de signaux ou Boulanger est la reference ou la pression concurrente." tone="warning" />
        </div>

        <div className="strategic-grid-2">
          <PriorityStack items={visibleNowItems} emptyMessage="Aucune action chaude sur la periode." />
          <EvidenceFeed title="Preuves immediate" items={flattenProofs(visibleNowItems)} emptyMessage="Pas de preuve immediate attachee." />
        </div>

        <div className="action-board">
          {visibleNowItems.map((item) => (
            <div key={item.id} className="action-board-card">
              <div className="action-board-topline">
                <span className={`badge badge-severity-${item.severity || 'medium'}`}>{item.severity || 'medium'}</span>
                <span>{item.owner}</span>
              </div>
              <div className="action-board-title">{item.label}</div>
              <div className="action-board-meta">
                <span>{item.count} preuves</span>
                <span>{item.impact}</span>
                <span>{item.side === 'competitor' ? 'Boulanger' : 'Fnac Darty'}</span>
              </div>
              {item.sourceSummary && <div className="action-board-proof">{item.sourceSummary}</div>}
              {item.proofs.slice(0, 2).map((proof) => (
                <div key={`${item.id}-${proof.id || proof.text}`} className="action-board-proof">"{proof.text}"</div>
              ))}
            </div>
          ))}
        </div>
      </StrategicSection>

      <StrategicSection
        title="Ce qu il faut planifier"
        subtitle={
          laterItems.length > visibleLaterItems.length
            ? `${laterItems.length} actions a planifier. Cette vue affiche les ${visibleLaterItems.length} plus structurantes.`
            : 'Le backlog strategique ne doit pas disparaitre.'
        }
        actions={<Link to="/war-room" className="btn btn-ghost btn-sm">Retour crise</Link>}
      >
        <div className="action-board">
          {visibleLaterItems.map((item) => (
            <div key={item.id} className="action-board-card muted">
              <div className="action-board-topline">
                <span className={`badge badge-severity-${item.severity || 'medium'}`}>{item.severity || 'medium'}</span>
                <span>{item.owner}</span>
              </div>
              <div className="action-board-title">{item.label}</div>
              <div className="action-board-meta">
                <span>{item.count} preuves</span>
                <span>{item.impact}</span>
                <span>{item.category}</span>
              </div>
              {item.sourceSummary && <div className="action-board-proof">{item.sourceSummary}</div>}
              {item.proofs.slice(0, 2).map((proof) => (
                <div key={`${item.id}-${proof.id || proof.text}`} className="action-board-proof">"{proof.text}"</div>
              ))}
            </div>
          ))}
          {laterItems.length === 0 && <div className="evidence-empty">Pas de backlog de planification pour la periode selectionnee.</div>}
        </div>
      </StrategicSection>

      <StrategicSection
        title="Activations reseau magasins"
        subtitle="Le pilotage local doit nourrir l execution centrale."
        actions={<Link to="/magasins" className="btn btn-ghost btn-sm">Voir les magasins</Link>}
      >
        <div className="strategic-grid-2">
          <PriorityStack items={storeNowItems} emptyMessage="Aucune activation magasin sur la periode." />
          <EvidenceFeed title="Preuves locales" items={flattenProofs(storeNowItems)} emptyMessage="Pas de preuve locale disponible." />
        </div>
      </StrategicSection>

      <StrategicSection
        title="Owners et charge"
        subtitle="Qui porte quoi, et ou l assignation reste floue."
      >
        <div className="strategic-grid-2">
          <div className="battle-pocket-card">
            <div className="battle-pocket-title">Charge par owner</div>
            <div className="battle-pocket-list">
              {ownerLoad.map(([owner, count]) => (
                <div key={owner} className="battle-pocket-item">
                  <strong>{owner}</strong>
                  <span>{count} actions</span>
                </div>
              ))}
              {ownerLoad.length === 0 && <div className="evidence-empty">Aucun owner dominant sur la periode.</div>}
            </div>
          </div>

          <div className="battle-pocket-card">
            <div className="battle-pocket-title">Lecture d execution</div>
            <div className="stack-list">
              <div className="compact-metric-row">
                <span>Actions immediates</span>
                <strong>{nowItems.length}</strong>
              </div>
              <div className="compact-metric-row">
                <span>Actions a planifier</span>
                <strong>{laterItems.length}</strong>
              </div>
              <div className="compact-metric-row">
                <span>Actions sans owner</span>
                <strong>{unassignedCount}</strong>
              </div>
              <div className="compact-metric-row">
                <span>Top owner</span>
                <strong>{ownerLoad[0]?.[0] || 'n/a'}</strong>
              </div>
            </div>
          </div>
        </div>
      </StrategicSection>
    </div>
  )
}
