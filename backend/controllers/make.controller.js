import axios from 'axios'

const MAKE_TOKEN = process.env.MAKE_API_TOKEN
const MAKE_BASE = 'https://eu1.make.com/api/v2'

// Webhook URL for scenario 5086449 — no token required
const WEBHOOKS = {
  5086449: 'https://hook.eu1.make.com/48ywcct20gbr6wi769py3jfo2epqoya5',
}

const SCENARIO_IDS = [5085615, 5094479, 5094482, 5085608, 5086449]

// Static fallback data (always shown if no token)
const STATIC_SCENARIOS = [
  { id: 5085615, name: 'BDD2026 - Analyse IA Sentiment OpenAI to Supabase (Fnac Darty)', isActive: false, executions: 37, errors: 10, lastEdit: '2026-04-01T09:18:32.469Z', usedPackages: ['supabase', 'openai-gpt-3'] },
  { id: 5085608, name: 'BDD2026 - Scraping Apify to Supabase (Fnac Darty)', isActive: false, executions: 0, errors: 0, lastEdit: '2026-04-01T07:49:32.002Z', usedPackages: ['http'] },
  { id: 5086449, name: 'BDD2026 - Webhook Sentiment Pipeline (Fnac Darty)', isActive: false, executions: 28, errors: 0, lastEdit: '2026-04-01T08:17:28.913Z', usedPackages: ['gateway', 'supabase', 'openai-gpt-3'] },
]

export async function getScenarios(req, res) {
  if (!MAKE_TOKEN) return res.json(STATIC_SCENARIOS)
  try {
    const results = await Promise.all(
      SCENARIO_IDS.map(id =>
        axios.get(`${MAKE_BASE}/scenarios/${id}`, { headers: { Authorization: `Token ${MAKE_TOKEN}` } })
          .then(r => r.data.scenario).catch(() => null)
      )
    )
    res.json(results.filter(Boolean))
  } catch (err) {
    res.json(STATIC_SCENARIOS)
  }
}

export async function activateScenario(req, res) {
  const id = parseInt(req.params.id)
  if (!MAKE_TOKEN) return res.status(400).json({ error: 'MAKE_API_TOKEN requis pour activer/désactiver' })
  try {
    await axios.patch(`${MAKE_BASE}/scenarios/${id}`, { isActive: true }, {
      headers: { Authorization: `Token ${MAKE_TOKEN}`, 'Content-Type': 'application/json' }
    })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function deactivateScenario(req, res) {
  const id = parseInt(req.params.id)
  if (!MAKE_TOKEN) return res.status(400).json({ error: 'MAKE_API_TOKEN requis pour activer/désactiver' })
  try {
    await axios.patch(`${MAKE_BASE}/scenarios/${id}`, { isActive: false }, {
      headers: { Authorization: `Token ${MAKE_TOKEN}`, 'Content-Type': 'application/json' }
    })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function runScenario(req, res) {
  const id = parseInt(req.params.id)

  // Scenario 5086449 has a webhook — trigger directly, no token needed
  if (WEBHOOKS[id]) {
    try {
      await axios.post(WEBHOOKS[id], { source: 'licter-dashboard', triggeredAt: new Date().toISOString() })
      return res.json({ success: true, message: 'Scénario déclenché via webhook ✓', method: 'webhook' })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  // Other scenarios need the API token
  if (!MAKE_TOKEN) return res.status(400).json({ error: 'MAKE_API_TOKEN requis dans backend/.env pour lancer ce scénario' })
  try {
    const response = await axios.post(`${MAKE_BASE}/scenarios/${id}/run`, {}, {
      headers: { Authorization: `Token ${MAKE_TOKEN}`, 'Content-Type': 'application/json' }
    })
    res.json({ success: true, data: response.data, method: 'api' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
