import Anthropic from '@anthropic-ai/sdk'
import PDFDocument from 'pdfkit'
import { createClient } from '@supabase/supabase-js'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')
const FNAC_LOGO_PATH = path.join(PROJECT_ROOT, 'frontend', 'public', 'Fnac_logo.png')
const DARTY_LOGO_PATH = path.join(PROJECT_ROOT, 'frontend', 'public', 'darty_logo.png')

const PAGE = {
  width: 595.28,
  height: 841.89,
  marginX: 46,
  marginY: 46,
  contentWidth: 503.28
}

const THEME = {
  page: '#FFFCF7',
  paper: '#FFF9EE',
  ink: '#111111',
  inkSoft: '#2B241C',
  muted: '#6F6558',
  line: '#DDD2C0',
  yellow: '#FFD200',
  yellowSoft: '#FFF1A8',
  red: '#E30613',
  redSoft: '#FFE4E8',
  black: '#17130F',
  blackSoft: '#2A231C'
}

const DEFAULT_SECTIONS = ['executive', 'war_room', 'battle_matrix', 'voice_of_customer', 'action_center']
const DEFAULT_MODEL = process.env.ANTHROPIC_COMEX_MODEL || 'claude-sonnet-4-6'

const DATA_SOURCE_PRESETS = {
  all: ['reputation', 'benchmark', 'cx'],
  brand360: ['reputation', 'cx'],
  market: ['reputation', 'benchmark'],
  customer: ['cx'],
  reputation: ['reputation'],
  benchmark: ['benchmark']
}

const SOURCE_LABELS = {
  reputation: 'Reputation & Crise',
  benchmark: 'Benchmark Marche',
  cx: 'Voix du Client'
}

const REPORT_SECTION_LABELS = {
  executive: 'Synthese executive',
  war_room: 'War Room',
  battle_matrix: 'Battle Matrix',
  voice_of_customer: 'Voix du Client',
  action_center: 'Action Center'
}

const SECTION_ALIASES = {
  reputation: 'war_room',
  benchmark: 'battle_matrix',
  cx: 'voice_of_customer',
  recommendations: 'action_center',
  executive: 'executive',
  war_room: 'war_room',
  battle_matrix: 'battle_matrix',
  voice_of_customer: 'voice_of_customer',
  action_center: 'action_center'
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
)

let anthropicClient = null

function getAnthropicClient() {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropicClient
}

function safeText(value, fallback = '') {
  if (value === undefined || value === null) return fallback
  const text = String(value).replace(/\s+/g, ' ').trim()
  return text || fallback
}

function safeNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeSentiment(value) {
  const normalized = safeText(value).toLowerCase()
  if (!normalized) return null
  if (normalized.includes('neg')) return 'Negative'
  if (normalized.includes('pos')) return 'Positive'
  if (normalized.includes('neu')) return 'Neutral'
  return null
}

function normalizeUrgency(value) {
  const normalized = safeText(value).toLowerCase()
  if (!normalized) return 'standard'
  if (normalized.includes('imm') || normalized.includes('urgent') || normalized.includes('crit')) return 'high'
  if (normalized.includes('high') || normalized.includes('fort')) return 'high'
  if (normalized.includes('med')) return 'medium'
  return 'standard'
}

function urgencyScore(value) {
  const normalized = normalizeUrgency(value)
  if (normalized === 'high') return 3
  if (normalized === 'medium') return 2
  return 1
}

function percentage(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

function clipText(value, maxLength = 160) {
  const text = safeText(value)
  if (!text) return ''
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1).trimEnd()}...`
}

function resolveDataSources(payload) {
  if (Array.isArray(payload.dataSources) && payload.dataSources.length > 0) {
    return payload.dataSources.filter((source) => ['reputation', 'benchmark', 'cx'].includes(source))
  }
  return DATA_SOURCE_PRESETS[payload.dataPreset] || DATA_SOURCE_PRESETS.all
}

function normalizeSections(sections) {
  if (!Array.isArray(sections) || sections.length === 0) return DEFAULT_SECTIONS

  const normalized = sections
    .map((section) => SECTION_ALIASES[section])
    .filter(Boolean)

  if (normalized.length === 0) return DEFAULT_SECTIONS

  return DEFAULT_SECTIONS.filter((sectionId) => normalized.includes(sectionId))
}

function resolveLimit(dataVolume) {
  if (dataVolume === 'light') return 250
  if (dataVolume === 'deep') return 1500
  return 500
}

function toneInstruction(tone) {
  if (tone === 'consulting') return 'Ton conseil, net, structure d arbitrage, sans jargon inutile.'
  if (tone === 'executive') return 'Ton board memo, tres sec, oriente message cle et decision.'
  return 'Ton corporate, sobre, lisible, calibre pour un COMEX retail.'
}

function detailInstruction(level) {
  if (level === 'synthesis') return 'Reste compact. Peu de texte, phrases denses, pas de remplissage.'
  if (level === 'deep') return 'Donne un peu plus de contexte business, tout en restant board-ready.'
  return 'Garde un niveau de detail intermediaire, concret et actionnable.'
}

function focusInstruction(focus) {
  if (focus === 'risk') return 'Priorise le risque reputionnel, les tensions et les signaux faibles.'
  if (focus === 'growth') return 'Priorise la croissance, les territoires a prendre et les angles de conquete.'
  if (focus === 'operations') return 'Priorise execution, parcours client, magasin, SAV, livraison.'
  return 'Equilibre risque, croissance et execution.'
}

function countBy(rows, selector) {
  return rows.reduce((acc, row) => {
    const key = safeText(selector(row))
    if (!key) return acc
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
}

function topEntries(map, limit = 5) {
  return Object.entries(map)
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1]
      return left[0].localeCompare(right[0], 'fr')
    })
    .slice(0, limit)
}

function uniqueBy(items, keyResolver) {
  const seen = new Set()
  return items.filter((item) => {
    const key = keyResolver(item)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function rowText(row) {
  return safeText(row.text || row.review_text || row.content)
}

function rowPlatform(row, fallback = 'Source') {
  return safeText(row.platform, fallback)
}

function rowSource(row, fallback = 'Source') {
  const platform = rowPlatform(row, '')
  const author = safeText(row.author)
  return [platform, author].filter(Boolean).join(' - ') || fallback
}

function benchmarkSide(row, brand, competitor) {
  const target = safeText(row.target_brand_vs_competitor).toLowerCase()
  if (target === 'brand') return 'brand'
  if (target === 'competitor') return 'competitor'

  const entity = safeText(row.entity_analyzed).toLowerCase()
  if (entity && entity.includes(safeText(competitor).toLowerCase())) return 'competitor'
  if (entity && entity.includes(safeText(brand).toLowerCase())) return 'brand'
  return 'brand'
}

function evidenceScore(row) {
  let score = 0
  const sentiment = normalizeSentiment(row.sentiment || row.sentiment_detected)
  if (sentiment === 'Negative') score += 40
  if (sentiment === 'Positive') score += 18
  score += urgencyScore(row.urgency_level) * 8
  score += safeNumber(row.likes) + safeNumber(row.shares) + safeNumber(row.share_count) + safeNumber(row.replies) + safeNumber(row.reply_count)
  if (row.is_verified) score += 15
  if (rowText(row)) score += 12
  return score
}

function buildProofs(rows, options = {}) {
  const {
    limit = 3,
    fallbackSource = 'Source',
    contextResolver = () => '',
    filter = () => true
  } = options

  return uniqueBy(
    [...rows]
      .filter((row) => filter(row) && rowText(row))
      .sort((left, right) => evidenceScore(right) - evidenceScore(left))
      .map((row) => ({
        quote: clipText(rowText(row), 170),
        source: rowSource(row, fallbackSource),
        context: clipText(contextResolver(row), 80)
      })),
    (item) => item.quote.toLowerCase()
  ).slice(0, limit)
}

function ownerFromRow(row, fallback = 'Direction operationnelle') {
  const explicitOwner = safeText(row.team_owner)
  if (explicitOwner) return explicitOwner

  const topic = safeText(
    row.category ||
    row.pain_point ||
    row.delight_point ||
    row.customer_journey_step ||
    row.topic ||
    row.benchmark_dimension
  ).toLowerCase()

  if (topic.includes('livraison') || topic.includes('sav') || topic.includes('garantie')) return 'Operations / Service client'
  if (topic.includes('magasin') || topic.includes('vendeur') || topic.includes('store')) return 'Operations magasin'
  if (topic.includes('prix') || topic.includes('offre') || topic.includes('assortiment')) return 'Offre / Pricing'
  if (topic.includes('site') || topic.includes('commande') || topic.includes('parcours')) return 'Digital / CX'
  return fallback
}

function impactFromRow(row, fallback = 'Satisfaction et conversion') {
  return safeText(row.business_impact, fallback)
}

function buildBenchmarkFrames(rows, brand, competitor) {
  const frames = {}

  rows.forEach((row) => {
    const dimension = safeText(row.benchmark_dimension || row.topic)
    if (!dimension) return

    if (!frames[dimension]) {
      frames[dimension] = {
        dimension,
        volume: 0,
        brandScore: 0,
        competitorScore: 0,
        brandMentions: 0,
        competitorMentions: 0
      }
    }

    const side = benchmarkSide(row, brand, competitor)
    const sentiment = normalizeSentiment(row.sentiment_detected || row.sentiment)
    const score = sentiment === 'Positive' ? 1 : sentiment === 'Negative' ? -1 : 0

    frames[dimension].volume += 1

    if (side === 'brand') {
      frames[dimension].brandMentions += 1
      frames[dimension].brandScore += score
    } else {
      frames[dimension].competitorMentions += 1
      frames[dimension].competitorScore += score
    }
  })

  const ranked = Object.values(frames).map((frame) => ({
    ...frame,
    delta: frame.brandScore - frame.competitorScore
  }))

  return {
    winners: ranked.filter((frame) => frame.delta > 0).sort((left, right) => right.delta - left.delta).slice(0, 4),
    losers: ranked.filter((frame) => frame.delta < 0).sort((left, right) => left.delta - right.delta).slice(0, 4),
    neutral: ranked.filter((frame) => frame.delta === 0).sort((left, right) => right.volume - left.volume).slice(0, 4)
  }
}

function buildStoreHotspots(rows) {
  const grouped = rows.reduce((acc, row) => {
    const key = safeText(row.store_city || row.store_name || row.location)
    if (!key) return acc
    if (!acc[key]) {
      acc[key] = { name: key, count: 0, negatives: 0, ratings: [] }
    }
    acc[key].count += 1
    if (normalizeSentiment(row.sentiment) === 'Negative') acc[key].negatives += 1
    if (safeNumber(row.rating) > 0) acc[key].ratings.push(safeNumber(row.rating))
    return acc
  }, {})

  return Object.values(grouped)
    .map((store) => ({
      name: store.name,
      count: store.count,
      negativeRate: percentage(store.negatives, store.count),
      avgRating: store.ratings.length
        ? (store.ratings.reduce((sum, value) => sum + value, 0) / store.ratings.length).toFixed(1)
        : '0.0'
    }))
    .sort((left, right) => {
      if (right.negativeRate !== left.negativeRate) return right.negativeRate - left.negativeRate
      return right.count - left.count
    })
    .slice(0, 4)
}

function buildActionCandidates({ repData, cxData, benchData, brand, competitor }) {
  const candidates = []

  const pushCandidate = (candidate) => {
    const title = clipText(candidate.title, 86)
    const proof = clipText(candidate.proof, 140)
    if (!title || !proof) return

    candidates.push({
      title,
      owner: clipText(candidate.owner, 42),
      urgency: candidate.urgency,
      impact: clipText(candidate.impact, 48),
      proof,
      source: candidate.source,
      score: candidate.score
    })
  }

  repData
    .filter((row) => normalizeSentiment(row.sentiment) === 'Negative' || safeText(row.recommended_action))
    .sort((left, right) => evidenceScore(right) - evidenceScore(left))
    .slice(0, 10)
    .forEach((row) => {
      pushCandidate({
        title: safeText(row.recommended_action, `Reprendre la main sur ${safeText(row.platform, 'le front reputation').toLowerCase()}`),
        owner: ownerFromRow(row, 'Communication / Service client'),
        urgency: normalizeUrgency(row.urgency_level),
        impact: impactFromRow(row, 'Reputation et conversion'),
        proof: rowText(row),
        source: rowSource(row, 'Reputation'),
        score: evidenceScore(row) + 12
      })
    })

  cxData
    .filter((row) => normalizeSentiment(row.sentiment) === 'Negative' || safeText(row.recommended_action))
    .sort((left, right) => evidenceScore(right) - evidenceScore(left))
    .slice(0, 10)
    .forEach((row) => {
      const topic = safeText(row.category || row.pain_point || row.customer_journey_step, 'le parcours client').toLowerCase()
      pushCandidate({
        title: safeText(row.recommended_action, `Corriger ${topic}`),
        owner: ownerFromRow(row, 'Operations / CX'),
        urgency: normalizeUrgency(row.urgency_level),
        impact: impactFromRow(row, 'Satisfaction, NPS et retour magasin'),
        proof: rowText(row),
        source: rowSource(row, 'Voix du client'),
        score: evidenceScore(row) + 10
      })
    })

  const benchmarkFrames = buildBenchmarkFrames(benchData, brand, competitor)

  benchmarkFrames.losers.slice(0, 4).forEach((frame) => {
    const proofRow = benchData.find((row) => safeText(row.benchmark_dimension || row.topic) === frame.dimension && rowText(row))
    pushCandidate({
      title: `Reprendre la main sur ${frame.dimension.toLowerCase()}`,
      owner: ownerFromRow({ benchmark_dimension: frame.dimension }, 'Marketing / Offre'),
      urgency: frame.delta <= -2 ? 'high' : 'medium',
      impact: 'Preference de marque et conversion',
      proof: rowText(proofRow) || `${competitor} prend l avantage sur ${frame.dimension.toLowerCase()}.`,
      source: rowSource(proofRow || {}, 'Benchmark'),
      score: 55 + Math.abs(frame.delta) * 8
    })
  })

  return uniqueBy(
    candidates.sort((left, right) => right.score - left.score),
    (candidate) => candidate.title.toLowerCase()
  ).slice(0, 6)
}

async function fetchTable(table, enabled, limit) {
  if (!enabled) return []
  const { data, error } = await supabase.from(table).select('*').limit(limit)
  if (error) throw new Error(`${table}: ${error.message}`)
  return Array.isArray(data) ? data : []
}

async function fetchDataSummary({ brand, competitor, dataSources, dataVolume }) {
  const limit = resolveLimit(dataVolume)

  const [repData, benchData, cxData, socialBrandData, socialCompetitorData] = await Promise.all([
    fetchTable('reputation_crise', dataSources.includes('reputation'), limit),
    fetchTable('benchmark_marche', dataSources.includes('benchmark'), limit),
    fetchTable('voix_client_cx', dataSources.includes('cx'), limit),
    fetchTable('social_mentions', dataSources.includes('reputation'), limit),
    fetchTable('social_mentions_competitor', dataSources.includes('reputation'), limit)
  ])

  const repTotal = repData.length
  const repNeg = repData.filter((row) => normalizeSentiment(row.sentiment) === 'Negative').length
  const repPos = repData.filter((row) => normalizeSentiment(row.sentiment) === 'Positive').length
  const repNeu = repData.filter((row) => normalizeSentiment(row.sentiment) === 'Neutral').length

  const benchBrandMentions = benchData.filter((row) => benchmarkSide(row, brand, competitor) === 'brand').length
  const benchCompetitorMentions = benchData.filter((row) => benchmarkSide(row, brand, competitor) === 'competitor').length
  const benchTotal = benchData.length
  const benchPos = benchData.filter((row) => normalizeSentiment(row.sentiment_detected || row.sentiment) === 'Positive').length
  const benchNeg = benchData.filter((row) => normalizeSentiment(row.sentiment_detected || row.sentiment) === 'Negative').length
  const benchmarkFrames = buildBenchmarkFrames(benchData, brand, competitor)

  const cxRated = cxData.filter((row) => safeNumber(row.rating) > 0)
  const cxAvgRating = cxRated.length
    ? (cxRated.reduce((sum, row) => sum + safeNumber(row.rating), 0) / cxRated.length).toFixed(2)
    : '0.00'
  const cxPos = cxData.filter((row) => normalizeSentiment(row.sentiment) === 'Positive').length
  const cxNeg = cxData.filter((row) => normalizeSentiment(row.sentiment) === 'Negative').length

  const socialBrandNeg = socialBrandData.filter((row) => normalizeSentiment(row.sentiment) === 'Negative').length
  const socialBrandPos = socialBrandData.filter((row) => normalizeSentiment(row.sentiment) === 'Positive').length
  const socialEngagement = socialBrandData.reduce(
    (sum, row) => sum + safeNumber(row.likes) + safeNumber(row.shares) + safeNumber(row.replies),
    0
  )

  const actionCandidates = buildActionCandidates({ repData, cxData, benchData, brand, competitor })

  return {
    metadata: {
      rowLimit: limit,
      totalMentions: repTotal + benchTotal + cxData.length + socialBrandData.length + socialCompetitorData.length,
      sources: {
        reputation: repTotal,
        benchmark: benchTotal,
        cx: cxData.length,
        socialBrand: socialBrandData.length,
        socialCompetitor: socialCompetitorData.length
      }
    },
    reputation: {
      total: repTotal,
      negative: repNeg,
      positive: repPos,
      neutral: repNeu,
      crisisScore: percentage(repNeg, repTotal),
      topPlatforms: topEntries(countBy(repData, (row) => row.platform), 4),
      proofs: buildProofs(repData, {
        fallbackSource: 'Reputation',
        contextResolver: (row) => [safeText(row.severity), normalizeSentiment(row.sentiment)].filter(Boolean).join(' | ')
      })
    },
    benchmark: {
      total: benchTotal,
      brandMentions: benchBrandMentions,
      competitorMentions: benchCompetitorMentions,
      sovBrand: percentage(benchBrandMentions, benchBrandMentions + benchCompetitorMentions),
      sovCompetitor: percentage(benchCompetitorMentions, benchBrandMentions + benchCompetitorMentions),
      positive: benchPos,
      negative: benchNeg,
      topTopics: topEntries(countBy(benchData, (row) => row.topic || row.benchmark_dimension), 5),
      winningDimensions: benchmarkFrames.winners,
      losingDimensions: benchmarkFrames.losers,
      neutralDimensions: benchmarkFrames.neutral,
      proofs: buildProofs(benchData, {
        fallbackSource: 'Benchmark',
        contextResolver: (row) => {
          const side = benchmarkSide(row, brand, competitor) === 'brand' ? brand : competitor
          return [safeText(row.benchmark_dimension || row.topic), side].filter(Boolean).join(' | ')
        }
      })
    },
    cx: {
      total: cxData.length,
      avgRating: cxAvgRating,
      positive: cxPos,
      negative: cxNeg,
      topCategories: topEntries(countBy(cxData, (row) => row.category || row.pain_point || row.delight_point || row.customer_journey_step), 5),
      topStores: buildStoreHotspots(cxData),
      proofs: buildProofs(cxData, {
        fallbackSource: 'Voix du client',
        contextResolver: (row) => [safeText(row.category || row.pain_point || row.customer_journey_step), safeText(row.store_city || row.store_name)].filter(Boolean).join(' | ')
      })
    },
    social: {
      brandTotal: socialBrandData.length,
      brandNegative: socialBrandNeg,
      brandPositive: socialBrandPos,
      competitorTotal: socialCompetitorData.length,
      engagement: socialEngagement,
      verifiedAuthors: socialBrandData.filter((row) => Boolean(row.is_verified)).length,
      topPlatforms: topEntries(countBy(socialBrandData, (row) => row.platform), 4),
      proofs: buildProofs(socialBrandData, {
        fallbackSource: 'Social',
        contextResolver: (row) => [normalizeSentiment(row.sentiment), row.is_verified ? 'compte verifie' : ''].filter(Boolean).join(' | ')
      }),
      competitorProofs: buildProofs(socialCompetitorData, {
        fallbackSource: 'Social concurrent',
        contextResolver: (row) => [normalizeSentiment(row.sentiment), row.is_verified ? 'compte verifie' : ''].filter(Boolean).join(' | ')
      })
    },
    actions: {
      total: actionCandidates.length,
      urgent: actionCandidates.filter((candidate) => candidate.urgency === 'high').length,
      topOwners: topEntries(countBy(actionCandidates, (candidate) => candidate.owner), 4),
      candidates: actionCandidates
    }
  }
}

function buildPromptPayload({ brand, competitor, dateRange, tone, detailLevel, focus, dataSources, sections, stats, includeAppendix }) {
  return {
    brand,
    competitor,
    dateRange,
    memo_style: 'Fnac Darty board memo',
    tone,
    detail_level: detailLevel,
    focus,
    included_sources: dataSources.map((source) => SOURCE_LABELS[source] || source),
    included_sections: sections.map((sectionId) => ({
      id: sectionId,
      label: REPORT_SECTION_LABELS[sectionId] || sectionId
    })),
    scorecard: {
      tension_score: `${stats.reputation.crisisScore}%`,
      share_of_voice_brand: `${stats.benchmark.sovBrand}%`,
      average_cx_rating: `${stats.cx.avgRating}/5`,
      total_records: stats.metadata.totalMentions
    },
    reputation: dataSources.includes('reputation')
      ? {
        total_mentions: stats.reputation.total,
        negative: stats.reputation.negative,
        positive: stats.reputation.positive,
        platforms: stats.reputation.topPlatforms.map(([label, count]) => ({ label, count })),
        proofs: stats.reputation.proofs,
        social: {
          brand_mentions: stats.social.brandTotal,
          competitor_mentions: stats.social.competitorTotal,
          engagement: stats.social.engagement,
          verified_authors: stats.social.verifiedAuthors,
          platforms: stats.social.topPlatforms.map(([label, count]) => ({ label, count })),
          proofs: stats.social.proofs,
          competitor_proofs: stats.social.competitorProofs
        }
      }
      : null,
    benchmark: dataSources.includes('benchmark')
      ? {
        total_mentions: stats.benchmark.total,
        share_of_voice_brand: `${stats.benchmark.sovBrand}%`,
        share_of_voice_competitor: `${stats.benchmark.sovCompetitor}%`,
        top_topics: stats.benchmark.topTopics.map(([label, count]) => ({ label, count })),
        winning_dimensions: stats.benchmark.winningDimensions.map((item) => ({
          dimension: item.dimension,
          delta: item.delta,
          volume: item.volume
        })),
        losing_dimensions: stats.benchmark.losingDimensions.map((item) => ({
          dimension: item.dimension,
          delta: item.delta,
          volume: item.volume
        })),
        proofs: stats.benchmark.proofs
      }
      : null,
    voice_of_customer: dataSources.includes('cx')
      ? {
        total_reviews: stats.cx.total,
        average_rating: `${stats.cx.avgRating}/5`,
        negative: stats.cx.negative,
        positive: stats.cx.positive,
        top_categories: stats.cx.topCategories.map(([label, count]) => ({ label, count })),
        top_stores: stats.cx.topStores,
        proofs: stats.cx.proofs
      }
      : null,
    actions: {
      candidates: stats.actions.candidates.map((candidate) => ({
        title: candidate.title,
        owner: candidate.owner,
        urgency: candidate.urgency,
        impact: candidate.impact,
        proof: candidate.proof,
        source: candidate.source
      }))
    },
    appendix_requested: includeAppendix
  }
}

function buildBlueprintPrompt(options) {
  const promptPayload = buildPromptPayload(options)
  const schema = {
    cover: {
      eyebrow: 'string',
      title: 'string',
      subtitle: 'string'
    },
    executive: {
      headline: 'string',
      summary: 'string',
      decisions: ['string', 'string', 'string']
    },
    sections: [
      {
        id: 'executive|war_room|battle_matrix|voice_of_customer|action_center',
        title: 'string',
        headline: 'string',
        takeaway: 'string',
        bullets: ['string', 'string', 'string'],
        proofs: [
          {
            quote: 'string',
            source: 'string'
          }
        ]
      }
    ],
    appendix: {
      items: ['string']
    }
  }

  return [
    'Tu ecris un memo COMEX pour Fnac Darty.',
    'Le style doit etre retail, direct, lisible, exigeant, sans lyrisme ni jargon vide.',
    'Le document doit sentir Fnac/Darty: arbitrage, magasins, parcours client, execution, competition.',
    toneInstruction(options.tone),
    detailInstruction(options.detailLevel),
    focusInstruction(options.focus),
    'Utilise uniquement les faits fournis. Si la preuve est faible, dis-le sobrement. N invente ni chiffres ni citations.',
    'Les titres doivent etre courts. Les bullets doivent etre nerveux. Les preuves doivent rester courtes.',
    'Retourne UNIQUEMENT un JSON valide, sans markdown, sans commentaire, sans texte avant ou apres.',
    'La liste sections doit respecter exactement l ordre des sections demandees et ne pas en ajouter.',
    'La partie executive.decisions doit contenir exactement 3 decisions.',
    'Si appendix_requested vaut false, renvoie appendix.items comme tableau vide.',
    '',
    'Schema attendu:',
    JSON.stringify(schema, null, 2),
    '',
    'Contexte data:',
    JSON.stringify(promptPayload, null, 2)
  ].join('\n')
}

function extractJsonObject(text) {
  const cleaned = safeText(text)
    .replace(/^```json/i, '')
    .replace(/^```/i, '')
    .replace(/```$/i, '')
    .trim()

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return cleaned.slice(start, end + 1)
}

function fallbackDecisions(stats) {
  const actions = stats.actions.candidates.slice(0, 3).map((candidate) => clipText(candidate.title, 60))
  while (actions.length < 3) {
    actions.push('Consolider le pilotage sur les sujets a plus fort impact.')
  }
  return actions
}

function buildFallbackSection(sectionId, stats, brand, competitor) {
  if (sectionId === 'executive') {
    return {
      id: 'executive',
      title: 'Synthese executive',
      headline: `Le cockpit remonte une tension a ${stats.reputation.crisisScore}% et une note client a ${stats.cx.avgRating}/5.`,
      takeaway: `La priorite reste d arbitrer vite entre reputation, experience client et conquete face a ${competitor}.`,
      bullets: [
        `${brand} pese ${stats.benchmark.sovBrand}% de la voix benchmark suivie.`,
        `${stats.cx.negative} avis negatifs et ${stats.reputation.negative} signaux reputationnels restent a traiter.`,
        `${stats.actions.urgent} chantiers ressortent comme urgents dans l execution.`
      ],
      proofs: [...stats.reputation.proofs, ...stats.cx.proofs].slice(0, 2)
    }
  }

  if (sectionId === 'war_room') {
    const topPlatform = stats.reputation.topPlatforms[0]?.[0] || 'les plateformes prioritaires'
    return {
      id: 'war_room',
      title: 'War Room',
      headline: `${stats.reputation.negative} signaux negatifs se concentrent surtout sur ${topPlatform}.`,
      takeaway: 'Le front reputation reste pilotable si les reponses se concentrent sur les preuves visibles et les canaux les plus charges.',
      bullets: [
        `${stats.reputation.crisisScore}% du flux reputation est negatif.`,
        `${stats.social.engagement} interactions sociales ont ete captees sur la marque.`,
        `${stats.social.verifiedAuthors} auteurs verifies ont pris la parole sur ce perimetre.`
      ],
      proofs: [...stats.reputation.proofs, ...stats.social.proofs].slice(0, 2)
    }
  }

  if (sectionId === 'battle_matrix') {
    const winner = stats.benchmark.winningDimensions[0]?.dimension || 'les sujets les plus favorables'
    const loser = stats.benchmark.losingDimensions[0]?.dimension || 'les sujets sous pression'
    return {
      id: 'battle_matrix',
      title: 'Battle Matrix',
      headline: `${brand} porte ${stats.benchmark.sovBrand}% de la voix benchmark face a ${competitor}.`,
      takeaway: `Les gains se jouent sur ${winner.toLowerCase()}, tandis que ${loser.toLowerCase()} demande une reponse plus nette.`,
      bullets: [
        `Territoire a pousser: ${winner}.`,
        `Territoire a proteger: ${stats.benchmark.topTopics[0]?.[0] || 'les sujets deja possedes'}.`,
        `Territoire a reprendre: ${loser}.`
      ],
      proofs: stats.benchmark.proofs.slice(0, 2)
    }
  }

  if (sectionId === 'voice_of_customer') {
    const topCategory = stats.cx.topCategories[0]?.[0] || 'le parcours client'
    const topStore = stats.cx.topStores[0]?.name || 'les points de vente les plus exposes'
    return {
      id: 'voice_of_customer',
      title: 'Voix du Client',
      headline: `La note moyenne ressort a ${stats.cx.avgRating}/5 sur ${stats.cx.total} avis utiles.`,
      takeaway: `La friction remonte surtout sur ${topCategory.toLowerCase()} et se voit vite en magasin sur ${topStore}.`,
      bullets: [
        `${stats.cx.negative} avis negatifs sont remontes sur le perimetre suivi.`,
        `Categorie la plus citee: ${topCategory}.`,
        `Magasin ou ville la plus tendue: ${topStore}.`
      ],
      proofs: stats.cx.proofs.slice(0, 2)
    }
  }

  const primaryAction = stats.actions.candidates[0]
  const secondaryAction = stats.actions.candidates[1]
  const tertiaryAction = stats.actions.candidates[2]

  return {
    id: 'action_center',
    title: 'Action Center',
    headline: `La feuille de route doit partir de ${stats.actions.urgent} chantiers urgents et visibles.`,
    takeaway: 'La bonne reponse consiste a dater peu d actions, avec un owner clair et une preuve terrain derriere chaque move.',
    bullets: [
      primaryAction ? `${primaryAction.title} - ${primaryAction.owner}.` : 'Fixer un plan de reponse visible sur les irritants majeurs.',
      secondaryAction ? `${secondaryAction.title} - ${secondaryAction.owner}.` : 'Donner un owner a chaque sujet qui degrade l experience.',
      tertiaryAction ? `${tertiaryAction.title} - ${tertiaryAction.owner}.` : 'Relier chaque action a une preuve terrain courte.'
    ],
    proofs: stats.actions.candidates.slice(0, 2).map((candidate) => ({
      quote: candidate.proof,
      source: `${candidate.source} | ${candidate.owner}`
    }))
  }
}

function buildFallbackBlueprint({ brand, competitor, dateRange, sections, includeAppendix, stats }) {
  return {
    cover: {
      eyebrow: 'Memo COMEX / PDF',
      title: 'Memo Fnac Darty calibre pour le COMEX.',
      subtitle: `${brand} vs ${competitor} - ${dateRange}. Une lecture courte, orientee arbitrage, alignee sur le cockpit.`
    },
    executive: {
      headline: `Le cockpit pointe un niveau de tension de ${stats.reputation.crisisScore}% avec une note client moyenne de ${stats.cx.avgRating}/5.`,
      summary: `${brand} conserve ${stats.benchmark.sovBrand}% de la voix benchmark suivie. Le memo doit d abord arbitrer reputation, execution magasin et sujets de conquete face a ${competitor}.`,
      decisions: fallbackDecisions(stats)
    },
    sections: sections.map((sectionId) => buildFallbackSection(sectionId, stats, brand, competitor)),
    appendix: {
      items: includeAppendix
        ? [
          `Bases actives: ${Object.keys(stats.metadata.sources).filter((key) => stats.metadata.sources[key] > 0).join(', ')}.`,
          `Volume total analyse: ${stats.metadata.totalMentions} lignes utiles.`,
          `Limite par base: ${stats.metadata.rowLimit} lignes.`,
          `Part reputation: ${stats.metadata.sources.reputation} lignes.`,
          `Part benchmark: ${stats.metadata.sources.benchmark} lignes.`,
          `Part voix du client: ${stats.metadata.sources.cx} lignes.`
        ]
        : []
    }
  }
}

function sanitizeProofList(proofs, fallbackProofs = []) {
  const normalized = Array.isArray(proofs)
    ? proofs
      .map((proof) => {
        if (typeof proof === 'string') {
          return { quote: clipText(proof, 150), source: 'Source' }
        }
        return {
          quote: clipText(proof?.quote, 150),
          source: clipText(proof?.source, 60)
        }
      })
      .filter((proof) => proof.quote)
    : []

  const withFallback = normalized.length > 0 ? normalized : fallbackProofs
  return withFallback.slice(0, 2)
}

function sanitizeBlueprint(rawBlueprint, context) {
  const fallback = buildFallbackBlueprint(context)

  const cover = {
    eyebrow: clipText(rawBlueprint?.cover?.eyebrow || fallback.cover.eyebrow, 30),
    title: clipText(rawBlueprint?.cover?.title || fallback.cover.title, 88),
    subtitle: clipText(rawBlueprint?.cover?.subtitle || fallback.cover.subtitle, 180)
  }

  const executive = {
    headline: clipText(rawBlueprint?.executive?.headline || fallback.executive.headline, 120),
    summary: clipText(rawBlueprint?.executive?.summary || fallback.executive.summary, 260),
    decisions: fallbackDecisions(context.stats)
  }

  const candidateDecisions = Array.isArray(rawBlueprint?.executive?.decisions)
    ? rawBlueprint.executive.decisions.map((decision) => clipText(decision, 80)).filter(Boolean).slice(0, 3)
    : []

  if (candidateDecisions.length === 3) {
    executive.decisions = candidateDecisions
  }

  const rawSections = Array.isArray(rawBlueprint?.sections) ? rawBlueprint.sections : []

  const sections = context.sections.map((sectionId) => {
    const modelSection = rawSections.find((section) => safeText(section?.id) === sectionId)
    const fallbackSection = fallback.sections.find((section) => section.id === sectionId)
    return {
      id: sectionId,
      title: clipText(modelSection?.title || fallbackSection.title, 42),
      headline: clipText(modelSection?.headline || fallbackSection.headline, 120),
      takeaway: clipText(modelSection?.takeaway || fallbackSection.takeaway, 180),
      bullets: (
        Array.isArray(modelSection?.bullets)
          ? modelSection.bullets.map((bullet) => clipText(bullet, 88)).filter(Boolean).slice(0, 3)
          : fallbackSection.bullets
      ),
      proofs: sanitizeProofList(modelSection?.proofs, fallbackSection.proofs)
    }
  })

  const appendixItems = context.includeAppendix
    ? (
      Array.isArray(rawBlueprint?.appendix?.items)
        ? rawBlueprint.appendix.items.map((item) => clipText(item, 100)).filter(Boolean).slice(0, 6)
        : fallback.appendix.items
    )
    : []

  return { cover, executive, sections, appendix: { items: appendixItems } }
}

function buildMetricsForSection(sectionId, stats, brand, competitor) {
  if (sectionId === 'executive') {
    return [
      { label: 'Tension', value: `${stats.reputation.crisisScore}%`, note: 'score de crise' },
      { label: `SOV ${brand}`, value: `${stats.benchmark.sovBrand}%`, note: `vs ${competitor}` },
      { label: 'CX', value: `${stats.cx.avgRating}/5`, note: 'note moyenne' }
    ]
  }

  if (sectionId === 'war_room') {
    return [
      { label: 'Negatif', value: `${stats.reputation.negative}`, note: 'signaux reputionnels' },
      { label: 'Social', value: `${stats.social.brandTotal}`, note: 'mentions marque' },
      { label: 'Engagement', value: `${stats.social.engagement}`, note: 'interactions' }
    ]
  }

  if (sectionId === 'battle_matrix') {
    return [
      { label: `SOV ${brand}`, value: `${stats.benchmark.sovBrand}%`, note: 'part de voix' },
      { label: `${brand}`, value: `${stats.benchmark.brandMentions}`, note: 'mentions marque' },
      { label: competitor, value: `${stats.benchmark.competitorMentions}`, note: 'mentions concurrent' }
    ]
  }

  if (sectionId === 'voice_of_customer') {
    return [
      { label: 'Avis', value: `${stats.cx.total}`, note: 'perimetre utile' },
      { label: 'Note', value: `${stats.cx.avgRating}/5`, note: 'moyenne' },
      { label: 'Negatif', value: `${stats.cx.negative}`, note: 'avis critiques' }
    ]
  }

  return [
    { label: 'Actions', value: `${stats.actions.total}`, note: 'moves proposes' },
    { label: 'Urgent', value: `${stats.actions.urgent}`, note: 'a traiter vite' },
    { label: 'Owners', value: `${stats.actions.topOwners.length}`, note: 'poles mobilises' }
  ]
}

function paintPage(doc) {
  doc.rect(0, 0, PAGE.width, PAGE.height).fill(THEME.page)
}

function drawBrandMarks(doc, x, y) {
  try {
    if (existsSync(FNAC_LOGO_PATH)) {
      doc.image(FNAC_LOGO_PATH, x, y, { fit: [64, 64] })
    }
  } catch {
    doc.fillColor(THEME.ink).font('Helvetica-Bold').fontSize(14).text('FNAC', x, y)
  }

  try {
    if (existsSync(DARTY_LOGO_PATH)) {
      doc.image(DARTY_LOGO_PATH, x + 74, y + 6, { fit: [46, 46] })
    }
  } catch {
    doc.fillColor(THEME.red).font('Helvetica-Bold').fontSize(14).text('DARTY', x + 74, y + 8)
  }
}

function textHeight(doc, text, width, options = {}) {
  const { font = 'Helvetica', size = 11, lineGap = 2 } = options
  doc.font(font).fontSize(size)
  return doc.heightOfString(text, { width, lineGap })
}

function drawMetricCard(doc, x, y, width, height, metric, variant = 'paper') {
  const fill = variant === 'yellow' ? THEME.yellowSoft : THEME.paper
  const border = variant === 'yellow' ? THEME.ink : THEME.line

  doc.roundedRect(x, y, width, height, 16).fillAndStroke(fill, border)
  doc.fillColor(THEME.muted).font('Helvetica-Bold').fontSize(8.5)
  doc.text(metric.label.toUpperCase(), x + 14, y + 12, { width: width - 28 })
  doc.fillColor(THEME.ink).font('Helvetica-Bold').fontSize(21)
  doc.text(metric.value, x + 14, y + 28, { width: width - 28 })
  doc.fillColor(THEME.muted).font('Helvetica').fontSize(8.5)
  doc.text(metric.note, x + 14, y + height - 22, { width: width - 28 })
}

function drawChip(doc, x, y, text, options = {}) {
  const fill = options.fill || THEME.paper
  const border = options.border || THEME.ink
  const color = options.color || THEME.ink
  const width = Math.max(90, text.length * 5.4 + 22)

  doc.roundedRect(x, y, width, 24, 12).fillAndStroke(fill, border)
  doc.fillColor(color).font('Helvetica-Bold').fontSize(8.5)
  doc.text(text, x + 11, y + 8, { width: width - 18 })

  return width
}

function drawCalloutCard(doc, x, y, width, title, body, options = {}) {
  const fill = options.fill || THEME.paper
  const border = options.border || THEME.line
  const titleColor = options.titleColor || THEME.ink
  const bodyColor = options.bodyColor || THEME.inkSoft

  const titleHeight = textHeight(doc, title, width - 30, { font: 'Helvetica-Bold', size: 13, lineGap: 2 })
  const bodyHeight = textHeight(doc, body, width - 30, { font: 'Helvetica', size: 11, lineGap: 3 })
  const height = 20 + titleHeight + 10 + bodyHeight + 18

  doc.roundedRect(x, y, width, height, 18).fillAndStroke(fill, border)
  doc.rect(x, y, 8, height).fill(options.accent || THEME.red)

  doc.fillColor(titleColor).font('Helvetica-Bold').fontSize(13)
  doc.text(title, x + 18, y + 16, { width: width - 34, lineGap: 2 })
  doc.fillColor(bodyColor).font('Helvetica').fontSize(11)
  doc.text(body, x + 18, y + 16 + titleHeight + 10, { width: width - 34, lineGap: 3 })

  return height
}

function drawDecisionList(doc, x, y, width, decisions) {
  const headerHeight = 46
  let currentY = y + headerHeight

  const itemHeights = decisions.map((decision) => {
    const bodyHeight = textHeight(doc, decision, width - 62, { font: 'Helvetica', size: 10.5, lineGap: 2 })
    return Math.max(56, bodyHeight + 26)
  })

  const totalHeight = headerHeight + itemHeights.reduce((sum, height) => sum + height + 8, 0) + 10
  doc.roundedRect(x, y, width, totalHeight, 18).fillAndStroke(THEME.black, THEME.black)
  doc.fillColor(THEME.yellow).font('Helvetica-Bold').fontSize(10)
  doc.text('3 DECISIONS A ARBITRER', x + 18, y + 16, { width: width - 32 })

  decisions.forEach((decision, index) => {
    const itemHeight = itemHeights[index]
    doc.roundedRect(x + 14, currentY, width - 28, itemHeight, 14).fillAndStroke(THEME.blackSoft, THEME.red)
    doc.fillColor(THEME.yellow).font('Helvetica-Bold').fontSize(11)
    doc.text(String(index + 1).padStart(2, '0'), x + 26, currentY + 18, { width: 20 })
    doc.fillColor('#FFFFFF').font('Helvetica').fontSize(10.5)
    doc.text(decision, x + 54, currentY + 16, { width: width - 80, lineGap: 2 })
    currentY += itemHeight + 8
  })

  return totalHeight
}

function drawSectionHeader(doc, label, title, subtitle) {
  doc.rect(0, 0, PAGE.width, 110).fill(THEME.black)
  doc.rect(0, 0, PAGE.width, 8).fill(THEME.red)

  doc.fillColor(THEME.yellow).font('Helvetica-Bold').fontSize(10)
  doc.text(label.toUpperCase(), PAGE.marginX, 26, { width: 200 })
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(24)
  doc.text(title, PAGE.marginX, 42, { width: 340 })
  doc.fillColor('#E9DECA').font('Helvetica').fontSize(10.5)
  doc.text(subtitle, PAGE.marginX, 74, { width: 420 })
}

function drawBulletRows(doc, y, bullets) {
  let currentY = y

  bullets.slice(0, 3).forEach((bullet, index) => {
    const bodyHeight = textHeight(doc, bullet, PAGE.contentWidth - 92, { font: 'Helvetica', size: 11, lineGap: 2 })
    const height = Math.max(52, bodyHeight + 24)

    doc.roundedRect(PAGE.marginX, currentY, PAGE.contentWidth, height, 16).fillAndStroke(THEME.paper, THEME.line)
    doc.roundedRect(PAGE.marginX + 14, currentY + 12, 28, 28, 10).fillAndStroke(THEME.yellow, THEME.ink)
    doc.fillColor(THEME.ink).font('Helvetica-Bold').fontSize(11)
    doc.text(String(index + 1), PAGE.marginX + 24, currentY + 21, { width: 10, align: 'center' })
    doc.fillColor(THEME.ink).font('Helvetica').fontSize(11)
    doc.text(bullet, PAGE.marginX + 56, currentY + 16, { width: PAGE.contentWidth - 74, lineGap: 2 })

    currentY += height + 10
  })

  return currentY
}

function drawProofRows(doc, y, proofs) {
  let currentY = y

  proofs.slice(0, 2).forEach((proof, index) => {
    const quoteHeight = textHeight(doc, `"${proof.quote}"`, PAGE.contentWidth - 36, { font: 'Helvetica', size: 10.5, lineGap: 3 })
    const height = 22 + quoteHeight + 28

    doc.roundedRect(PAGE.marginX, currentY, PAGE.contentWidth, height, 16).fillAndStroke(index === 0 ? THEME.yellowSoft : THEME.paper, THEME.line)
    doc.rect(PAGE.marginX, currentY, 8, height).fill(index === 0 ? THEME.red : THEME.black)
    doc.fillColor(THEME.ink).font('Helvetica').fontSize(10.5)
    doc.text(`"${proof.quote}"`, PAGE.marginX + 18, currentY + 16, { width: PAGE.contentWidth - 30, lineGap: 3 })
    doc.fillColor(THEME.muted).font('Helvetica-Bold').fontSize(8.5)
    doc.text(proof.source, PAGE.marginX + 18, currentY + 20 + quoteHeight + 8, { width: PAGE.contentWidth - 30 })

    currentY += height + 10
  })

  return currentY
}

function drawFooter(doc, pageNumber, pageCount, brand) {
  doc.strokeColor(THEME.line).lineWidth(1)
  doc.moveTo(PAGE.marginX, 792).lineTo(PAGE.width - PAGE.marginX, 792).stroke()
  doc.fillColor(THEME.muted).font('Helvetica').fontSize(8.5)
  doc.text(`${brand} | Memo COMEX confidentiel`, PAGE.marginX, 800, { width: 220 })
  doc.text(`Page ${pageNumber}/${pageCount}`, PAGE.width - PAGE.marginX - 80, 800, { width: 80, align: 'right' })
}

function renderCover(doc, blueprint, stats, context) {
  paintPage(doc)
  doc.rect(0, 0, PAGE.width, 252).fill(THEME.yellow)
  doc.rect(PAGE.width - 44, 0, 44, 252).fill(THEME.red)
  drawBrandMarks(doc, PAGE.marginX, 28)

  doc.fillColor(THEME.ink).font('Helvetica-Bold').fontSize(10)
  doc.text(blueprint.cover.eyebrow.toUpperCase(), PAGE.marginX, 96, { width: 180 })
  doc.fillColor(THEME.ink).font('Helvetica-Bold').fontSize(30)
  doc.text(blueprint.cover.title, PAGE.marginX, 116, { width: 370, lineGap: 2 })
  doc.fillColor(THEME.blackSoft).font('Helvetica').fontSize(13)
  doc.text(blueprint.cover.subtitle, PAGE.marginX, 198, { width: 370, lineGap: 3 })

  let chipX = PAGE.marginX
  chipX += drawChip(doc, chipX, 226, context.brand, { fill: THEME.paper, border: THEME.ink, color: THEME.ink }) + 8
  chipX += drawChip(doc, chipX, 226, context.dateRange, { fill: THEME.paper, border: THEME.ink, color: THEME.ink }) + 8
  drawChip(doc, chipX, 226, `${context.dataSources.length} bases`, { fill: THEME.paper, border: THEME.ink, color: THEME.ink })

  const metricY = 286
  const gap = 10
  const metricWidth = (PAGE.contentWidth - gap * 3) / 4
  const metrics = [
    { label: 'Tension', value: `${stats.reputation.crisisScore}%`, note: 'score de crise' },
    { label: 'SOV', value: `${stats.benchmark.sovBrand}%`, note: context.brand },
    { label: 'CX', value: `${stats.cx.avgRating}/5`, note: 'note moyenne' },
    { label: 'Volume', value: `${stats.metadata.totalMentions}`, note: 'lignes utiles' }
  ]

  metrics.forEach((metric, index) => {
    drawMetricCard(
      doc,
      PAGE.marginX + index * (metricWidth + gap),
      metricY,
      metricWidth,
      82,
      metric,
      index === 0 ? 'yellow' : 'paper'
    )
  })

  const summaryY = 392
  const leftWidth = 318
  const rightWidth = PAGE.contentWidth - leftWidth - 14
  const summaryHeight = drawCalloutCard(doc, PAGE.marginX, summaryY, leftWidth, blueprint.executive.headline, blueprint.executive.summary, {
    fill: THEME.paper,
    border: THEME.line,
    accent: THEME.red,
    titleColor: THEME.ink,
    bodyColor: THEME.inkSoft
  })
  const decisionsHeight = drawDecisionList(doc, PAGE.marginX + leftWidth + 14, summaryY, rightWidth, blueprint.executive.decisions)

  const sectionsY = summaryY + Math.max(summaryHeight, decisionsHeight) + 18
  doc.fillColor(THEME.muted).font('Helvetica-Bold').fontSize(9)
  doc.text('SECTIONS INCLUSES', PAGE.marginX, sectionsY, { width: 160 })

  let currentX = PAGE.marginX
  let currentY = sectionsY + 18
  context.sections.forEach((sectionId) => {
    const label = REPORT_SECTION_LABELS[sectionId] || sectionId
    const chipWidth = Math.max(116, label.length * 5.2 + 24)
    if (currentX + chipWidth > PAGE.width - PAGE.marginX) {
      currentX = PAGE.marginX
      currentY += 30
    }
    drawChip(doc, currentX, currentY, label, { fill: THEME.paper, border: THEME.line, color: THEME.ink })
    currentX += chipWidth + 8
  })
}

function renderSectionPage(doc, section, stats, context) {
  doc.addPage()
  paintPage(doc)
  drawSectionHeader(doc, REPORT_SECTION_LABELS[section.id] || section.id, section.title, section.headline)

  const metrics = buildMetricsForSection(section.id, stats, context.brand, context.competitor)
  const gap = 12
  const metricWidth = (PAGE.contentWidth - gap * 2) / 3
  metrics.forEach((metric, index) => {
    drawMetricCard(doc, PAGE.marginX + index * (metricWidth + gap), 136, metricWidth, 78, metric, index === 0 ? 'yellow' : 'paper')
  })

  let y = 236
  y += drawCalloutCard(doc, PAGE.marginX, y, PAGE.contentWidth, 'Lecture rapide', section.takeaway, {
    fill: THEME.paper,
    border: THEME.line,
    accent: THEME.red
  }) + 18

  doc.fillColor(THEME.muted).font('Helvetica-Bold').fontSize(9)
  doc.text('A RETENIR', PAGE.marginX, y, { width: 160 })
  y += 18
  y = drawBulletRows(doc, y, section.bullets)

  if (section.proofs.length > 0) {
    doc.fillColor(THEME.muted).font('Helvetica-Bold').fontSize(9)
    doc.text('PREUVES TERRAIN', PAGE.marginX, y + 2, { width: 180 })
    y += 20
    drawProofRows(doc, y, section.proofs)
  }
}

function renderAppendixPage(doc, blueprint, stats, context) {
  doc.addPage()
  paintPage(doc)
  drawSectionHeader(doc, 'Annexe', 'Volumes et perimetre', 'Lecture rapide des bases utilisees et de la couverture du memo.')

  const metrics = [
    { label: 'Total', value: `${stats.metadata.totalMentions}`, note: 'lignes utiles' },
    { label: 'Limite', value: `${stats.metadata.rowLimit}`, note: 'par base' },
    { label: 'Bases', value: `${context.dataSources.length}`, note: 'actives' }
  ]

  const gap = 12
  const metricWidth = (PAGE.contentWidth - gap * 2) / 3
  metrics.forEach((metric, index) => {
    drawMetricCard(doc, PAGE.marginX + index * (metricWidth + gap), 136, metricWidth, 78, metric, index === 0 ? 'yellow' : 'paper')
  })

  let y = 236
  y += drawCalloutCard(doc, PAGE.marginX, y, PAGE.contentWidth, 'Bases chargees', context.dataSources.map((source) => SOURCE_LABELS[source] || source).join(' | '), {
    fill: THEME.paper,
    border: THEME.line,
    accent: THEME.red
  }) + 18

  const appendixItems = blueprint.appendix.items.length > 0
    ? blueprint.appendix.items
    : [
      `Reputation & Crise: ${stats.metadata.sources.reputation} lignes.`,
      `Benchmark Marche: ${stats.metadata.sources.benchmark} lignes.`,
      `Voix du Client: ${stats.metadata.sources.cx} lignes.`,
      `Social marque: ${stats.metadata.sources.socialBrand} lignes.`,
      `Social concurrent: ${stats.metadata.sources.socialCompetitor} lignes.`
    ]

  doc.fillColor(THEME.muted).font('Helvetica-Bold').fontSize(9)
  doc.text('DETAILS', PAGE.marginX, y, { width: 120 })
  y += 18
  y = drawBulletRows(doc, y, appendixItems)

  const owners = stats.actions.topOwners.slice(0, 3)
  if (owners.length > 0) {
    doc.fillColor(THEME.muted).font('Helvetica-Bold').fontSize(9)
    doc.text('POLES LES PLUS SOLLICITES', PAGE.marginX, y + 2, { width: 220 })
    y += 20
    drawProofRows(doc, y, owners.map(([owner, count]) => ({
      quote: `${count} actions retombent sur ${owner}.`,
      source: 'Action Center'
    })))
  }
}

function parseBlueprint(responseText, context) {
  const rawJson = extractJsonObject(responseText)
  if (!rawJson) return buildFallbackBlueprint(context)

  try {
    const parsed = JSON.parse(rawJson)
    return sanitizeBlueprint(parsed, context)
  } catch {
    return buildFallbackBlueprint(context)
  }
}

export async function generateComexPdf(req, res) {
  const {
    brand = 'Fnac Darty',
    competitor = 'Boulanger',
    dateRange = '12 derniers mois',
    tone = 'corporate',
    detailLevel = 'standard',
    dataVolume = 'standard',
    focus = 'balanced',
    includeAppendix = false
  } = req.body

  const dataSources = resolveDataSources(req.body)
  const sections = normalizeSections(req.body.sections)

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(400).json({ error: 'ANTHROPIC_API_KEY manquant dans backend/.env' })
  }

  if (dataSources.length === 0) {
    return res.status(400).json({ error: 'Aucune base de donnees selectionnee pour le memo COMEX' })
  }

  try {
    const stats = await fetchDataSummary({ brand, competitor, dataSources, dataVolume })
    const prompt = buildBlueprintPrompt({
      brand,
      competitor,
      dateRange,
      tone,
      detailLevel,
      focus,
      sections,
      dataSources,
      stats,
      includeAppendix
    })

    const message = await getAnthropicClient().messages.create({
      model: DEFAULT_MODEL,
      max_tokens: detailLevel === 'deep' ? 2600 : detailLevel === 'synthesis' ? 1500 : 2100,
      temperature: 0.5,
      messages: [{ role: 'user', content: prompt }]
    })

    const responseText = message.content.find((part) => part.type === 'text')?.text || ''
    const blueprint = parseBlueprint(responseText, {
      brand,
      competitor,
      dateRange,
      sections,
      includeAppendix,
      dataSources,
      stats
    })

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="COMEX_${brand.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf"`)

    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      bufferPages: true,
      info: {
        Title: `Memo COMEX - ${brand}`,
        Author: 'Licter Intelligence',
        Subject: 'Fnac Darty styled board memo'
      }
    })

    doc.pipe(res)
    renderCover(doc, blueprint, stats, { brand, competitor, dateRange, sections, dataSources })
    blueprint.sections.forEach((section) => renderSectionPage(doc, section, stats, { brand, competitor }))

    if (includeAppendix) {
      renderAppendixPage(doc, blueprint, stats, { brand, dataSources })
    }

    const pageRange = doc.bufferedPageRange()
    const pageCount = pageRange.count

    for (let i = pageRange.start; i < pageRange.start + pageCount; i += 1) {
      doc.switchToPage(i)
      drawFooter(doc, i - pageRange.start + 1, pageCount, brand)
    }

    doc.end()
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: error.message })
    }
  }
}
