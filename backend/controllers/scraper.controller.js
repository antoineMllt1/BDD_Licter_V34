import axios from 'axios'
import { createClient } from '@supabase/supabase-js'

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

function decodeHtml(str) {
  return (str || '').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
}

function cleanText(str) {
  return decodeHtml(str || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
  const { brand = 'fnacdarty.com', maxReviews = 30, targetDb = 'scraping' } = req.body
  const table = resolveTable(targetDb, 'voix_client_cx')
  await logScraping('Trustpilot', 'running')
  try {
    const results = await linkupSearch(`site:fr.trustpilot.com/review "${brand}" avis client déçu satisfait`, 'deep')
    const max = parseInt(maxReviews)

    const reviews = results.flatMap(r => splitIntoReviews(r.content))
    const rawRows = reviews.map((text, i) => ({
      review_id: hashId('tp', text.slice(0, 100)),
      platform: 'Trustpilot',
      brand: targetDb === 'competitor' ? brand : 'Fnac Darty',
      category: null,
      text: cleanText(text),
      date: new Date().toISOString(),
      rating: extractRating(text),
      sentiment: null,
      user_followers: 0,
      is_verified: false,
      language: 'fr',
      location: 'FR',
      share_count: 0,
      reply_count: 0
    }))
    const rows = deduplicateRows(rawRows).slice(0, max)

    const { error } = await supabase
      .from(table)
      .upsert(rows, { onConflict: 'review_id', ignoreDuplicates: true })
    if (error) throw error

    await logScraping('Trustpilot', 'completed', rows.length)
    res.json({ success: true, inserted: rows.length, table, message: `${rows.length} avis Trustpilot importés → ${table}` })
  } catch (err) {
    await logScraping('Trustpilot', 'error', 0, err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}

export async function scrapeGoogleReviews(req, res) {
  const { query = 'Fnac Darty', maxReviews = 30, targetDb = 'scraping' } = req.body
  const table = resolveTable(targetDb, 'voix_client_cx')
  await logScraping('Google Reviews', 'running')
  try {
    const results = await linkupSearch(`"${query}" avis clients site:trustpilot.com OR site:google.com/maps OR site:avis-verifies.com OR "étoiles" OR "stars" déçu OR satisfait OR recommande`, 'deep')
    const max = parseInt(maxReviews)

    const reviews = results.flatMap(r => splitIntoReviews(r.content))
    const rawRows = reviews.map(text => ({
      review_id: hashId('gr', text.slice(0, 100)),
      platform: 'Google Reviews',
      brand: targetDb === 'competitor' ? query : 'Fnac Darty',
      category: null,
      text: cleanText(text),
      date: new Date().toISOString(),
      rating: extractRating(text),
      sentiment: null,
      user_followers: 0,
      is_verified: false,
      language: 'fr',
      location: 'FR',
      share_count: 0,
      reply_count: 0
    }))
    const rows = deduplicateRows(rawRows).slice(0, max)

    const { error } = await supabase
      .from(table)
      .upsert(rows, { onConflict: 'review_id', ignoreDuplicates: true })
    if (error) throw error

    await logScraping('Google Reviews', 'completed', rows.length)
    res.json({ success: true, inserted: rows.length, table, message: `${rows.length} avis Google importés → ${table}` })
  } catch (err) {
    await logScraping('Google Reviews', 'error', 0, err.message)
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
