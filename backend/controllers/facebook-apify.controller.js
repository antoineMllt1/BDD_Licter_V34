import { createClient } from '@supabase/supabase-js'
import { completeScrapeRun, createScrapeRun, emitScrapeEvent } from '../services/scrape-events.service.js'
import { runApifyActor } from '../utils/apify-runner.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
)

function resolveTable(targetDb) {
  if (targetDb === 'social_competitor') return 'social_mentions_competitor'
  return 'social_mentions'
}

function emitRunEvent(runId, source, message, extra = {}) {
  emitScrapeEvent({ type: 'progress', runId, source, level: extra.level || 'info', message, ...extra })
}

async function logScraping(source, status, records = 0, errorMessage = null) {
  if (status === 'running') {
    const { data } = await supabase
      .from('scraping_logs')
      .insert({ source, status: 'running', records_added: 0 })
      .select('id').single()
    return data?.id
  }
  const { data: existing } = await supabase
    .from('scraping_logs').select('id')
    .eq('source', source).eq('status', 'running')
    .order('started_at', { ascending: false }).limit(1).single()
  if (existing) {
    await supabase.from('scraping_logs')
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

function extractMetric(obj, key, fallback = 0) {
  const v = obj?.[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && !Number.isNaN(Number(v))) return Number(v)
  return fallback
}

function isUsefulPost(text) {
  if (!text || text.length < 10) return false
  const t = text.toLowerCase()
  if (['follow', 'giveaway', 'cookie', 'privacy', 'politique de'].some(token => t.includes(token))) return false
  const words = t.split(/\s+/).filter(w => w.length > 2 && !w.startsWith('#') && !w.startsWith('@'))
  return words.length >= 2
}

// Pages Facebook officielles indexées par marque
const FB_BRAND_PAGES = {
  'fnac darty': ['https://www.facebook.com/fnac/', 'https://www.facebook.com/darty/'],
  'fnac': ['https://www.facebook.com/fnac/'],
  'darty': ['https://www.facebook.com/darty/'],
  'boulanger': ['https://www.facebook.com/Boulanger/'],
}

function resolvePageUrls(pageUrls, searchTerm, isCompetitor) {
  // Si l'utilisateur fournit des URLs directement, on les utilise
  if (pageUrls && pageUrls.length > 0) return pageUrls

  // Sinon on cherche dans les pages connues
  const key = (searchTerm || '').toLowerCase()
  for (const [brand, urls] of Object.entries(FB_BRAND_PAGES)) {
    if (key.includes(brand)) return urls
  }

  // Fallback par défaut
  return isCompetitor
    ? ['https://www.facebook.com/Boulanger/']
    : ['https://www.facebook.com/fnac/', 'https://www.facebook.com/darty/']
}

async function runApifyFacebook({ pageUrls, searchTerm, maxItems, isCompetitor }) {
  const actorId = (process.env.APIFY_FACEBOOK_ACTOR_ID || 'apify/facebook-posts-scraper').trim()
  const resolvedUrls = resolvePageUrls(pageUrls, searchTerm, isCompetitor)

  // Input conforme au vrai schema de apify/facebook-posts-scraper
  const input = {
    startUrls: resolvedUrls.map(url => ({ url })),  // format {url: "..."} obligatoire
    resultsLimit: Math.max(1, Math.min(Number(maxItems) || 30, 200)),
    onlyPostsNewerThan: '3 months'
  }

  return runApifyActor(actorId, input)
}

export async function scrapeFacebook(req, res) {
  const {
    pageUrls,                  // URLs directes ex: ["https://www.facebook.com/fnac/"]
    searchTerm = 'Fnac Darty', // utilisé pour résoudre les URLs si pageUrls absent
    maxItems = 30,
    targetDb = 'social',
    massive = false
  } = req.body

  const isCompetitor = targetDb === 'social_competitor'
  const max = massive ? Math.max(parseInt(maxItems, 10) || 30, 150) : parseInt(maxItems, 10) || 30
  const label = pageUrls?.length ? pageUrls.join(', ') : searchTerm
  const runId = createScrapeRun({ source: 'Facebook', mode: massive ? 'massive' : 'standard', targetDb, query: label })
  await logScraping('Facebook', 'running')

  try {
    emitRunEvent(runId, 'Facebook', `Scraping pages Facebook via Apify: "${label}" (${max} posts cibles)`)
    const results = await runApifyFacebook({ pageUrls, searchTerm, maxItems: max, isCompetitor })
    emitRunEvent(runId, 'Facebook', `${results.length} resultats bruts recuperes par Apify`)

    const table = resolveTable(targetDb)
    const brand = targetDb === 'social_competitor'
      ? 'Boulanger'
      : (searchTerm.toLowerCase().includes('boulanger') ? 'Boulanger' : 'Fnac Darty')

    const rows = results
      .slice(0, max)
      .map(item => {
        const text = (item.text || item.message || '').trim()
        const postUrl = item.url || item.postUrl || null
        const author = item.authorName || item.pageName || item.user?.name || null

        // Sum all reaction types
        const totalLikes = (item.likes || 0) +
          (item.reactions?.LIKE || 0) + (item.reactions?.LOVE || 0) +
          (item.reactions?.WOW || 0) + (item.reactions?.HAHA || 0) +
          (item.reactions?.SORRY || 0) + (item.reactions?.ANGER || 0)

        return {
          review_id: hashId('fb', `${postUrl || searchTerm}-${text.slice(0, 80)}`),
          platform: 'Facebook',
          brand,
          text,
          date: item.time || item.date || item.timestamp || new Date().toISOString(),
          source_url: postUrl,
          author,
          author_followers: extractMetric(item, 'pageFollowers') || undefined,
          is_verified: Boolean(item.isVerified || item.pageIsVerified),
          language: null,
          location: item.location?.name || item.locationName || null,
          likes: totalLikes,
          shares: extractMetric(item, 'shares'),
          replies: extractMetric(item, 'comments'),
          views: extractMetric(item, 'videoViewCount'),
          is_reply: false,
          conversation_id: null,
          sentiment: null,
          insight_ready: false
        }
      })
      .filter(row => isUsefulPost(row.text))

    emitRunEvent(runId, 'Facebook', `${rows.length} posts retenus apres nettoyage`, { level: 'success' })

    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'review_id', ignoreDuplicates: true })
    if (error) throw error

    await logScraping('Facebook', 'completed', rows.length)
    completeScrapeRun({ runId, source: 'Facebook', inserted: rows.length, table })
    res.json({ success: true, inserted: rows.length, table, message: `${rows.length} posts Facebook importes -> ${table}` })
  } catch (err) {
    await logScraping('Facebook', 'error', 0, err.message)
    completeScrapeRun({ runId, source: 'Facebook', error: err.message })
    res.status(500).json({ success: false, error: err.message })
  }
}
