import axios from 'axios'
import { createClient } from '@supabase/supabase-js'
import { cleanScrapedText, decodeHtml, isUsefulScrapedText } from '../utils/scraper-cleaner.js'
import { scrapeGoogleReviewsDirect, scrapeTrustpilotDirect } from '../services/browser-review-scraper.service.js'
import {
  completeScrapeRun,
  createScrapeRun,
  emitScrapeEvent,
  registerScrapeStream,
  sendScrapeHistory
} from '../services/scrape-events.service.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
)

const LINKUP_KEY = process.env.LINKUP_API_KEY
const LINKUP_URL = 'https://api.linkup.so/v1/search'

async function linkupSearch(query, depth = 'deep') {
  if (!LINKUP_KEY) throw new Error('LINKUP_API_KEY manquant dans .env')
  const res = await axios.post(LINKUP_URL, {
    q: query,
    depth,
    outputType: 'searchResults',
    includeImages: false,
    includeInlineCitations: false
  }, {
    headers: { Authorization: `Bearer ${LINKUP_KEY}`, 'Content-Type': 'application/json' }
  })
  return res.data.results || []
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

// Normalize text for dedup: lowercase, collapse whitespace, trim
function normalizeText(str) {
  return (str || '').toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\sàâäéèêëïîôùûüÿçœæ]/g, '').trim()
}

function hashId(prefix, str) {
  // Hash on normalized text for better dedup
  const norm = normalizeText(str)
  let h = 0
  for (let i = 0; i < norm.length; i++) { h = ((h << 5) - h) + norm.charCodeAt(i); h |= 0 }
  return `${prefix}-${Math.abs(h)}`
}

function compactDateToken(value) {
  return `${value || ''}`.toLowerCase().replace(/[^0-9a-z]/g, '').slice(0, 24)
}

function buildStoredReviewKey(row = {}) {
  const textKey = normalizeText(row.text || '')
  const dateKey = compactDateToken(row.review_date_original || row.date || '')
  const storeKey = normalizeText(row.store_name || row.location || '')
  return [textKey, dateKey, storeKey].filter(Boolean).join('|')
}

const boilerplatePatterns = [
  /vous pouvez aussi nous adresser votre r[ée]clamation compl[èe]te[^|.\n]*/gi,
  /toujours soucieux de la qualit[ée] de service[^|.\n]*/gi,
  /\b\d[\d\s]*personnes ont d[ée]j[àa] [ée]valu[ée] [^.|\n]*/gi,
  /apprenez-en plus sur leurs exp[ée]riences et partagez la v[ôo]tre[^|.\n]*/gi,
  /lire\s+\d[\d\s-]*avis sur\s+\d[\d\s]*/gi,
  /bonjour,\s*votre avis a retenu toute notre attention[^|]*?l['’]?[ée]quipe service client\.?/gi,
  /a tr[èe]s bient[ôo]t sur fnac\.com,\s*l['’]?[ée]quipe service client\.?/gi,
  /nous vous remercions de la fid[ée]lit[ée] et de la confiance que vous portez [^.|\n]*/gi,
  /avis-clients@fnacdarty\.com/gi
]

function reviewSignalScore(text) {
  const t = decodeHtml(text || '').toLowerCase()
  let score = Math.min(40, t.length / 12)

  const positives = ['je ', "j'", 'mon ', 'ma ', 'mes ', 'moi', 'satisfait', 'decu', 'déçu', 'recommande', 'livraison', 'commande', 'retour', 'sav', 'service client', 'produit']
  const negatives = ['avis a retenu toute notre attention', "l'équipe service client", 'réclamation complète', 'soucieux de la qualité de service', 'personnes ont déjà évalué', 'apprenez-en plus']

  score += positives.filter(token => t.includes(token)).length * 8
  score -= negatives.filter(token => t.includes(token)).length * 25

  if (/^bonjour[,!]/i.test(text || '')) score -= 20
  if (/@/.test(text || '')) score -= 15
  if (/\b(?:fnac\.com|trustpilot|lire\s+\d)/i.test(text || '')) score -= 20

  return score
}

function stripBoilerplate(text) {
  let cleaned = decodeHtml(text || '')

  for (const pattern of boilerplatePatterns) {
    cleaned = cleaned.replace(pattern, ' ')
  }

  cleaned = cleaned
    .replace(/\|/g, ' ')
    .replace(/\.{3,}/g, ' | ')
    .replace(/\b(?:Lire|Read)\s+\d[\d\s-]*avis?\s+sur\s+\d[\d\s]*/gi, ' ')
    .replace(/\b(?:Trustpilot|Fnac)\b[^.]{0,80}évalué[^.]*/gi, ' ')
    .replace(/\b(?:fnac|darty|trustpilot)\.com\b/gi, ' ')
    .replace(/\bcom\b/gi, ' ')
    .replace(/\s+[.,;:!?](?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const segments = cleaned
    .split(/\s+\|\s+|(?<=[!?])\s+(?=Bonjour[,!])|(?<=\.)\s+(?=Bonjour[,!])/i)
    .map(part => part.trim())
    .filter(Boolean)

  if (!segments.length) return cleaned

  const viable = segments
    .map(segment => ({ segment, score: reviewSignalScore(segment) }))
    .filter(item => item.segment.length >= 25)
    .sort((a, b) => b.score - a.score)

  return viable[0]?.segment || cleaned
}

function cleanText(str) {
  return cleanScrapedText(stripBoilerplate(str || ''))
}

function inferSentiment(raw) {
  const t = decodeHtml(raw || '').toLowerCase()
  // Strong negative signals (weighted x3)
  const strongNeg = ['never', 'horrible', 'arnaque', 'scandale', 'honte', 'nul', 'catastrophe', 'inacceptable', 'inadmissible', 'voleur', 'escroc', 'avoid', 'scam', 'fraud', 'awful', 'disgusting', 'furieux', 'furieuse', 'dégoûtant', 'lamentable']
  // Regular negative (weighted x1)
  const neg = ['déçu', 'problème', 'mauvais', 'bug', 'refus', 'attente', 'remboursement', 'impossible', 'panne', 'cassé', 'erreur', 'retard', 'annulé', 'perdu', 'bad', 'worst', 'poor', 'terrible', 'disappoint', 'broken', 'lost', 'cancel', 'fail', 'useless', 'regret', 'jamais', 'aucun retour', 'pas de réponse']
  // Positive signals
  const pos = ['excellent', 'parfait', 'super', 'bravo', 'satisfait', 'content', 'recommande', 'rapide', 'top', 'great', 'love', 'amazing', 'wonderful', 'fantastique', 'impeccable', 'très bien', 'efficace', 'professionnel', 'merci', 'good', 'best', 'happy', 'pleased', 'smooth']

  const negScore = strongNeg.filter(w => t.includes(w)).length * 3 + neg.filter(w => t.includes(w)).length
  const posScore = pos.filter(w => t.includes(w)).length

  if (negScore > posScore) return 'Negative'
  if (posScore > negScore) return 'Positive'
  return 'Neutral'
}

// Filter out meta/noise content — aggressive filtering
function isReviewContent(text) {
  if (!text || text.length < 60) return false
  const t = text.toLowerCase()

  // Website UI / navigation noise
  const noise = [
    'comment laisser un avis', 'how to leave a review', 'sign in to leave',
    'connectez-vous pour', 'terms of service', 'privacy policy', 'cookie',
    'javascript', 'accessibility permissions', 'parental control',
    'we designed this app', 'data protection', 'do you agree with',
    'voice your opinion today', 'trustscore', 'search tables', 'hear what',
    'conditions générales', 'mentions légales', 'politique de confidentialité',
    'créer un compte', 'mot de passe', 'panier', 'ajouter au panier',
    'en stock', 'rupture de stock', 'livraison gratuite', 'voir plus',
    'afficher plus', 'trier par', 'filtrer', 'résultats pour', 'page suivante',
    'copyright', 'tous droits réservés', 'nous contacter', 'à propos',
    'télécharger', 'installer', 'mettre à jour', 'navigateur',
    'accepter les cookies', 'paramètres des cookies', 'en savoir plus',
    'inscrivez-vous', 'newsletter', 'suivez-nous', 'réseaux sociaux',
    'trustpilot.com', 'google.com/maps', 'evaluate', 'write a review',
    'laisser un avis', 'noter ce produit', 'votre avis compte',
    'cliquez ici', 'click here', 'read more', 'lire la suite',
  ]
  if (noise.some(n => t.includes(n))) return false

  // Too many URLs = not a review
  const urlCount = (text.match(/https?:\/\//g) || []).length
  if (urlCount > 1) return false

  // Mostly numbers/special chars = not a review
  const letterRatio = (text.match(/[a-zA-ZàâäéèêëïîôùûüÿçœæÀ-Ü]/g) || []).length / text.length
  if (letterRatio < 0.5) return false

  return true
}

// Deduplicate rows by checking text similarity
function deduplicateRows(rows) {
  const seen = new Set()
  return rows.filter(row => {
    // Normalize: first 80 chars, lowercase, no spaces
    const key = normalizeText(row.text).slice(0, 80)
    if (seen.has(key)) return false
    // Also check if one text is contained in another (substring dedup)
    for (const existing of seen) {
      if (key.includes(existing) || existing.includes(key)) return false
    }
    seen.add(key)
    return true
  })
}

async function fetchExistingTextKeys(table, { platform, brand }) {
  const keys = new Set()
  const pageSize = 1000

  for (let from = 0; from < 5000; from += pageSize) {
    let query = supabase
      .from(table)
      .select('text, date, review_date_original, store_name, location')
      .eq('platform', platform)
      .range(from, from + pageSize - 1)

    if (brand) query = query.eq('brand', brand)

    const { data, error } = await query
    if (error) throw error
    if (!data?.length) break

    for (const row of data) {
      const key = buildStoredReviewKey(row)
      if (key) keys.add(key)
    }

    if (data.length < pageSize) break
  }

  return keys
}

async function fetchExistingReviewIds(table, reviewIds) {
  const existing = new Set()
  if (!reviewIds?.length) return existing

  const chunkSize = 200
  for (let index = 0; index < reviewIds.length; index += chunkSize) {
    const chunk = reviewIds.slice(index, index + chunkSize)
    const { data, error } = await supabase
      .from(table)
      .select('review_id')
      .in('review_id', chunk)

    if (error) throw error

    for (const row of data || []) {
      if (row?.review_id) existing.add(row.review_id)
    }
  }

  return existing
}

async function upsertRowsAndCount(table, rows) {
  if (!rows?.length) {
    return { insertedCount: 0, skippedExistingIds: 0 }
  }

  const existingReviewIds = await fetchExistingReviewIds(table, rows.map((row) => row.review_id))
  const rowsToInsert = rows.filter((row) => !existingReviewIds.has(row.review_id))

  if (!rowsToInsert.length) {
    return { insertedCount: 0, skippedExistingIds: existingReviewIds.size }
  }

  const { error } = await supabase
    .from(table)
    .upsert(rowsToInsert, { onConflict: 'review_id', ignoreDuplicates: true })

  if (error) throw error
  return { insertedCount: rowsToInsert.length, skippedExistingIds: existingReviewIds.size }
}

function extractRating(text) {
  const t = decodeHtml(text || '')
  // "X étoile(s)" or "X star(s)"
  let m = t.match(/(\d)[,.]?\d?\s*[éeÉE]toile/i) || t.match(/(\d)[,.]?\d?\s*star/i)
  if (m) return Math.min(5, Math.max(1, parseInt(m[1])))
  // "X/5" or "note X/5" or "X out of 5"
  m = t.match(/(\d)[,.]?\d?\s*\/\s*5/) || t.match(/(\d)\s*out\s*of\s*5/i)
  if (m) return Math.min(5, Math.max(1, parseInt(m[1])))
  // Unicode stars ★/☆ — count filled stars
  const filled = (t.match(/★/g) || []).length
  if (filled > 0) return Math.min(5, filled)
  // "TrustScore X.X" or "note : X"
  m = t.match(/TrustScore\s+(\d)[.,]\d/i) || t.match(/note\s*:?\s*(\d)/i)
  if (m) return Math.min(5, Math.max(1, parseInt(m[1])))
  return null
}

// Split a Linkup page blob into individual review snippets
function splitIntoReviews(raw) {
  const text = decodeHtml(raw || '')

  // Try to split on clear review boundaries (date patterns, author patterns)
  const byDate = text.split(/(?:\.{3}\s*)?(?:Avis du \d{2}\/\d{2}\/\d{4}|Review of \d{2}\/\d{2}\/\d{4}|Date de l'expérience|par [A-Z][a-zé]+ [A-Z]\.\s)/)
  if (byDate.length > 2) {
    return byDate.map(s => s.trim()).filter(s => isReviewContent(s))
  }

  // If content is long, try splitting on "Rated X" or star patterns (review separators)
  const byRating = text.split(/(?:Noté \d sur 5|Rated \d out of 5|(?:^|\n)\d étoiles?\s*\n)/i)
  if (byRating.length > 2) {
    return byRating.map(s => s.trim()).filter(s => isReviewContent(s))
  }

  // DON'T split on sentence boundaries — this creates fragments
  // Instead, keep the whole block if it's a valid review
  if (isReviewContent(text)) {
    // If very long (>600 chars), likely multiple reviews glued together — take as-is
    // GPT will handle the analysis
    return [text]
  }

  return []
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
    .from('scraping_logs')
    .select('id')
    .eq('source', source).eq('status', 'running')
    .order('started_at', { ascending: false }).limit(1).single()
  if (existing) {
    await supabase.from('scraping_logs')
      .update({ status, records_added: records, error_message: errorMessage, completed_at: new Date().toISOString() })
      .eq('id', existing.id)
  }
}

// Resolve which table to write to based on targetDb param
function resolveTable(targetDb, defaultTable) {
  if (targetDb === 'scraping') return 'scraping_brand'
  if (targetDb === 'competitor') return 'scraping_competitor'
  return defaultTable // 'csv' or default → original table
}

export async function scrapeTrustpilot(req, res) {
  const { brand = 'fnac.com', maxReviews = 30, targetDb = 'scraping', massive = false } = req.body
  const table = resolveTable(targetDb, 'voix_client_cx')
  const brandLabel = targetDb === 'competitor' ? brand : 'Fnac Darty'
  const runId = createScrapeRun({ source: 'Trustpilot', mode: massive ? 'massive' : 'standard', targetDb, query: brand })
  await logScraping('Trustpilot', 'running')
  try {
    const requestedMax = parseInt(maxReviews, 10) || 30
    const max = massive ? Math.max(requestedMax, 180) : requestedMax
    const existingTextKeys = await fetchExistingTextKeys(table, { platform: 'Trustpilot', brand: brandLabel })
    emitRunEvent(runId, 'Trustpilot', `${existingTextKeys.size} avis deja connus en base seront ignores`, { level: 'info' })
    emitRunEvent(runId, 'Trustpilot', `Ouverture du domaine ${brand} (${max} avis cibles)`)
    const { reviews, stats: scrapeStats } = await scrapeTrustpilotDirect({
      brand,
      maxReviews: max,
      massive,
      excludeTextKeys: existingTextKeys,
      onProgress: ({ message, ...extra }) => emitRunEvent(runId, 'Trustpilot', message, extra)
    })
    emitRunEvent(runId, 'Trustpilot', `${reviews.length} avis utiles extraits avant insertion`, { level: 'success' })

    const rawRows = reviews.map(review => ({
      review_id: hashId('tp', `${brand}-${buildStoredReviewKey({
        text: review.text,
        date: review.date,
        review_date_original: review.reviewDateOriginal,
        store_name: review.storeName,
        location: review.location
      })}`),
      platform: 'Trustpilot',
      brand: brandLabel,
      category: null,
      text: review.text,
      date: review.date || new Date().toISOString(),
      review_date_original: review.reviewDateOriginal || review.date || null,
      rating: review.rating,
      sentiment: null,
      source_url: review.sourceUrl || `https://fr.trustpilot.com/review/${brand}`,
      store_name: review.storeName || null,
      store_address: review.storeAddress || null,
      store_city: review.storeCity || null,
      user_followers: 0,
      is_verified: false,
      language: 'fr',
      location: brand.toLowerCase() === 'fnac.com' ? 'Fnac.com' : brand,
      share_count: 0,
      reply_count: 0
    }))
    const dedupedRows = deduplicateRows(rawRows)
    const rows = dedupedRows.slice(0, max)
    const skippedInController = Math.max(0, rawRows.length - dedupedRows.length)

    const { insertedCount, skippedExistingIds } = await upsertRowsAndCount(table, rows)
    const duplicatesInDatabase = Math.max(scrapeStats?.skippedExisting || 0, skippedExistingIds || 0)
    const summaryMessage = `Trustpilot termine: ${insertedCount} nouveaux avis, ${duplicatesInDatabase} ignores car deja en base, ${((scrapeStats?.skippedInRun || 0) + skippedInController)} ignores comme doublons du run${table ? ` -> ${table}` : ''}`

    await logScraping('Trustpilot', 'completed', insertedCount)
    completeScrapeRun({
      runId,
      source: 'Trustpilot',
      inserted: insertedCount,
      table,
      message: summaryMessage,
      stats: {
        scanned: rawRows.length,
        skippedExisting: duplicatesInDatabase,
        skippedRunDuplicates: (scrapeStats?.skippedInRun || 0) + skippedInController
      }
    })
    res.json({
      success: true,
      inserted: insertedCount,
      scanned: rows.length,
      duplicatesRemoved: (scrapeStats?.skippedInRun || 0) + skippedInController,
      duplicatesInDatabase,
      table,
      message: `${insertedCount} nouveaux avis Trustpilot, ${duplicatesInDatabase} deja en base, ${((scrapeStats?.skippedInRun || 0) + skippedInController)} doublons retires -> ${table}`
    })
  } catch (err) {
    await logScraping('Trustpilot', 'error', 0, err.message)
    completeScrapeRun({ runId, source: 'Trustpilot', error: err.message })
    res.status(500).json({ success: false, error: err.message })
  }
}

export async function scrapeGoogleReviews(req, res) {
  const { query = 'Fnac Darty', maxReviews = 30, targetDb = 'scraping', massive = false } = req.body
  const table = resolveTable(targetDb, 'voix_client_cx')
  const brandLabel = targetDb === 'competitor' ? query : 'Fnac Darty'
  const runId = createScrapeRun({ source: 'Google Reviews', mode: massive ? 'massive' : 'standard', targetDb, query })
  await logScraping('Google Reviews', 'running')
  try {
    const requestedMax = parseInt(maxReviews, 10) || 30
    const max = massive ? Math.max(requestedMax, 240) : requestedMax
    const existingTextKeys = await fetchExistingTextKeys(table, { platform: 'Google Reviews', brand: brandLabel })
    emitRunEvent(runId, 'Google Reviews', `${existingTextKeys.size} avis deja connus en base seront ignores`, { level: 'info' })
    emitRunEvent(runId, 'Google Reviews', `Recherche Google Maps nationale sur "${query}" (${max} avis cibles)`)
    const { reviews, stats: scrapeStats } = await scrapeGoogleReviewsDirect({
      query,
      maxReviews: max,
      massive,
      excludeTextKeys: existingTextKeys,
      onProgress: ({ message, ...extra }) => emitRunEvent(runId, 'Google Reviews', message, extra)
    })
    emitRunEvent(runId, 'Google Reviews', `${reviews.length} avis utiles extraits avant insertion`, { level: 'success' })

    const rawRows = reviews.map(review => ({
      review_id: hashId('gr', `${query}-${buildStoredReviewKey({
        text: review.text,
        date: review.date,
        review_date_original: review.reviewDateOriginal,
        store_name: review.storeName,
        location: review.location
      })}`),
      platform: 'Google Reviews',
      brand: brandLabel,
      category: null,
      text: review.text,
      date: review.date || new Date().toISOString(),
      review_date_original: review.reviewDateOriginal || review.date || null,
      rating: review.rating,
      sentiment: null,
      source_url: review.sourceUrl || null,
      store_name: review.storeName || review.location || null,
      store_address: review.storeAddress || null,
      store_city: review.storeCity || null,
      user_followers: 0,
      is_verified: false,
      language: 'fr',
      location: review.location || 'France',
      share_count: 0,
      reply_count: 0
    }))
    const dedupedRows = deduplicateRows(rawRows)
    const rows = dedupedRows.slice(0, max)
    const skippedInController = Math.max(0, rawRows.length - dedupedRows.length)

    const { insertedCount, skippedExistingIds } = await upsertRowsAndCount(table, rows)
    const duplicatesInDatabase = Math.max(scrapeStats?.skippedExisting || 0, skippedExistingIds || 0)
    const summaryMessage = `Google Reviews termine: ${insertedCount} nouveaux avis, ${duplicatesInDatabase} ignores car deja en base, ${((scrapeStats?.skippedInRun || 0) + skippedInController)} ignores comme doublons du run${table ? ` -> ${table}` : ''}`

    await logScraping('Google Reviews', 'completed', insertedCount)
    completeScrapeRun({
      runId,
      source: 'Google Reviews',
      inserted: insertedCount,
      table,
      message: summaryMessage,
      stats: {
        scanned: rawRows.length,
        storesVisited: scrapeStats?.storesVisited || 0,
        skippedExisting: duplicatesInDatabase,
        skippedRunDuplicates: (scrapeStats?.skippedInRun || 0) + skippedInController
      }
    })
    res.json({
      success: true,
      inserted: insertedCount,
      scanned: rows.length,
      duplicatesRemoved: (scrapeStats?.skippedInRun || 0) + skippedInController,
      duplicatesInDatabase,
      table,
      message: `${insertedCount} nouveaux avis Google, ${duplicatesInDatabase} deja en base, ${((scrapeStats?.skippedInRun || 0) + skippedInController)} doublons retires -> ${table}`
    })
  } catch (err) {
    await logScraping('Google Reviews', 'error', 0, err.message)
    completeScrapeRun({ runId, source: 'Google Reviews', error: err.message })
    res.status(500).json({ success: false, error: err.message })
  }
}

export async function scrapeReddit(req, res) {
  const { query = 'Fnac Darty', maxItems = 30, targetDb = 'scraping', massive = false } = req.body
  const table = resolveTable(targetDb, 'voix_client_cx')
  const runId = createScrapeRun({ source: 'Reddit', mode: massive ? 'massive' : 'standard', targetDb, query })
  await logScraping('Reddit', 'running')
  try {
    const results = await linkupSearch(`"${query}" site:reddit.com (avis OR experience OR probleme OR déçu OR satisfait OR commande OR livraison OR SAV)`, 'deep')
    const requestedMax = parseInt(maxItems, 10) || 30
    const max = massive ? Math.max(requestedMax, 180) : requestedMax

    const rawRows = results.slice(0, max).map(result => {
      const cleanedText = cleanText(result.content || result.name || '')
      return {
        review_id: hashId('rd', `${result.url || query}-${cleanedText.slice(0, 100)}`),
        platform: 'Reddit',
        brand: targetDb === 'competitor' ? query : 'Fnac Darty',
        category: null,
        text: cleanedText,
        date: new Date().toISOString(),
        rating: null,
        sentiment: null,
        user_followers: 0,
        is_verified: false,
        language: 'fr',
        location: null,
        share_count: 0,
        reply_count: 0
      }
    })

    const rows = deduplicateRows(rawRows).filter(row => row.text?.length > 20).filter(row => isUsefulScrapedText(row.text))
    emitRunEvent(runId, 'Reddit', `${rows.length} posts propres retenus apres nettoyage`, { level: 'success' })

    const { insertedCount } = await upsertRowsAndCount(table, rows)

    await logScraping('Reddit', 'completed', insertedCount)
    completeScrapeRun({ runId, source: 'Reddit', inserted: insertedCount, table })
    res.json({
      success: true,
      inserted: insertedCount,
      scanned: rows.length,
      table,
      message: `${insertedCount} nouveaux posts Reddit importes sur ${rows.length} trouves -> ${table}`
    })
  } catch (err) {
    await logScraping('Reddit', 'error', 0, err.message)
    completeScrapeRun({ runId, source: 'Reddit', error: err.message })
    res.status(500).json({ success: false, error: err.message })
  }
}

export async function scrapeTwitter(req, res) {
  const { searchTerm = 'Fnac Darty', maxItems = 50, target = 'reputation', targetDb = 'scraping' } = req.body
  await logScraping('Twitter/X', 'running')
  try {
    const results = await linkupSearch(`"${searchTerm}" (avis OR problème OR déçu OR satisfait OR commande OR livraison OR SAV) site:twitter.com OR site:x.com OR site:reddit.com`, 'deep')
    const max = parseInt(maxItems)

    // If targeting scraping/competitor DB, use the unified scraping tables
    const useScrapeDb = targetDb === 'scraping' || targetDb === 'competitor'
    const table = useScrapeDb
      ? resolveTable(targetDb, 'reputation_crise')
      : (target === 'benchmark' ? 'benchmark_marche' : 'reputation_crise')

    let rows
    if (useScrapeDb) {
      // Unified schema for scraping_brand / scraping_competitor
      // sentiment + category seront enrichis par Make.com / OpenAI
      rows = results.slice(0, max).filter(r => isReviewContent(r.content)).map(r => ({
        review_id: hashId('tw', r.url + r.content?.slice(0, 80)),
        platform: 'Twitter/X',
        brand: targetDb === 'competitor' ? searchTerm : 'Fnac Darty',
        category: null,
        text: decodeHtml(r.content || r.name || ''),
        date: new Date().toISOString(),
        rating: null,
        sentiment: null,
        user_followers: 0,
        is_verified: false,
        language: 'fr',
        location: null,
        share_count: 0,
        reply_count: 0
      }))
    } else if (table === 'reputation_crise') {
      rows = results.slice(0, max).filter(r => isReviewContent(r.content)).map(r => ({
        review_id: hashId('tw', r.url + r.content?.slice(0, 80)),
        platform: 'Twitter/X',
        brand: 'Fnac Darty',
        post_type: 'Social Mention',
        text: decodeHtml(r.content || r.name || ''),
        date: new Date().toISOString(),
        rating: null,
        likes: 0,
        sentiment: null,
        user_followers: 0,
        is_verified: false,
        language: 'fr',
        location: null,
        share_count: 0,
        reply_count: 0
      }))
    } else {
      rows = results.slice(0, max).filter(r => isReviewContent(r.content)).map(r => ({
        review_id: hashId('tw', r.url + r.content?.slice(0, 80)),
        platform: 'Twitter/X',
        entity_analyzed: searchTerm.toLowerCase().includes('boulanger') ? 'Boulanger' : 'Fnac Darty',
        topic: 'Mention',
        text: decodeHtml(r.content || r.name || ''),
        date: new Date().toISOString(),
        target_brand_vs_competitor: searchTerm.toLowerCase().includes('boulanger') ? 'Competitor' : 'Brand',
        sentiment_detected: null,
        user_followers: 0,
        is_verified: false,
        language: 'fr',
        location: null,
        share_count: 0,
        reply_count: 0
      }))
    }

    rows = rows.filter(r => r.text?.length > 20)

    const { error } = await supabase
      .from(table)
      .upsert(rows, { onConflict: 'review_id', ignoreDuplicates: true })
    if (error) throw error

    await logScraping('Twitter/X', 'completed', rows.length)
    res.json({ success: true, inserted: rows.length, table, message: `${rows.length} mentions importées → ${table}` })
  } catch (err) {
    await logScraping('Twitter/X', 'error', 0, err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}

export async function getScrapingLogs(req, res) {
  const { data, error } = await supabase
    .from('scraping_logs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(20)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
}

export function streamScrapeEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  })
  res.flushHeaders?.()
  sendScrapeHistory(res)
  registerScrapeStream(res)
}
