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

export const api = {
  // Scraping
  scrapeTrustpilot: (body) => req('POST', '/scrape/trustpilot', body),
  scrapeGoogleReviews: (body) => req('POST', '/scrape/google-reviews', body),
  scrapeTwitter: (body) => req('POST', '/scrape/twitter', body),
  getScrapingLogs: () => req('GET', '/scrape/logs'),

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
