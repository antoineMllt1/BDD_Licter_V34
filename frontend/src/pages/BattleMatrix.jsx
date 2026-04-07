import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
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
import ExpandableText from '../components/ExpandableText.jsx'
import {
  SignalCard,
  StrategicHero,
  StrategicSection,
} from '../components/StrategicUI.jsx'

function LoadingState() {
  return (
    <div className="strategic-hero loading-wrap">
      <div className="spinner" />
      <div className="loading-text">Assemblage de la Battle Matrix...</div>
    </div>
  )
}

function winnerTone(winner) {
  if (winner === 'brand') return 'brand'
  if (winner === 'competitor') return 'competitor'
  return 'neutral'
}

function winnerLabel(winner) {
  if (winner === 'brand') return 'Avantage Fnac Darty'
  if (winner === 'competitor') return 'Avantage Boulanger'
  return 'Zone neutre'
}

function proofLabel(mode) {
  if (mode === 'brand') return 'Preuves Fnac Darty'
  if (mode === 'competitor') return 'Preuves Boulanger'
  return 'Preuves benchmark'
}

function selectProofs(dimension, mode = 'winner') {
  if (mode === 'brand') return dimension.brandProofs || []
  if (mode === 'competitor') return dimension.competitorProofs || []
  if (mode === 'mixed') return dimension.proofs || []
  if (dimension.winner === 'brand') return dimension.brandProofs || []
  if (dimension.winner === 'competitor') return dimension.competitorProofs || []
  return dimension.proofs || []
}

function scaleValue(value, factor) {
  return Math.round((Number(value) || 0) * factor)
}

function BattlePocketItem({ dimension, proofMode = 'winner' }) {
  const proofs = selectProofs(dimension, proofMode)
  const previewProof = proofs[0]?.text || null
  const topicLabel = proofMode === 'brand'
    ? dimension.brandTopTopic
    : proofMode === 'competitor'
      ? dimension.competitorTopTopic
      : dimension.topTopic

  return (
    <div className="battle-pocket-item">
      <strong>{dimension.label}</strong>
      <div className="battle-pocket-topic">Topic dominant: {topicLabel}</div>
      <div className="battle-pocket-preview">
        {previewProof
          ? <ExpandableText text={`"${previewProof}"`} maxLength={160} />
          : 'Pas de verbatim benchmark exploitable sur cette dimension.'}
      </div>
      {(proofs[0]?.source || proofs.length > 0) && (
        <div className="battle-proof-meta" style={{ marginTop: 8 }}>
          <span>{proofLabel(proofMode)}</span>
          <span>{proofs.length} preuves</span>
          {proofs[0]?.source && <span>{proofs[0].source}</span>}
        </div>
      )}
    </div>
  )
}

export default function BattleMatrix() {
  const { loading, error, battleModel } = useStrategicDashboardData()
  const [compareMode, setCompareMode] = useState('raw')
  const comparisonBase = useMemo(() => {
    if (!battleModel?.brandMentions || !battleModel?.competitorMentions) return 0
    return Math.min(battleModel.brandMentions, battleModel.competitorMentions)
  }, [battleModel?.brandMentions, battleModel?.competitorMentions])
  const brandFactor = comparisonBase && battleModel?.brandMentions ? comparisonBase / battleModel.brandMentions : 1
  const competitorFactor = comparisonBase && battleModel?.competitorMentions ? comparisonBase / battleModel.competitorMentions : 1
  const compareIsBalanced = compareMode === 'balanced' && comparisonBase > 0
  const normalizedDimensions = useMemo(() => (battleModel?.dimensions || []).map((dimension) => {
    const brandScore = compareIsBalanced ? scaleValue(dimension.brandScore, brandFactor) : dimension.brandScore
    const competitorScore = compareIsBalanced ? scaleValue(dimension.competitorScore, competitorFactor) : dimension.competitorScore
    return {
      ...dimension,
      brandScore,
      competitorScore,
      delta: brandScore - competitorScore,
      winner: brandScore > competitorScore ? 'brand' : brandScore < competitorScore ? 'competitor' : 'tie',
    }
  }), [battleModel?.dimensions, compareIsBalanced, brandFactor, competitorFactor])

  if (loading) return <LoadingState />

  if (error) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <div className="empty-text">Impossible de charger la Battle Matrix</div>
        <div className="empty-sub">{error}</div>
      </div>
    )
  }

  const winningDimensions = normalizedDimensions.filter((dimension) => dimension.winner === 'brand')
  const losingDimensions = normalizedDimensions.filter((dimension) => dimension.winner === 'competitor')
  const chartData = normalizedDimensions.slice(0, 8).map((dimension) => ({
    name: dimension.label,
    brand: dimension.brandScore,
    competitor: dimension.competitorScore,
  }))
  const displayBrandMentions = compareIsBalanced ? scaleValue(battleModel.brandMentions, brandFactor) : battleModel.brandMentions
  const displayCompetitorMentions = compareIsBalanced ? scaleValue(battleModel.competitorMentions, competitorFactor) : battleModel.competitorMentions
  const imbalanceRatio = comparisonBase
    ? (Math.max(battleModel.brandMentions, battleModel.competitorMentions) / comparisonBase)
    : null

  return (
    <div>
      <StrategicHero
        eyebrow="Battle Matrix"
        title="Voir ou Fnac Darty gagne, cede ou peut reprendre du terrain."
        summary={
          losingDimensions[0]
            ? `Boulanger prend de la place sur ${losingDimensions[0].label.toLowerCase()}, alors que Fnac Darty garde la main sur ${winningDimensions[0] ? winningDimensions[0].label.toLowerCase() : 'ses dimensions coeur'}.`
            : 'Le terrain concurrentiel reste relativement equilibre. Il faut exploiter les dimensions ou Fnac Darty peut accelerer sans diluer son positionnement.'
        }
        whyItMatters="Le benchmark doit montrer les territoires gagnes, ceux a defendre et les angles d attaque."
        whatNow={
          losingDimensions[0]
            ? `A reprendre maintenant: ${losingDimensions[0].label.toLowerCase()}, sujet dominant ${losingDimensions[0].topTopic.toLowerCase()}.`
            : 'A faire maintenant: securiser les dimensions neutres avant qu elles ne basculent cote concurrent.'
        }
        actions={[
          { label: 'Voir la crise', to: '/war-room' },
          { label: 'Voir les clients', to: '/voix-du-client', kind: 'secondary' },
          { label: 'Retour cockpit', to: '/', kind: 'ghost' },
        ]}
        stats={[
          { label: compareIsBalanced ? 'Mentions Fnac Darty ratio' : 'Mentions Fnac Darty', value: displayBrandMentions.toLocaleString('fr-FR'), sub: 'Source: benchmark_marche', info: compareIsBalanced ? 'Mentions Fnac Darty ramenees au volume Boulanger pour comparer les dimensions.' : 'Nombre de lignes benchmark attribuees a Fnac Darty.' },
          { label: compareIsBalanced ? 'Mentions Boulanger ratio' : 'Mentions Boulanger', value: displayCompetitorMentions.toLocaleString('fr-FR'), sub: 'Source: benchmark_marche', info: compareIsBalanced ? 'Mentions Boulanger ramenees au meme ordre de grandeur de comparaison.' : 'Nombre de lignes benchmark attribuees a Boulanger.' },
          { label: 'Dimensions perdues', value: losingDimensions.length.toLocaleString('fr-FR'), sub: 'Boulanger devant', info: 'Nombre de dimensions ou le score concurrent est superieur au score marque.' },
          { label: 'Dimensions gagnees', value: winningDimensions.length.toLocaleString('fr-FR'), sub: 'Fnac Darty devant', info: 'Nombre de dimensions ou le score marque est superieur au score concurrent.' },
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
              ? `Mode equilibre: les mentions benchmark sont ramenees a ${comparisonBase.toLocaleString('fr-FR')} lignes pour comparer les dimensions.`
              : 'Mode brut: les scores restent fondes sur les volumes benchmark reels.'}
          </span>
          {imbalanceRatio && imbalanceRatio > 1.2 ? <span className="badge badge-primary" style={{ fontSize: 11 }}>ecart x{imbalanceRatio.toFixed(1)}</span> : null}
        </div>
      </div>

      <StrategicSection
        title="Scorecard concurrentielle"
        subtitle="Lecture rapide du rapport de force."
        actions={<Link to="/action-center" className="btn btn-ghost btn-sm">Voir les actions</Link>}
      >
        <div className="signal-grid" style={{ marginBottom: 18 }}>
          <SignalCard label="Part de voix marque" value={`${battleModel.sovBrand}%`} note={compareIsBalanced ? `${displayBrandMentions.toLocaleString('fr-FR')} mentions ratio | benchmark_marche` : 'Source: benchmark_marche | Fnac Darty'} info="Part des mentions benchmark attribuees a Fnac Darty. Le ratio repondere les volumes mais ne change pas la part de voix brute." tone="neutral" />
          <SignalCard label="Part de voix concurrent" value={`${battleModel.sovCompetitor}%`} note={compareIsBalanced ? `${displayCompetitorMentions.toLocaleString('fr-FR')} mentions ratio | benchmark_marche` : 'Source: benchmark_marche | Boulanger'} info="Part des mentions benchmark attribuees a Boulanger. Le ratio repondere les volumes mais ne change pas la part de voix brute." tone="warning" />
          <SignalCard label="Dimensions a defendre" value={losingDimensions.length} note="Source: benchmark_marche | retard marque" info="Dimensions ou Boulanger prend l avantage sur le score compare." tone={losingDimensions.length > 2 ? 'warning' : 'neutral'} />
          <SignalCard label="Dimensions a ouvrir" value={battleModel.whiteSpaces.length} note="Source: benchmark_marche | zones arbitrables" info="Dimensions encore peu tranchees entre marque et concurrent." tone="neutral" />
        </div>

        <div className="strategic-grid-2">
          <ChartCard title="Comparatif par dimension" icon="MKT" meta="score positif moins negatif">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="brand" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="competitor" fill="#F97316" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="battle-pocket-grid">
            <div className="battle-pocket-card">
            <div className="battle-pocket-title">Territoires gagnes</div>
            <div className="battle-pocket-list">
              {(winningDimensions.slice(0, 4)).map((dimension) => (
                <BattlePocketItem key={dimension.id} dimension={dimension} proofMode="brand" />
                ))}
                {winningDimensions.length === 0 && <div className="evidence-empty">Aucun territoire franchement gagne sur la periode.</div>}
              </div>
            </div>

            <div className="battle-pocket-card">
            <div className="battle-pocket-title">Territoires perdus</div>
            <div className="battle-pocket-list">
              {(losingDimensions.slice(0, 4)).map((dimension) => (
                <BattlePocketItem key={dimension.id} dimension={dimension} proofMode="competitor" />
                ))}
                {losingDimensions.length === 0 && <div className="evidence-empty">Aucun territoire nettement perdu sur la periode.</div>}
              </div>
            </div>
          </div>
        </div>
      </StrategicSection>

      <StrategicSection
        title="Dimensions gagnantes et perdantes"
        subtitle="Ou Fnac Darty gagne, cede, et sur quel sujet."
      >
        <div className="battle-dimension-list">
          {normalizedDimensions.slice(0, 10).map((dimension) => (
            <div key={dimension.id} className={`battle-dimension-card ${winnerTone(dimension.winner)}`}>
              <div className="battle-dimension-topline">
                <span className={`badge ${dimension.winner === 'brand' ? 'badge-primary' : dimension.winner === 'competitor' ? 'badge-orange' : 'badge-neutral'}`}>
                  {winnerLabel(dimension.winner)}
                </span>
                <span className="battle-dimension-delta">
                  {dimension.delta >= 0 ? '+' : ''}{dimension.delta}
                </span>
              </div>
              <div className="battle-dimension-title">{dimension.label}</div>
              <div className="battle-dimension-meta">
                <span>Topic dominant: {dimension.topTopic}</span>
                <span>Fnac Darty {dimension.brandScore}</span>
                <span>Boulanger {dimension.competitorScore}</span>
              </div>
            </div>
          ))}
        </div>
      </StrategicSection>

      <StrategicSection
        title="Ou ouvrir, proteger, pousser"
        subtitle="Trois listes courtes: zones neutres, sujets a proteger, sujets a pousser."
      >
        <div className="battle-pocket-grid battle-pocket-grid-3">
          <div className="battle-pocket-card">
            <div className="battle-pocket-title">Zones neutres</div>
            <div className="battle-pocket-list">
              {normalizedDimensions.filter((dimension) => dimension.winner === 'tie').slice(0, 5).map((dimension) => (
                <BattlePocketItem key={dimension.id} dimension={dimension} proofMode="mixed" />
              ))}
              {normalizedDimensions.filter((dimension) => dimension.winner === 'tie').length === 0 && <div className="evidence-empty">Aucun white space clair pour le moment.</div>}
            </div>
          </div>

          <div className="battle-pocket-card">
            <div className="battle-pocket-title">A proteger</div>
            <div className="battle-pocket-list">
              {losingDimensions.slice(0, 5).map((dimension) => (
                <BattlePocketItem key={dimension.id} dimension={dimension} proofMode="competitor" />
              ))}
              {losingDimensions.length === 0 && <div className="evidence-empty">Aucun sujet de defense dominant.</div>}
            </div>
          </div>

          <div className="battle-pocket-card">
            <div className="battle-pocket-title">A pousser</div>
            <div className="battle-pocket-list">
              {winningDimensions.slice(0, 5).map((dimension) => (
                <BattlePocketItem key={dimension.id} dimension={dimension} proofMode="brand" />
              ))}
              {winningDimensions.length === 0 && <div className="evidence-empty">Aucun angle d attaque tres net sur la periode.</div>}
            </div>
          </div>
        </div>
      </StrategicSection>
    </div>
  )
}
