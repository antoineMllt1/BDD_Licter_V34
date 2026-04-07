import axios from 'axios'
import { createClient } from '@supabase/supabase-js'

const MAKE_TOKEN = process.env.MAKE_API_TOKEN
const MAKE_BASE = 'https://eu1.make.com/api/v2'
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
)

const DEFAULT_WEBHOOKS = {
  5086449: 'https://hook.eu1.make.com/48ywcct20gbr6wi769py3jfo2epqoya5',
}

const SCENARIO_IDS = [5131635, 5131643, 5085615, 5094479, 5094482, 5085608, 5086449]
const MAKE_TEAM_ID = process.env.MAKE_TEAM_ID ? parseInt(process.env.MAKE_TEAM_ID, 10) : null
const MAKE_ORGANIZATION_ID = process.env.MAKE_ORGANIZATION_ID ? parseInt(process.env.MAKE_ORGANIZATION_ID, 10) : null
const LIST_PAGE_SIZE = 100
const WEBHOOKS = buildWebhookMap()

const STATIC_SCENARIOS = [
  { id: 5131635, name: 'BDD2026 - Analyse IA Sentiment scraping_brand', isActive: false, executions: 0, errors: 0, lastEdit: '2026-04-04T12:00:00.000Z', usedPackages: ['supabase', 'openai-gpt-3'] },
  { id: 5131643, name: 'BDD2026 - Analyse IA Sentiment scraping_competitor', isActive: false, executions: 0, errors: 0, lastEdit: '2026-04-04T12:00:00.000Z', usedPackages: ['supabase', 'openai-gpt-3'] },
  { id: 5085615, name: 'BDD2026 - Analyse IA Sentiment OpenAI to Supabase (Fnac Darty)', isActive: false, executions: 37, errors: 10, lastEdit: '2026-04-01T09:18:32.469Z', usedPackages: ['supabase', 'openai-gpt-3'] },
  { id: 5094479, name: 'BDD2026 - Analyse IA Sentiment voix_client_cx', isActive: false, executions: 0, errors: 0, lastEdit: '2026-04-01T15:12:47.000Z', usedPackages: ['supabase', 'openai-gpt-3'] },
  { id: 5094482, name: 'BDD2026 - Analyse IA Sentiment reputation_crise', isActive: false, executions: 0, errors: 0, lastEdit: '2026-04-01T15:12:58.000Z', usedPackages: ['supabase', 'openai-gpt-3'] },
  { id: 5085608, name: 'BDD2026 - Scraping Apify to Supabase (Fnac Darty)', isActive: false, executions: 0, errors: 0, lastEdit: '2026-04-01T07:49:32.002Z', usedPackages: ['http'] },
  { id: 5086449, name: 'BDD2026 - Webhook Sentiment Pipeline (Fnac Darty)', isActive: false, executions: 28, errors: 0, lastEdit: '2026-04-01T08:17:28.913Z', usedPackages: ['gateway', 'supabase', 'openai-gpt-3'] },
]

const PROGRESS_CONFIG = {
  5131635: { table: 'scraping_brand', label: 'sentiment + categorie + note', pending: ['sentiment', 'category', 'rating'] },
  5131643: { table: 'scraping_competitor', label: 'sentiment + categorie + note', pending: ['sentiment', 'category', 'rating'] },
  5085615: { table: 'benchmark_marche', label: 'sentiment', pending: ['sentiment_detected'] },
  5094479: { table: 'voix_client_cx', label: 'sentiment', pending: ['sentiment'] },
  5094482: { table: 'reputation_crise', label: 'sentiment', pending: ['sentiment'] },
  5086449: { table: 'scraping_brand', label: 'sentiment + categorie', pending: ['sentiment', 'category'] }
}

function buildPendingExpression(fields = []) {
  return fields.map((field) => `${field}.is.null`).join(',')
}

function buildWebhookMap() {
  const webhookMap = { ...DEFAULT_WEBHOOKS }

  Object.entries(process.env).forEach(([key, rawValue]) => {
    if (!rawValue) return

    const match = key.match(/^MAKE_WEBHOOK_(\d+)$/) || key.match(/^MAKE_SCENARIO_(\d+)_WEBHOOK_URL$/)
    if (!match) return

    const scenarioId = parseInt(match[1], 10)
    const value = rawValue.trim()

    if (!Number.isInteger(scenarioId) || !value.startsWith('http')) return
    webhookMap[scenarioId] = value
  })

  return webhookMap
}

function getScenarioAccess(id, apiEnabled = Boolean(MAKE_TOKEN)) {
  const hasWebhook = Boolean(WEBHOOKS[id])
  const launchMode = hasWebhook ? 'webhook' : apiEnabled ? 'api' : 'unavailable'
  const controlMode = apiEnabled ? 'api' : 'unavailable'
  const launchHint = hasWebhook
    ? 'Declenchement disponible via webhook.'
    : apiEnabled
      ? 'Declenchement disponible via Make API.'
      : `Ajoutez MAKE_WEBHOOK_${id} dans backend/.env ou regenerez un token Make avec acces a ce scenario.`

  return {
    hasWebhook,
    launchMode,
    controlMode,
    launchHint
  }
}

function withScenarioAccess(scenario, apiEnabled = Boolean(MAKE_TOKEN)) {
  return {
    ...scenario,
    ...getScenarioAccess(Number(scenario.id), apiEnabled)
  }
}

function isScenarioApiEnabled(id, accessibleIds = null) {
  if (!(accessibleIds instanceof Set)) return Boolean(MAKE_TOKEN)
  if (!SCENARIO_IDS.includes(Number(id))) return Boolean(MAKE_TOKEN)
  return accessibleIds.has(Number(id))
}

function mergeScenarios(baseScenarios = [], liveScenarios = []) {
  const merged = new Map()

  baseScenarios.forEach((scenario) => {
    merged.set(Number(scenario.id), scenario)
  })

  liveScenarios.forEach((scenario) => {
    merged.set(Number(scenario.id), {
      ...(merged.get(Number(scenario.id)) || {}),
      ...scenario
    })
  })

  return Array.from(merged.values())
}

function formatMakeError(err, { scenarioId = null, action = 'executer ce scenario' } = {}) {
  const status = err.response?.status || 500
  const code = err.response?.data?.code || 'MAKE_ERROR'
  const remoteMessage = err.response?.data?.message || err.message || 'Erreur Make'

  if (status === 403 && code === 'IM002') {
    return {
      status,
      code,
      message: `Make refuse de ${action}${scenarioId ? ` (${scenarioId})` : ''}: le token n'a plus les droits suffisants. Regenerez MAKE_API_TOKEN depuis le bon team, ou configurez MAKE_WEBHOOK_${scenarioId || '<SCENARIO_ID>'} dans backend/.env.`
    }
  }

  if (status === 400 && code === 'SC400') {
    return {
      status,
      code,
      message: 'Make demande MAKE_TEAM_ID ou MAKE_ORGANIZATION_ID pour lister les scenarios depuis cette cle API.'
    }
  }

  return {
    status,
    code,
    message: remoteMessage
  }
}

async function fetchScenarioById(id) {
  const response = await axios.get(`${MAKE_BASE}/scenarios/${id}`, {
    headers: { Authorization: `Token ${MAKE_TOKEN}` }
  })

  return response.data?.scenario || null
}

async function resolveScenarioScope() {
  if (Number.isInteger(MAKE_TEAM_ID)) {
    return { teamId: MAKE_TEAM_ID }
  }

  if (Number.isInteger(MAKE_ORGANIZATION_ID)) {
    return { organizationId: MAKE_ORGANIZATION_ID }
  }

  for (const scenarioId of SCENARIO_IDS) {
    try {
      const scenario = await fetchScenarioById(scenarioId)
      if (scenario?.teamId) {
        return { teamId: scenario.teamId }
      }
    } catch {
      // Try the next known scenario until one reveals the team scope.
    }
  }

  return null
}

async function fetchAllScenarios() {
  const scope = await resolveScenarioScope()
  if (!scope) return []

  const scenarios = []
  let offset = 0

  while (true) {
    const response = await axios.get(`${MAKE_BASE}/scenarios`, {
      headers: { Authorization: `Token ${MAKE_TOKEN}` },
      params: {
        ...scope,
        'pg[limit]': LIST_PAGE_SIZE,
        'pg[offset]': offset,
        'pg[sortBy]': 'name',
        'pg[sortDir]': 'asc'
      }
    })

    const page = Array.isArray(response.data?.scenarios) ? response.data.scenarios : []
    scenarios.push(...page)

    if (page.length < LIST_PAGE_SIZE) break
    offset += LIST_PAGE_SIZE
  }

  return scenarios
}

async function fetchSeedScenarios() {
  const results = await Promise.all(
    SCENARIO_IDS.map((id) =>
      fetchScenarioById(id).catch(() => null)
    )
  )

  return results.filter(Boolean)
}

async function fetchPendingCount(config) {
  const { count, error } = await supabase
    .from(config.table)
    .select('*', { count: 'exact', head: true })
    .not('text', 'is', null)
    .neq('text', '')
    .or(buildPendingExpression(config.pending))

  if (error) throw error
  return count || 0
}

export async function getScenarios(req, res) {
  if (!MAKE_TOKEN) {
    return res.json(STATIC_SCENARIOS.map((scenario) => withScenarioAccess(scenario, false)))
  }

  try {
    const scenarios = await fetchAllScenarios()
    const seedScenarios = await fetchSeedScenarios()
    const accessibleIds = new Set(seedScenarios.map((scenario) => Number(scenario.id)))
    const mergedScenarios = mergeScenarios(STATIC_SCENARIOS, scenarios)
    const mergedSeedScenarios = mergeScenarios(STATIC_SCENARIOS, seedScenarios)

    if (mergedScenarios.length > 0) {
      return res.json(
        mergedScenarios.map((scenario) => withScenarioAccess(scenario, isScenarioApiEnabled(scenario.id, accessibleIds)))
      )
    }

    if (mergedSeedScenarios.length > 0) {
      return res.json(
        mergedSeedScenarios.map((scenario) => withScenarioAccess(scenario, isScenarioApiEnabled(scenario.id, accessibleIds)))
      )
    }

    return res.json(STATIC_SCENARIOS.map((scenario) => withScenarioAccess(scenario, false)))
  } catch (err) {
    const makeError = formatMakeError(err, { action: 'lister les scenarios' })
    console.warn(`[make] fallback to static scenarios: ${makeError.message}`)

    try {
      const seedScenarios = await fetchSeedScenarios()
      const accessibleIds = new Set(seedScenarios.map((scenario) => Number(scenario.id)))
      const mergedSeedScenarios = mergeScenarios(STATIC_SCENARIOS, seedScenarios)
      if (mergedSeedScenarios.length > 0) {
        return res.json(
          mergedSeedScenarios.map((scenario) => withScenarioAccess(scenario, isScenarioApiEnabled(scenario.id, accessibleIds)))
        )
      }
    } catch {
      // Fall through to the static fallback.
    }

    return res.json(STATIC_SCENARIOS.map((scenario) => withScenarioAccess(scenario, false)))
  }
}

export async function activateScenario(req, res) {
  const id = parseInt(req.params.id, 10)
  if (!MAKE_TOKEN) {
    return res.status(400).json({ error: 'MAKE_API_TOKEN requis pour activer ou desactiver un scenario.' })
  }

  try {
    await axios.patch(`${MAKE_BASE}/scenarios/${id}`, { isActive: true }, {
      headers: { Authorization: `Token ${MAKE_TOKEN}`, 'Content-Type': 'application/json' }
    })
    res.json({ success: true })
  } catch (err) {
    const makeError = formatMakeError(err, { scenarioId: id, action: 'activer ce scenario' })
    res.status(makeError.status).json({ error: makeError.message, code: makeError.code })
  }
}

export async function deactivateScenario(req, res) {
  const id = parseInt(req.params.id, 10)
  if (!MAKE_TOKEN) {
    return res.status(400).json({ error: 'MAKE_API_TOKEN requis pour activer ou desactiver un scenario.' })
  }

  try {
    await axios.patch(`${MAKE_BASE}/scenarios/${id}`, { isActive: false }, {
      headers: { Authorization: `Token ${MAKE_TOKEN}`, 'Content-Type': 'application/json' }
    })
    res.json({ success: true })
  } catch (err) {
    const makeError = formatMakeError(err, { scenarioId: id, action: 'desactiver ce scenario' })
    res.status(makeError.status).json({ error: makeError.message, code: makeError.code })
  }
}

export async function runScenario(req, res) {
  const id = parseInt(req.params.id, 10)

  if (WEBHOOKS[id]) {
    try {
      await axios.post(WEBHOOKS[id], { source: 'licter-dashboard', triggeredAt: new Date().toISOString() })
      return res.json({ success: true, message: 'Scenario declenche via webhook.', method: 'webhook' })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  if (!MAKE_TOKEN) {
    return res.status(400).json({
      error: `MAKE_API_TOKEN requis dans backend/.env pour lancer ce scenario, ou ajoutez MAKE_WEBHOOK_${id}.`
    })
  }

  try {
    const response = await axios.post(`${MAKE_BASE}/scenarios/${id}/run`, {}, {
      headers: { Authorization: `Token ${MAKE_TOKEN}`, 'Content-Type': 'application/json' }
    })
    res.json({ success: true, data: response.data, method: 'api' })
  } catch (err) {
    const makeError = formatMakeError(err, { scenarioId: id, action: 'executer ce scenario' })
    res.status(makeError.status).json({ error: makeError.message, code: makeError.code })
  }
}

export async function getScenarioProgress(req, res) {
  const id = parseInt(req.params.id, 10)
  const config = PROGRESS_CONFIG[id]

  if (!config) {
    return res.json({ supported: false })
  }

  try {
    const pending = await fetchPendingCount(config)
    res.json({
      supported: true,
      scenarioId: id,
      table: config.table,
      targetLabel: config.label,
      pending
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
