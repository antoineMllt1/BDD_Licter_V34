import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { StatusBadge } from '../components/StatusBadge.jsx'

const SCENARIO_META = {
  5131635: {
    label: 'Enrichir - Scraping Marque',
    desc: "Enrichit les donnees scrapees recentes dans scraping_brand. GPT-4o-mini analyse chaque texte et attribue sentiment et categorie.",
    modules: ['Supabase', 'Iterator', 'OpenAI GPT-4o-mini', 'Supabase'],
    icon: 'AI',
    color: '#6C5CE7',
    progressLabel: 'sentiment + categorie'
  },
  5131643: {
    label: 'Enrichir - Scraping Concurrents',
    desc: "Enrichit les donnees scrapees recentes dans scraping_competitor. GPT-4o-mini analyse chaque texte et attribue sentiment et categorie.",
    modules: ['Supabase', 'Iterator', 'OpenAI GPT-4o-mini', 'Supabase'],
    icon: 'AI',
    color: '#E17055',
    progressLabel: 'sentiment + categorie'
  },
  5085615: {
    label: 'Sentiment - Benchmark Marche',
    desc: 'Lit les enregistrements sans sentiment dans benchmark_marche puis met a jour sentiment_detected.',
    modules: ['Supabase', 'Iterator', 'OpenAI GPT-4o-mini', 'Supabase'],
    icon: 'AI',
    color: 'var(--blue)',
    progressLabel: 'sentiment'
  },
  5094479: {
    label: 'Sentiment - Experience Client',
    desc: 'Lit les enregistrements sans sentiment dans voix_client_cx puis met a jour le champ sentiment.',
    modules: ['Supabase', 'Iterator', 'OpenAI GPT-4o-mini', 'Supabase'],
    icon: 'AI',
    color: 'var(--neutral)',
    progressLabel: 'sentiment'
  },
  5094482: {
    label: 'Sentiment - Reputation & Crise',
    desc: 'Lit les enregistrements sans sentiment dans reputation_crise puis met a jour le champ sentiment.',
    modules: ['Supabase', 'Iterator', 'OpenAI GPT-4o-mini', 'Supabase'],
    icon: 'AI',
    color: 'var(--negative)',
    progressLabel: 'sentiment'
  },
  5085608: {
    label: 'Scraping Apify -> Supabase',
    desc: 'Declenche un actor Apify pour scraper des avis frais et les inserer dans Supabase avec deduplication.',
    modules: ['HTTP Request', 'Iterator', 'HTTP Request'],
    icon: 'AP',
    color: 'var(--primary)'
  },
  5086449: {
    label: 'Webhook Sentiment Pipeline',
    desc: 'Declenche via webhook une pipeline qui lit les donnees en attente, appelle OpenAI puis met a jour Supabase.',
    modules: ['Webhook', 'Supabase', 'Iterator', 'OpenAI', 'Supabase'],
    icon: 'WH',
    color: 'var(--positive)',
    progressLabel: 'sentiment + categorie',
    hasWebhook: true
  }
}

const POLL_INTERVAL_MS = 4000

function buildStageLabels(modules = []) {
  const fallback = ['Demarrage', 'Traitement', 'Finalisation']
  const labels = modules.length ? modules : fallback
  return labels.map((moduleName, index) => ({
    label: index === 0 ? `Init ${moduleName}` : moduleName
  }))
}

function buildRunState(scenario, progressInfo = null) {
  const meta = SCENARIO_META[scenario.id] || {}
  const stages = buildStageLabels(meta.modules || scenario.usedPackages || [])
  const initialPending = progressInfo?.pending ?? null
  return {
    scenarioId: scenario.id,
    status: initialPending === 0 ? 'completed' : 'running',
    progress: initialPending === 0 ? 100 : 6,
    currentStage: 0,
    startedAt: Date.now(),
    initialExecutions: scenario.executions || 0,
    stages,
    initialPending,
    currentPending: initialPending,
    targetLabel: progressInfo?.targetLabel || meta.progressLabel || 'champs',
    message: initialPending === 0
      ? 'Aucune ligne en attente pour ce scenario.'
      : 'Scenario declenche, attente des mises a jour Supabase...'
  }
}

function getRunProgress(runState) {
  if (!runState) return null
  const stageCount = Math.max(1, runState.stages.length)
  const stageProgress = Math.round(((runState.currentStage + 1) / stageCount) * 100)
  return Math.max(runState.progress, Math.min(100, stageProgress))
}

function ScenarioProgress({ runState, color }) {
  if (!runState) return null

  const progress = getRunProgress(runState)

  return (
    <div className="automation-progress">
      <div className="automation-progress-head">
        <div className="automation-progress-title">
          {runState.status === 'completed' ? 'Scenario termine' : runState.status === 'error' ? 'Scenario en erreur' : 'Execution en cours'}
        </div>
        <div className="automation-progress-value">{progress}%</div>
      </div>

      <div className="automation-progress-bar">
        <div
          className={`automation-progress-fill ${runState.status}`}
          style={{ width: `${progress}%`, background: color || 'var(--primary)' }}
        />
      </div>

      <div className="automation-progress-message">{runState.message}</div>
      {runState.initialPending !== null && (
        <div className="automation-progress-message" style={{ marginTop: 4 }}>
          {Math.max(0, runState.initialPending - (runState.currentPending ?? runState.initialPending))} / {runState.initialPending} lignes traitees
          {' · '}
          {runState.currentPending ?? runState.initialPending} restantes a completer ({runState.targetLabel})
        </div>
      )}

      <div className="automation-progress-stages">
        {runState.stages.map((stage, index) => {
          const active = index === runState.currentStage && runState.status === 'running'
          const done = index < runState.currentStage || runState.status === 'completed'
          return (
            <div
              key={`${stage.label}-${index}`}
              className={`automation-stage ${done ? 'done' : ''} ${active ? 'active' : ''}`}
            >
              <span className="automation-stage-dot" />
              <span>{stage.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ScenarioCard({ scenario, runState, onToggle, onRun }) {
  const meta = SCENARIO_META[scenario.id] || {}
  const [loading, setLoading] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    window.setTimeout(() => setToast(null), 3000)
  }

  const handleToggle = async () => {
    setLoading('toggle')
    try {
      await onToggle(scenario)
      showToast(scenario.isActive ? 'Scenario desactive' : 'Scenario active')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(null)
    }
  }

  const handleRun = async () => {
    setLoading('run')
    try {
      const result = await onRun(scenario)
      showToast(result?.message || 'Scenario lance')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="automation-card" style={{ borderLeft: `3px solid ${meta.color || 'var(--primary)'}` }}>
      <div className="automation-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className="automation-icon-chip">{meta.icon || 'MK'}</span>
            <div className="automation-name">{meta.label || scenario.name}</div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
            {scenario.name}
          </div>
          <div className="automation-meta">
            <span>ID: {scenario.id}</span>
            <span>Executions: {scenario.executions || 0}</span>
            {scenario.lastEdit && <span>Modifie: {new Date(scenario.lastEdit).toLocaleDateString('fr-FR')}</span>}
            {scenario.errors > 0 && <span style={{ color: 'var(--negative)' }}>x {scenario.errors} erreurs</span>}
          </div>
        </div>
        <StatusBadge status={scenario.isActive ? 'active' : 'inactive'} />
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>{meta.desc}</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {(meta.modules || scenario.usedPackages || []).map((mod, index) => (
          <span key={`${scenario.id}-${mod}-${index}`} className="badge badge-primary" style={{ fontSize: 10 }}>{mod}</span>
        ))}
      </div>

      <ScenarioProgress runState={runState} color={meta.color} />

      <div className="automation-controls">
        <div className="toggle-wrap">
          <button
            className={`toggle ${scenario.isActive ? 'on' : ''} ${loading === 'toggle' ? 'loading' : ''}`}
            onClick={handleToggle}
            disabled={loading !== null}
            title={scenario.isActive ? 'Desactiver' : 'Activer'}
          />
          <span className="toggle-label">{scenario.isActive ? 'Actif' : 'Inactif'}</span>
        </div>

        <button
          className="btn btn-secondary btn-sm"
          onClick={handleRun}
          disabled={loading !== null || runState?.status === 'running'}
        >
          {loading === 'run' ? (
            <><span className="spinner" style={{ width: 11, height: 11, borderWidth: 2 }} />Execution...</>
          ) : runState?.status === 'running' ? 'Scenario en cours...' : '> Lancer maintenant'}
        </button>

        {meta.hasWebhook && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Webhook disponible
          </span>
        )}
      </div>

      {toast && (
        <div
          style={{
            marginTop: 10,
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            fontWeight: 500,
            background: toast.type === 'error' ? 'var(--negative-light)' : 'var(--positive-light)',
            color: toast.type === 'error' ? 'var(--negative)' : 'var(--positive)',
            border: `1px solid ${toast.type === 'error' ? '#F8BBD9' : '#B2E8D8'}`
          }}
        >
          {toast.type === 'error' ? 'x' : 'ok'} {toast.msg}
        </div>
      )}
    </div>
  )
}

export default function Automation() {
  const [scenarios, setScenarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [runStates, setRunStates] = useState({})

  const loadScenarios = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getMakeScenarios()
      setScenarios(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
      setScenarios([
        { id: 5131635, name: 'BDD2026 - Analyse IA Sentiment scraping_brand', isActive: false, executions: 0, errors: 0, lastEdit: '2026-04-04T12:00:00.000Z', usedPackages: ['supabase', 'openai-gpt-3'] },
        { id: 5131643, name: 'BDD2026 - Analyse IA Sentiment scraping_competitor', isActive: false, executions: 0, errors: 0, lastEdit: '2026-04-04T12:00:00.000Z', usedPackages: ['supabase', 'openai-gpt-3'] },
        { id: 5085615, name: 'BDD2026 - Analyse IA Sentiment benchmark_marche', isActive: false, executions: 37, errors: 10, lastEdit: '2026-04-01T09:18:32.469Z', usedPackages: ['supabase', 'openai-gpt-3'] },
        { id: 5094479, name: 'BDD2026 - Analyse IA Sentiment voix_client_cx', isActive: false, executions: 0, errors: 0, lastEdit: '2026-04-01T15:12:47.000Z', usedPackages: ['supabase', 'openai-gpt-3'] },
        { id: 5094482, name: 'BDD2026 - Analyse IA Sentiment reputation_crise', isActive: false, executions: 0, errors: 0, lastEdit: '2026-04-01T15:12:58.000Z', usedPackages: ['supabase', 'openai-gpt-3'] },
        { id: 5085608, name: 'BDD2026 - Scraping Apify to Supabase (Fnac Darty)', isActive: false, executions: 0, errors: 0, lastEdit: '2026-04-01T07:49:32.002Z', usedPackages: ['http'] },
        { id: 5086449, name: 'BDD2026 - Webhook Sentiment Pipeline (Fnac Darty)', isActive: false, executions: 28, errors: 0, lastEdit: '2026-04-01T08:17:28.913Z', usedPackages: ['gateway', 'supabase', 'openai-gpt-3'] }
      ])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadScenarios()
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRunStates((current) => {
        const next = { ...current }
        let changed = false

        Object.values(next).forEach((runState) => {
          if (!runState || runState.status !== 'running') return

          if (runState.initialPending !== null) return

          const elapsed = Date.now() - runState.startedAt
          const stageDuration = 3200
          const nextStage = Math.min(runState.stages.length - 1, Math.floor(elapsed / stageDuration))
          const nextProgress = Math.min(92, 10 + Math.floor(elapsed / 900))

          if (nextStage !== runState.currentStage || nextProgress !== runState.progress) {
            runState.currentStage = nextStage
            runState.progress = nextProgress
            runState.message = `Etape ${nextStage + 1}/${runState.stages.length}: ${runState.stages[nextStage]?.label || 'Traitement'}`
            changed = true
          }
        })

        return changed ? { ...next } : current
      })
    }, 800)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const hasRunning = Object.values(runStates).some((runState) => runState?.status === 'running')
    if (!hasRunning) return undefined

    const poll = window.setInterval(async () => {
      try {
        const latest = await api.getMakeScenarios()
        if (!Array.isArray(latest)) return

        setScenarios(latest)
        const progressEntries = await Promise.all(
          Object.values(runStates)
            .filter((runState) => runState?.status === 'running')
            .map(async (runState) => {
              try {
                const progress = await api.getScenarioProgress(runState.scenarioId)
                return [runState.scenarioId, progress]
              } catch {
                return [runState.scenarioId, null]
              }
            })
        )

        const progressMap = new Map(progressEntries)
        setRunStates((current) => {
          const next = { ...current }
          let changed = false

          latest.forEach((scenario) => {
            const runState = next[scenario.id]
            if (!runState || runState.status !== 'running') return

            const progressInfo = progressMap.get(scenario.id)
            if (progressInfo?.supported && runState.initialPending !== null) {
              const currentPending = progressInfo.pending ?? 0
              const completed = Math.max(0, runState.initialPending - currentPending)
              const nextProgress = runState.initialPending > 0
                ? Math.min(100, Math.round((completed / runState.initialPending) * 100))
                : 100
              const nextStage = Math.min(
                runState.stages.length - 1,
                Math.floor((nextProgress / 100) * runState.stages.length)
              )

              next[scenario.id] = {
                ...runState,
                currentPending,
                progress: nextProgress,
                currentStage: nextProgress >= 100 ? runState.stages.length - 1 : nextStage,
                status: currentPending === 0 ? 'completed' : 'running',
                message: currentPending === 0
                  ? `Scenario termine: tous les champs ${runState.targetLabel} ont ete completes.`
                  : `${completed} lignes traitees, ${currentPending} restantes dans ${progressInfo.table}.`
              }
              changed = true
              return
            }

            if ((scenario.executions || 0) > runState.initialExecutions) {
              next[scenario.id] = {
                ...runState,
                status: 'completed',
                progress: 100,
                currentStage: runState.stages.length - 1,
                message: 'Scenario confirme comme termine.'
              }
              changed = true
            }
          })

          return changed ? next : current
        })
      } catch {
        // Silent fallback: the local gauge keeps progressing even if polling fails.
      }
    }, POLL_INTERVAL_MS)

    return () => window.clearInterval(poll)
  }, [runStates])

  const scenarioMap = useMemo(
    () => new Map(scenarios.map((scenario) => [scenario.id, scenario])),
    [scenarios]
  )

  const handleToggle = async (scenario) => {
    if (scenario.isActive) {
      await api.deactivateScenario(scenario.id)
    } else {
      await api.activateScenario(scenario.id)
    }

    await loadScenarios()
  }

  const handleRun = async (scenario) => {
    let progressInfo = null
    try {
      progressInfo = await api.getScenarioProgress(scenario.id)
    } catch {
      progressInfo = null
    }

    setRunStates((current) => ({
      ...current,
      [scenario.id]: buildRunState(scenario, progressInfo?.supported ? progressInfo : null)
    }))

    try {
      const result = await api.runScenario(scenario.id)
      setRunStates((current) => ({
        ...current,
        [scenario.id]: {
          ...(current[scenario.id] || buildRunState(scenario, progressInfo?.supported ? progressInfo : null)),
          message: result?.method === 'webhook'
            ? 'Scenario declenche via webhook, suivi des champs en base...'
            : 'Scenario envoye a Make, suivi des champs en base...'
        }
      }))
      return result
    } catch (err) {
      setRunStates((current) => ({
        ...current,
        [scenario.id]: {
          ...(current[scenario.id] || buildRunState(scenario, progressInfo?.supported ? progressInfo : null)),
          status: 'error',
          progress: 100,
          message: err.message
        }
      }))
      throw err
    }
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Automatisation Make.com</div>
            <div className="page-subtitle">Pilotage des scenarios BDD2026 - eu1.make.com</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={loadScenarios} disabled={loading}>
            Actualiser
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'var(--neutral-light)', border: '1px solid #F0CC89', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 20, fontSize: 12 }}>
          Backend non demarre : affichage des donnees statiques. Demarrez avec <code>npm run dev:backend</code> et configurez <code>MAKE_API_TOKEN</code>.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0, marginBottom: 24 }}>
        {loading ? (
          <div className="loading-wrap"><div className="spinner" /><div className="loading-text">Chargement des scenarios...</div></div>
        ) : scenarios.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">MK</div><div className="empty-text">Aucun scenario trouve</div></div>
        ) : (
          scenarios.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenarioMap.get(scenario.id) || scenario}
              runState={runStates[scenario.id]}
              onToggle={handleToggle}
              onRun={handleRun}
            />
          ))
        )}
      </div>
    </div>
  )
}
