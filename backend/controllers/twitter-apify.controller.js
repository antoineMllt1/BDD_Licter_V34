import { createClient } from '@supabase/supabase-js'
import { completeScrapeRun, createScrapeRun, emitScrapeEvent } from '../services/scrape-events.service.js'
import { runTwikitSearch } from '../services/python-social-scrapers.service.js'
import { cleanTweetText, isBoulangerBrand } from '../utils/scraper-cleaner.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
)

function resolveTable(targetDb, defaultTable) {
  if (targetDb === 'social') return 'social_mentions'
  if (targetDb === 'social_competitor') return 'social_mentions_competitor'
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
  return cleanTweetText(str)
}

function isUsefulTweet(text) {
  if (!text || text.length < 15) return false
  const t = text.toLowerCase()

  // Filter web noise
  const webNoise = ['sign in', 'log in', 'cookie', 'privacy policy', 'terms of service']
  if (webNoise.some(token => t.includes(token))) return false

  // Filter spam patterns
  if ((t.match(/#/g) || []).length > 5) return false
  if (t.startsWith('follow') && t.includes('giveaway')) return false
  if ((t.match(/🔥|💰|🚀|💎/g) || []).length > 3) return false

  // Must have some actual meaningful content (3+ real words)
  const words = t.split(/\s+/).filter(w => w.length > 2 && !w.startsWith('#') && !w.startsWith('@'))
  if (words.length < 3) return false

  return true
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
  const actorIdRaw = (process.env.APIFY_TWITTER_ACTOR_ID || 'kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest').trim()
  const actorId = actorIdRaw.replace('/', '~')

  if (!token) {
    throw new Error('APIFY_API_TOKEN manquant dans .env')
  }

  const input = {
    searchTerms: [`${searchTerm} lang:fr`],
    maxItems: Math.max(1, Math.min(Number(maxItems) || 50, 200)),
    queryType: 'Latest',
    lang: 'fr'
  }

  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(180_000)
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Apify a repondu ${response.status}: ${message.slice(0, 200)}`)
  }

  const data = await response.json()
  return data.filter(item => item.type === 'tweet' && item.text)
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
  const { searchTerm = 'Fnac Darty', maxItems = 50, target = 'reputation', targetDb = 'social', massive = false } = req.body
  const requestedMax = parseInt(maxItems, 10) || 50
  const max = massive ? Math.max(requestedMax, 250) : requestedMax
  const runId = createScrapeRun({ source: 'Twitter/X', mode: massive ? 'massive' : 'standard', targetDb, query: searchTerm })
  await logScraping('Twitter/X', 'running')

  try {
    const { results, provider } = await fetchTwitterResults({ runId, searchTerm, max })

    const table = resolveTable(targetDb, 'social_mentions')

    let rows = results
      .slice(0, max)
      .map(item => {
        let text, date, sourceUrl, author, followers, verified, location, likesVal, shares, repliesVal, viewsVal, isReply, conversationIdVal

        if (provider === 'twikit') {
          text = cleanText(item?.text)
          date = item?.created_at || new Date().toISOString()
          sourceUrl = item?.url || null
          author = item?.author_screen_name || item?.author_name || null
          followers = extractMetric(item, 'author_followers')
          verified = Boolean(item?.author_verified)
          location = item?.author_name ? `@${item.author_screen_name || item.author_name}` : null
          likesVal = extractMetric(item, 'favorite_count')
          shares = extractMetric(item, 'retweet_count')
          repliesVal = extractMetric(item, 'reply_count')
          viewsVal = 0
          isReply = Boolean(item?.in_reply_to)
          conversationIdVal = null
        } else {
          // kaitoeasyapi actor format
          text = cleanText(item?.text || '')
          date = item?.createdAt || new Date().toISOString()
          sourceUrl = item?.url || item?.twitterUrl || null
          author = item?.author?.userName || null
          followers = extractMetric(item?.author, 'followers')
          verified = Boolean(item?.author?.isBlueVerified || item?.author?.isVerified)
          location = item?.author?.userName ? `@${item.author.userName}` : null
          likesVal = extractMetric(item, 'likeCount')
          shares = extractMetric(item, 'retweetCount')
          repliesVal = extractMetric(item, 'replyCount')
          viewsVal = extractMetric(item, 'viewCount')
          isReply = Boolean(item?.isReply)
          conversationIdVal = item?.conversationId || null
        }

        // Social mentions table format (brand + competitor)
        if (table === 'social_mentions' || table === 'social_mentions_competitor') {
          return {
            review_id: hashId('tw', `${sourceUrl || searchTerm}-${text.slice(0, 80)}`),
            platform: 'Twitter/X',
            brand: targetDb === 'social_competitor' ? 'Boulanger' : (searchTerm.toLowerCase().includes('boulanger') ? 'Boulanger' : 'Fnac Darty'),
            text,
            date,
            source_url: sourceUrl,
            author,
            author_followers: followers,
            is_verified: verified,
            language: item?.lang || 'fr',
            location,
            likes: likesVal,
            shares,
            replies: repliesVal,
            views: viewsVal,
            is_reply: isReply,
            conversation_id: conversationIdVal,
            sentiment: null,
            insight_ready: false
          }
        }

        // Legacy table formats (scraping_brand / scraping_competitor)
        return {
          review_id: hashId('tw', `${sourceUrl || searchTerm}-${text.slice(0, 80)}`),
          platform: 'Twitter/X',
          brand: targetDb === 'competitor' ? 'Boulanger' : 'Fnac Darty',
          category: null,
          text,
          date,
          rating: null,
          sentiment: null,
          user_followers: followers,
          is_verified: verified,
          language: item?.lang || 'fr',
          location,
          source_url: sourceUrl,
          share_count: shares,
          reply_count: repliesVal
        }
      })
      .filter(row => isUsefulTweet(row.text))
      .filter(row => !searchTerm.toLowerCase().includes('boulanger') || isBoulangerBrand(row.text))

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
