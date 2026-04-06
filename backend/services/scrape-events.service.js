const clients = new Set()
const history = []
const HISTORY_LIMIT = 300

function toEventPayload(payload = {}) {
  return {
    timestamp: new Date().toISOString(),
    ...payload
  }
}

function pushHistory(event) {
  history.push(event)
  if (history.length > HISTORY_LIMIT) {
    history.splice(0, history.length - HISTORY_LIMIT)
  }
}

function broadcast(event) {
  const line = `data: ${JSON.stringify(event)}\n\n`
  for (const client of clients) {
    client.write(line)
  }
}

export function emitScrapeEvent(payload) {
  const event = toEventPayload(payload)
  pushHistory(event)
  broadcast(event)
  return event
}

export function createScrapeRun({ source, mode = 'standard', targetDb = 'scraping', query = null }) {
  const runId = `${source}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  emitScrapeEvent({
    type: 'run_started',
    runId,
    source,
    mode,
    targetDb,
    query,
    level: 'info',
    message: `${source} lance en mode ${mode === 'massive' ? 'recherche massive' : 'standard'}`
  })
  return runId
}

export function completeScrapeRun({ runId, source, inserted = 0, table = null, error = null }) {
  emitScrapeEvent({
    type: error ? 'run_failed' : 'run_completed',
    runId,
    source,
    level: error ? 'error' : 'success',
    inserted,
    table,
    error,
    message: error
      ? `${source} a echoue: ${error}`
      : `${source} termine: ${inserted} lignes ajoutees${table ? ` -> ${table}` : ''}`
  })
}

export function sendScrapeHistory(res) {
  for (const event of history.slice(-120)) {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }
}

export function registerScrapeStream(res) {
  clients.add(res)
  res.on('close', () => {
    clients.delete(res)
  })
}
