const BASE = '/api'

async function req(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${BASE}${path}`, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Erreur serveur')
  }
  return res.json()
}

function openScrapeStream(onMessage, onStatusChange) {
  const stream = new EventSource(`${BASE}/scrape/stream`)
  stream.onopen = () => onStatusChange?.(true)
  stream.onerror = () => onStatusChange?.(false)
  stream.onmessage = (event) => {
    try {
      onMessage?.(JSON.parse(event.data))
    } catch {
      onMessage?.({ type: 'progress', level: 'info', message: event.data, timestamp: new Date().toISOString() })
    }
  }
  return () => stream.close()
}

export const api = {
  // Scraping
  scrapeTrustpilot: (body) => req('POST', '/scrape/trustpilot', body),
  scrapeGoogleReviews: (body) => req('POST', '/scrape/google-reviews', body),
  scrapeReddit: (body) => req('POST', '/scrape/reddit', body),
  scrapeTwitter: (body) => req('POST', '/scrape/twitter', body),
  getScrapeSchedule: () => req('GET', '/scrape/schedule'),
  saveScrapeSchedule: (body) => req('PUT', '/scrape/schedule', body),
  runScrapeScheduleNow: () => req('POST', '/scrape/schedule/run'),
  getScrapingLogs: () => req('GET', '/scrape/logs'),
  openScrapeStream,

  // Make.com
  getMakeScenarios: () => req('GET', '/make/scenarios'),
  activateScenario: (id) => req('POST', `/make/scenarios/${id}/activate`),
  deactivateScenario: (id) => req('POST', `/make/scenarios/${id}/deactivate`),
  runScenario: (id) => req('POST', `/make/scenarios/${id}/run`),

  // COMEX PDF (special: returns blob)
  generateComex: async (body) => {
    const res = await fetch(`${BASE}/comex/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || 'Erreur génération PDF')
    }
    return res.blob()
  }
}
