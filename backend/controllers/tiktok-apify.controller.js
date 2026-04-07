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
  if (['follow', 'giveaway', 'cookie', 'privacy'].some(token => t.includes(token))) return false
  const words = t.split(/\s+/).filter(w => w.length > 2 && !w.startsWith('#') && !w.startsWith('@'))
  return words.length >= 2
}

export async function scrapeTikTok(req, res) {
  const {
    searchTerm = 'Fnac Darty',
    maxItems = 50,
    targetDb = 'social',
    massive = false
  } = req.body

  const max = massive ? Math.max(parseInt(maxItems, 10) || 50, 200) : Math.min(parseInt(maxItems, 10) || 50, 200)
  // Acteur payant clockworks/tiktok-scraper — 96.8% success, plus fiable que la version free
  const actorId = process.env.APIFY_TIKTOK_ACTOR_ID || 'clockworks/tiktok-scraper'

  const runId = createScrapeRun({ source: 'TikTok', mode: massive ? 'massive' : 'standard', targetDb, query: searchTerm })
  await logScraping('TikTok', 'running')

  try {
    emitRunEvent(runId, 'TikTok', `Demarrage run Apify TikTok pour "${searchTerm}" (${max} videos cibles)...`)

    const input = {
      searchQueries: [searchTerm],
      resultsPerPage: max,         // champ correct du schema
      searchSection: '/video',     // forcer la recherche de videos uniquement
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSlideshowImages: false,
      downloadSubtitlesOptions: 'NEVER_DOWNLOAD_SUBTITLES'
    }

    emitRunEvent(runId, 'TikTok', `Run lance — attente des resultats (polling en cours)...`)
    const results = await runApifyActor(actorId, input)
    emitRunEvent(runId, 'TikTok', `${results.length} videos brutes recuperees depuis Apify`)

    const table = resolveTable(targetDb)
    const brand = targetDb === 'social_competitor' || searchTerm.toLowerCase().includes('boulanger')
      ? 'Boulanger'
      : 'Fnac Darty'

    const rows = results
      .slice(0, max)
      .map(item => {
        const text = (item.text || item.desc || '').trim()
        const videoUrl = item.webVideoUrl || item.videoUrl || null
        const authorName = item.authorMeta?.name || item.author?.name || item.authorMeta?.id || null
        const authorFans = extractMetric(item.authorMeta, 'fans')

        return {
          review_id: hashId('tt', `${videoUrl || searchTerm}-${text.slice(0, 80)}`),
          platform: 'TikTok',
          brand,
          text,
          date: item.createTimeISO || (item.createTime ? new Date(item.createTime * 1000).toISOString() : new Date().toISOString()),
          source_url: videoUrl,
          author: authorName,
          author_followers: authorFans || null,
          is_verified: Boolean(item.authorMeta?.verified),
          language: item.language || null,
          location: item.locationCreated || null,
          likes: extractMetric(item, 'diggCount'),
          shares: extractMetric(item, 'shareCount'),
          replies: extractMetric(item, 'commentCount'),
          views: extractMetric(item, 'playCount'),
          is_reply: false,
          conversation_id: null,
          sentiment: null,
          insight_ready: false
        }
      })
      .filter(row => isUsefulPost(row.text))

    emitRunEvent(runId, 'TikTok', `${rows.length} videos retenues apres nettoyage`, { level: 'success' })

    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'review_id', ignoreDuplicates: true })
    if (error) throw error

    await logScraping('TikTok', 'completed', rows.length)
    completeScrapeRun({ runId, source: 'TikTok', inserted: rows.length, table })
    res.json({ success: true, inserted: rows.length, table, message: `${rows.length} mentions TikTok importees -> ${table}` })
  } catch (err) {
    await logScraping('TikTok', 'error', 0, err.message)
    completeScrapeRun({ runId, source: 'TikTok', error: err.message })
    res.status(500).json({ success: false, error: err.message })
  }
}
