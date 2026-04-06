import { createClient } from '@supabase/supabase-js'
import { completeScrapeRun, createScrapeRun, emitScrapeEvent } from '../services/scrape-events.service.js'
import { runRedditUrsSearch } from '../services/python-social-scrapers.service.js'
import { cleanScrapedText, isUsefulScrapedText } from '../utils/scraper-cleaner.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
)

function resolveTable(targetDb, defaultTable) {
  if (targetDb === 'scraping') return 'scraping_brand'
  if (targetDb === 'competitor') return 'scraping_competitor'
  return defaultTable
}

function emitRunEvent(runId, source, message, extra = {}) {
  emitScrapeEvent({
    type: 'progress',
    runId,
    source,
    level: extra.level || 'info',
    message,
    ...extra
  })
}

async function logScraping(source, status, records = 0, errorMessage = null) {
  if (status === 'running') {
    const { data } = await supabase
      .from('scraping_logs')
      .insert({ source, status: 'running', records_added: 0 })
      .select('id')
      .single()
    return data?.id
  }

  const { data: existing } = await supabase
    .from('scraping_logs')
    .select('id')
    .eq('source', source)
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1)
    .single()

  if (existing) {
    await supabase
      .from('scraping_logs')
      .update({ status, records_added: records, error_message: errorMessage, completed_at: new Date().toISOString() })
      .eq('id', existing.id)
  }
}

function normalizeText(str) {
  return (str || '').toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '').trim()
}

function hashId(prefix, str) {
  const norm = normalizeText(str)
  let hash = 0
  for (let i = 0; i < norm.length; i++) {
    hash = ((hash << 5) - hash) + norm.charCodeAt(i)
    hash |= 0
  }
  return `${prefix}-${Math.abs(hash)}`
}

function cleanText(str) {
  return cleanScrapedText(String(str || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim())
}

function deduplicateRows(rows) {
  const seen = new Set()
  return rows.filter(row => {
    const key = normalizeText(row.text).slice(0, 80)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function scrapeRedditUrs(req, res) {
  const { query = 'Fnac Darty', maxItems = 30, targetDb = 'scraping', massive = false } = req.body
  const table = resolveTable(targetDb, 'voix_client_cx')
  const runId = createScrapeRun({ source: 'Reddit', mode: massive ? 'massive' : 'standard', targetDb, query })
  await logScraping('Reddit', 'running')

  try {
    const requestedMax = parseInt(maxItems, 10) || 30
    const max = massive ? Math.max(requestedMax, 180) : requestedMax
    emitRunEvent(runId, 'Reddit', `Recherche Reddit via wrapper URS/PRAW sur "${query}" (${max} posts cibles)`)
    const results = await runRedditUrsSearch({ query, maxItems: max })
    emitRunEvent(runId, 'Reddit', `${results.length} posts bruts recuperes via Reddit`)

    const rawRows = results.slice(0, max).map(result => {
      const cleanedText = cleanText(result.text || result.title || '')
      return {
        review_id: hashId('rd', `${result.url || query}-${cleanedText.slice(0, 100)}`),
        platform: 'Reddit',
        brand: targetDb === 'competitor' ? query : 'Fnac Darty',
        category: null,
        text: cleanedText,
        date: result.created_utc ? new Date(result.created_utc * 1000).toISOString() : new Date().toISOString(),
        rating: null,
        sentiment: null,
        user_followers: 0,
        is_verified: false,
        language: 'fr',
        location: result.subreddit ? `r/${result.subreddit}` : null,
        source_url: result.url || null,
        share_count: result.score || 0,
        reply_count: result.num_comments || 0
      }
    })

    const rows = deduplicateRows(rawRows)
      .filter(row => row.text?.length > 20)
      .filter(row => isUsefulScrapedText(row.text))

    emitRunEvent(runId, 'Reddit', `${rows.length} posts propres retenus apres nettoyage`, { level: 'success' })

    const { error } = await supabase
      .from(table)
      .upsert(rows, { onConflict: 'review_id', ignoreDuplicates: true })
    if (error) throw error

    await logScraping('Reddit', 'completed', rows.length)
    completeScrapeRun({ runId, source: 'Reddit', inserted: rows.length, table })
    res.json({ success: true, inserted: rows.length, table, message: `${rows.length} posts Reddit importes -> ${table}` })
  } catch (err) {
    await logScraping('Reddit', 'error', 0, err.message)
    completeScrapeRun({ runId, source: 'Reddit', error: err.message })
    res.status(500).json({ success: false, error: err.message })
  }
}
