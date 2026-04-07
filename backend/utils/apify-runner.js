/**
 * Utilitaire Apify — approche async fiable
 * Evite les timeouts de run-sync-get-dataset-items pour les scrapers lents
 * Pattern: start run → poll status → fetch dataset
 */

const APIFY_BASE = 'https://api.apify.com/v2'
const POLL_INTERVAL_MS = 4000   // vérifie toutes les 4 secondes
const MAX_WAIT_MS = 300_000     // timeout global 5 minutes

function apifyToken() {
  const t = (process.env.APIFY_API_TOKEN || '').trim()
  if (!t) throw new Error('APIFY_API_TOKEN manquant dans .env')
  return t
}

function normalizeActorId(id) {
  // Accepte "username/actor-name" ou "username~actor-name"
  return id.replace('/', '~')
}

async function apifyFetch(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Apify HTTP ${res.status}: ${body.slice(0, 300)}`)
  }
  return res.json()
}

/**
 * Lance un acteur Apify en mode async et attend le résultat
 * @param {string} actorId  ex: "clockworks/tiktok-scraper"
 * @param {object} input    objet JSON d'entrée
 * @returns {Array}         items du dataset
 */
export async function runApifyActor(actorId, input) {
  const token = apifyToken()
  const id = normalizeActorId(actorId)

  // 1. Démarrer le run
  const runData = await apifyFetch(
    `${APIFY_BASE}/acts/${encodeURIComponent(id)}/runs?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    }
  )

  const runId = runData?.data?.id
  if (!runId) throw new Error('Apify: impossible de récupérer le runId')

  // 2. Polling jusqu'à SUCCEEDED
  const deadline = Date.now() + MAX_WAIT_MS
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

    const statusData = await apifyFetch(
      `${APIFY_BASE}/actor-runs/${runId}?token=${token}`
    )

    const status = statusData?.data?.status
    const datasetId = statusData?.data?.defaultDatasetId

    if (status === 'SUCCEEDED' && datasetId) {
      // 3. Récupérer les résultats
      const items = await apifyFetch(
        `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&format=json&clean=true`
      )
      return Array.isArray(items) ? items : []
    }

    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
      throw new Error(`Apify run ${status} (runId: ${runId})`)
    }

    // RUNNING ou READY → on continue à attendre
  }

  throw new Error(`Apify run timeout après ${MAX_WAIT_MS / 1000}s (runId: ${runId})`)
}
