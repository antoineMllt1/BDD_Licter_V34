import { createClient } from '@supabase/supabase-js'
import { completeScrapeRun, createScrapeRun, emitScrapeEvent } from '../services/scrape-events.service.js'
import { runTwikitSearch } from '../services/python-social-scrapers.service.js'

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
  return String(str || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isReviewContent(text) {
  if (!text || text.length < 20) return false
  const t = text.toLowerCase()
  const noise = [
    'sign in',
    'log in',
    'cookie',
    'privacy policy',
    'terms of service'
  ]
  return !noise.some(token => t.includes(token))
}

function extractMetric(item, key, fallback = 0) {
  const value = item?.[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) return Number(value)
  return fallback
}

function isTwikitKeyByteError(error) {
  const message = String(error?.message || error || '')
  return message.includes("Couldn't get KEY_BYTE indices")
}

async function runApifyTwitterSearch({ searchTerm, maxItems }) {
  const token = (process.env.APIFY_API_TOKEN || '').trim()
  const actorIdRaw = (process.env.APIFY_TWITTER_ACTOR_ID || 'scraper-engine/twitter-x-posts-scraper').trim()
  const actorId = actorIdRaw.replace('/', '~')

  if (!token) {
    throw new Error('APIFY_API_TOKEN manquant dans .env')
  }

  const input = {
    startUrls: [{ url: searchTerm }],
    sortOrder: 'recent',
    maxTweets: Math.max(1, Math.min(Number(maxItems) || 50, 100)),
    maxComments: 0
  }

  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(input)
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Apify a repondu ${response.status}: ${message}`)
  }

  return await response.json()
}

async function fetchTwitterResults({ runId, searchTerm, max }) {
  try {
    emitRunEvent(runId, 'Twitter/X', `Recherche X via Apify sur "${searchTerm}" (${max} posts cibles)`)
    const results = await runApifyTwitterSearch({ searchTerm, maxItems: max })
    emitRunEvent(runId, 'Twitter/X', `${results.length} resultats bruts recuperes par Apify`)
    return { results, provider: 'apify' }
  } catch (error) {
    emitRunEvent(
      runId,
      'Twitter/X',
      `Apify indisponible (${String(error?.message || error)}). Tentative de secours via Twikit.`,
      { level: 'warning' }
    )
    emitRunEvent(
      runId,
      'Twitter/X',
      `Recherche X via Twikit sur "${searchTerm}" (${max} posts cibles)`
    )
    const results = await runTwikitSearch({ searchTerm, maxItems: max })
    emitRunEvent(runId, 'Twitter/X', `${results.length} posts bruts recuperes par Twikit`)
    return { results, provider: 'twikit' }
  }
}

export async function scrapeTwitterApify(req, res) {
  const { searchTerm = 'Fnac Darty', maxItems = 50, target = 'reputation', targetDb = 'scraping', massive = false } = req.body
  const requestedMax = parseInt(maxItems, 10) || 50
  const max = massive ? Math.max(requestedMax, 250) : requestedMax
  const runId = createScrapeRun({ source: 'Twitter/X', mode: massive ? 'massive' : 'standard', targetDb, query: searchTerm })
  await logScraping('Twitter/X', 'running')

  try {
    const { results, provider } = await fetchTwitterResults({ runId, searchTerm, max })

    const useScrapeDb = targetDb === 'scraping' || targetDb === 'competitor'
    const table = useScrapeDb
      ? resolveTable(targetDb, 'reputation_crise')
      : (target === 'benchmark' ? 'benchmark_marche' : 'reputation_crise')

    let rows = results
      .slice(0, max)
      .map(item => {
        const text = provider === 'twikit'
          ? cleanText(item?.text)
          : cleanText(item?.description || item?.text || '')

        const base = {
          review_id: hashId('tw', `${item?.url || searchTerm}-${text.slice(0, 80)}`),
          platform: 'Twitter/X',
          text,
          date: item?.created_at || item?.date_posted || new Date().toISOString(),
          source_url: item?.url || null,
          user_followers: provider === 'twikit' ? extractMetric(item, 'author_followers') : extractMetric(item, 'followers'),
          is_verified: provider === 'twikit' ? Boolean(item?.author_verified) : Boolean(item?.is_verified),
          language: item?.lang || 'fr',
          location: provider === 'twikit'
            ? (item?.author_name ? `@${item.author_screen_name || item.author_name}` : null)
            : (item?.user_posted ? `@${item.user_posted}` : item?.name || null),
          share_count: provider === 'twikit' ? extractMetric(item, 'retweet_count') : extractMetric(item, 'reposts'),
          reply_count: provider === 'twikit' ? extractMetric(item, 'reply_count') : extractMetric(item, 'replies')
        }

        if (useScrapeDb) {
          return {
            ...base,
            brand: targetDb === 'competitor' ? searchTerm : 'Fnac Darty',
            category: null,
            rating: null,
            sentiment: null
          }
        }

        if (table === 'reputation_crise') {
          return {
            ...base,
            brand: 'Fnac Darty',
            post_type: 'Social Mention',
            rating: null,
            likes: provider === 'twikit' ? extractMetric(item, 'favorite_count') : extractMetric(item, 'likes'),
            sentiment: null
          }
        }

        return {
          ...base,
          entity_analyzed: searchTerm.toLowerCase().includes('boulanger') ? 'Boulanger' : 'Fnac Darty',
          topic: 'Mention',
          target_brand_vs_competitor: searchTerm.toLowerCase().includes('boulanger') ? 'Competitor' : 'Brand',
          sentiment_detected: null
        }
      })
      .filter(row => row.text?.length > 20)
      .filter(row => isReviewContent(row.text))

    emitRunEvent(runId, 'Twitter/X', `${rows.length} posts propres retenus apres nettoyage (${provider})`, { level: 'success' })

    const { error } = await supabase
      .from(table)
      .upsert(rows, { onConflict: 'review_id', ignoreDuplicates: true })
    if (error) throw error

    await logScraping('Twitter/X', 'completed', rows.length)
    completeScrapeRun({ runId, source: 'Twitter/X', inserted: rows.length, table })
    res.json({ success: true, inserted: rows.length, table, message: `${rows.length} mentions importees -> ${table}` })
  } catch (err) {
    await logScraping('Twitter/X', 'error', 0, err.message)
    completeScrapeRun({ runId, source: 'Twitter/X', error: err.message })
    res.status(500).json({ success: false, error: err.message })
  }
}
