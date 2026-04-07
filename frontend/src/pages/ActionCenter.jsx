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
    .slice(0, 6)
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
  const storeNowItems = storeModel.activations.slice(0, 4)
  const allActionItems = [...actionModel.items, ...storeModel.activations]
  const ownerLoad = groupByOwner(allActionItems).slice(0, 6)
  const unassignedCount = allActionItems.filter((item) => item.owner === 'A assigner').length

  return (
    <div>
      <StrategicHero
        eyebrow="Action Center"
        title="Passer des preuves aux decisions."
        summary={
          nowItems[0]
            ? `${nowItems.length} chantiers transverses demandent une execution immediate, auxquels s ajoutent ${storeNowItems.length} activations locales cote magasins.`
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
          { label: 'A lancer maintenant', value: nowItems.length.toLocaleString('fr-FR'), sub: 'actions chaudes' },
          { label: 'A planifier', value: laterItems.length.toLocaleString('fr-FR'), sub: 'actions de fond' },
          { label: 'Activations magasins', value: storeNowItems.length.toLocaleString('fr-FR'), sub: 'chantiers reseau locaux' },
          { label: 'Owners exposes', value: ownerLoad.length.toLocaleString('fr-FR'), sub: `${unassignedCount} actions a assigner` },
          { label: 'Top priorite', value: actionModel.top3[0]?.owner || storeNowItems[0]?.owner || 'n/a', sub: actionModel.top3[0]?.label || storeNowItems[0]?.label || 'aucun signal fort' },
        ]}
      />

      <GlobalFiltersBar />

      <StrategicSection
        title="Ce qu il faut faire maintenant"
        subtitle="Peu d actions, bien assignees, bien prouvees."
      >
        <div className="strategic-grid-2">
          <PriorityStack items={nowItems.slice(0, 6)} emptyMessage="Aucune action chaude sur la periode." />
          <EvidenceFeed title="Preuves immediate" items={flattenProofs(nowItems)} emptyMessage="Pas de preuve immediate attachee." />
        </div>

        <div className="action-board">
          {nowItems.slice(0, 6).map((item) => (
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
              {item.proofs[0] && <div className="action-board-proof">"{item.proofs[0].text}"</div>}
            </div>
          ))}
        </div>
      </StrategicSection>

      <StrategicSection
        title="Ce qu il faut planifier"
        subtitle="Le backlog strategique ne doit pas disparaitre."
        actions={<Link to="/war-room" className="btn btn-ghost btn-sm">Retour crise</Link>}
      >
        <div className="action-board">
          {laterItems.slice(0, 8).map((item) => (
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
              {item.proofs[0] && <div className="action-board-proof">"{item.proofs[0].text}"</div>}
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
