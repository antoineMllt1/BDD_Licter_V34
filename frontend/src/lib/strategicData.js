import { useEffect, useMemo, useState } from 'react'
import { fetchAll } from './supabase.js'
import { useFilters } from './FilterContext.jsx'

const SOURCE_CONFIG = [
  { key: 'reputation', table: 'reputation_crise', order: 'date', limit: 4000 },
  { key: 'benchmark', table: 'benchmark_marche', order: 'date', limit: 4000 },
  { key: 'cx', table: 'voix_client_cx', order: 'date', limit: 4000 },
  { key: 'brandReviews', table: 'scraping_brand', order: 'date', limit: 4000 },
  { key: 'competitorReviews', table: 'scraping_competitor', order: 'date', limit: 4000 },
  { key: 'socialBrand', table: 'social_mentions', order: 'date', limit: 4000 },
  { key: 'socialCompetitor', table: 'social_mentions_competitor', order: 'date', limit: 4000 },
]

const JOURNEY_LABELS = {
  pre_purchase: 'Avant achat',
  purchase: 'Achat',
  delivery: 'Livraison',
  post_purchase: 'Apres achat',
  support: 'Support',
}

const SIDE_LABELS = {
  brand: 'Fnac Darty',
  competitor: 'Boulanger',
}

const CITY_MATCHERS = [
  { match: 'boulogne', city: 'Boulogne-Billancourt', coordinates: [2.24, 48.84] },
  { match: 'beaugrenelle', city: 'Paris', coordinates: [2.29, 48.85] },
  { match: 'ternes', city: 'Paris', coordinates: [2.29, 48.88] },
  { match: 'montparnasse', city: 'Paris', coordinates: [2.32, 48.84] },
  { match: 'passy', city: 'Paris', coordinates: [2.28, 48.86] },
  { match: 'la defense', city: 'Paris', coordinates: [2.24, 48.89] },
  { match: 'paris', city: 'Paris', coordinates: [2.35, 48.86] },
  { match: 'lille', city: 'Lille', coordinates: [3.06, 50.63] },
  { match: 'amiens', city: 'Amiens', coordinates: [2.3, 49.89] },
  { match: 'rouen', city: 'Rouen', coordinates: [1.09, 49.44] },
  { match: 'reims', city: 'Reims', coordinates: [4.03, 49.26] },
  { match: 'nancy', city: 'Nancy', coordinates: [6.18, 48.69] },
  { match: 'metz', city: 'Metz', coordinates: [6.18, 49.12] },
  { match: 'strasbourg', city: 'Strasbourg', coordinates: [7.75, 48.58] },
  { match: 'caen', city: 'Caen', coordinates: [-0.37, 49.18] },
  { match: 'brest', city: 'Brest', coordinates: [-4.49, 48.39] },
  { match: 'rennes', city: 'Rennes', coordinates: [-1.68, 48.11] },
  { match: 'le havre', city: 'Le Havre', coordinates: [0.11, 49.49] },
  { match: 'tours', city: 'Tours', coordinates: [0.69, 47.39] },
  { match: 'nantes', city: 'Nantes', coordinates: [-1.55, 47.22] },
  { match: 'angers', city: 'Angers', coordinates: [-0.56, 47.47] },
  { match: 'orleans', city: 'Orleans', coordinates: [1.91, 47.9] },
  { match: 'dijon', city: 'Dijon', coordinates: [5.04, 47.32] },
  { match: 'besancon', city: 'Besancon', coordinates: [6.02, 47.24] },
  { match: 'poitiers', city: 'Poitiers', coordinates: [0.34, 46.58] },
  { match: 'la rochelle', city: 'La Rochelle', coordinates: [-1.15, 46.16] },
  { match: 'limoges', city: 'Limoges', coordinates: [1.26, 45.83] },
  { match: 'lyon', city: 'Lyon', coordinates: [4.84, 45.76] },
  { match: 'clermont-ferrand', city: 'Clermont-Ferrand', coordinates: [3.09, 45.78] },
  { match: 'grenoble', city: 'Grenoble', coordinates: [5.72, 45.19] },
  { match: 'saint-etienne', city: 'Saint-Etienne', coordinates: [4.39, 45.44] },
  { match: 'bordeaux', city: 'Bordeaux', coordinates: [-0.58, 44.84] },
  { match: 'valence', city: 'Valence', coordinates: [4.89, 44.93] },
  { match: 'avignon', city: 'Avignon', coordinates: [4.81, 43.95] },
  { match: 'nimes', city: 'Nimes', coordinates: [4.36, 43.84] },
  { match: 'montpellier', city: 'Montpellier', coordinates: [3.88, 43.61] },
  { match: 'toulouse', city: 'Toulouse', coordinates: [1.44, 43.6] },
  { match: 'marseille', city: 'Marseille', coordinates: [5.38, 43.3] },
  { match: 'toulon', city: 'Toulon', coordinates: [5.93, 43.12] },
  { match: 'nice', city: 'Nice', coordinates: [7.26, 43.7] },
  { match: 'cannes', city: 'Cannes', coordinates: [7.01, 43.55] },
  { match: 'perpignan', city: 'Perpignan', coordinates: [2.89, 42.69] },
  { match: 'pau', city: 'Pau', coordinates: [-0.37, 43.3] },
  { match: 'bayonne', city: 'Bayonne', coordinates: [-1.47, 43.49] },
  { match: 'annecy', city: 'Annecy', coordinates: [6.13, 45.9] },
  { match: 'mulhouse', city: 'Mulhouse', coordinates: [7.34, 47.75] },
]

let strategicTablesCache = null
let strategicTablesPromise = null

function safeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  const text = String(value).trim()
  return text || fallback
}

function safeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function normalizeSearchText(value) {
  return safeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function normalizeSentiment(value) {
  if (!value) return null
  const normalized = safeText(value).toLowerCase()
  if (normalized === 'positive' || normalized === 'positif') return 'Positive'
  if (normalized === 'negative' || normalized === 'negatif') return 'Negative'
  if (normalized === 'neutral' || normalized === 'neutre') return 'Neutral'
  return value
}

function normalizeDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function sortByDateDesc(rows) {
  return rows.slice().sort((left, right) => safeText(right.date).localeCompare(safeText(left.date)))
}

function sumBy(rows, selector) {
  return rows.reduce((total, row) => total + selector(row), 0)
}

function percentage(part, total) {
  if (!total) return 0
  return Math.round((part / total) * 100)
}

function dominantEntry(map, fallback = 'A definir') {
  const entries = Object.entries(map || {})
  if (entries.length === 0) return fallback
  return entries.sort((left, right) => right[1] - left[1])[0][0]
}

function sliceQuote(value, max = 160) {
  const text = safeText(value)
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max).trim()}...` : text
}

function severityRank(value) {
  const map = { critical: 0, high: 1, medium: 2, low: 3 }
  return map[safeText(value).toLowerCase()] ?? 4
}

function engagementValue(row) {
  return safeNumber(row.likes) + safeNumber(row.shares) + safeNumber(row.replies)
}

function groupBy(rows, keyFn) {
  return rows.reduce((accumulator, row) => {
    const key = keyFn(row)
    if (!key) return accumulator
    if (!accumulator[key]) accumulator[key] = []
    accumulator[key].push(row)
    return accumulator
  }, {})
}

function createDateSeries(rows, selector = () => 1, limit = 21) {
  const grouped = {}
  rows.forEach((row) => {
    if (!row.date) return
    const key = row.date.slice(0, 10)
    grouped[key] = (grouped[key] || 0) + selector(row)
  })

  return Object.entries(grouped)
    .sort((left, right) => left[0].localeCompare(right[0]))
    .slice(-limit)
    .map(([date, value]) => ({ date, value }))
}

function createSentimentSeries(rows, limit = 21) {
  const grouped = {}

  rows.forEach((row) => {
    if (!row.date) return
    const key = row.date.slice(0, 10)
    if (!grouped[key]) grouped[key] = { date: key, Positive: 0, Negative: 0, Neutral: 0 }
    const sentiment = normalizeSentiment(row.sentiment)
    if (sentiment && grouped[key][sentiment] !== undefined) grouped[key][sentiment] += 1
  })

  return Object.values(grouped)
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-limit)
}

function topEvidence(rows, limit = 3, minLength = 40) {
  return sortByDateDesc(rows)
    .filter((row) => safeText(row.text).length >= minLength)
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      text: sliceQuote(row.text, 180),
      source: row.platform,
      severity: row.severity,
      side: row.side,
      engagement: row.engagement,
      date: row.date,
      author: row.author,
    }))
}

function normalizedSideFromBrand(value, fallback = 'brand') {
  const text = safeText(value).toLowerCase()
  if (text.includes('boulanger')) return 'competitor'
  return fallback
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function parseCoordinatesFromSourceUrl(sourceUrl) {
  const raw = safeText(sourceUrl)
  if (!raw) return null

  const dataMatch = raw.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  if (dataMatch) {
    const latitude = toFiniteNumber(dataMatch[1])
    const longitude = toFiniteNumber(dataMatch[2])
    if (latitude !== null && longitude !== null) return [longitude, latitude]
  }

  const atMatch = raw.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/)
  if (atMatch) {
    const latitude = toFiniteNumber(atMatch[1])
    const longitude = toFiniteNumber(atMatch[2])
    if (latitude !== null && longitude !== null) return [longitude, latitude]
  }

  return null
}

function resolveCityMatch(text) {
  const normalized = normalizeSearchText(text)
  if (!normalized) return null
  return CITY_MATCHERS.find(({ match }) => normalized.includes(match)) || null
}

function inferStoreCity(row) {
  const explicitCity = safeText(row.storeCity || row.store_city)
  if (explicitCity) return explicitCity
  return resolveCityMatch([row.storeName, row.storeAddress, row.location].filter(Boolean).join(' '))?.city || null
}

function inferStoreCoordinates(row, city) {
  const longitude = toFiniteNumber(row.storeLongitude || row.longitude || row.lng || row.lon)
  const latitude = toFiniteNumber(row.storeLatitude || row.latitude || row.lat)
  if (longitude !== null && latitude !== null) return [longitude, latitude]

  const sourceUrlCoordinates = parseCoordinatesFromSourceUrl(row.sourceUrl)
  if (sourceUrlCoordinates) return sourceUrlCoordinates

  return resolveCityMatch(city || [row.storeName, row.storeAddress, row.location].filter(Boolean).join(' '))?.coordinates || null
}

function normalizeReviewRow(row, source, side) {
  return {
    id: safeText(row.review_id || row.id || `${source}-${Math.random()}`),
    source,
    side,
    family: 'review',
    platform: safeText(row.platform, source === 'voix_client_cx' ? 'CX' : 'Review'),
    brand: side === 'competitor' ? 'Boulanger' : 'Fnac Darty',
    text: safeText(row.text || row.review_text || row.content),
    date: normalizeDate(row.date || row.created_at || row.review_date),
    rating: row.rating ? safeNumber(row.rating) : null,
    sentiment: normalizeSentiment(row.sentiment || row.sentiment_detected),
    severity: safeText(row.severity).toLowerCase() || null,
    category: safeText(row.category || row.pain_point || row.delight_point) || null,
    painPoint: safeText(row.pain_point) || null,
    delightPoint: safeText(row.delight_point) || null,
    journeyStep: safeText(row.customer_journey_step) || null,
    recommendedAction: safeText(row.recommended_action) || null,
    teamOwner: safeText(row.team_owner, 'A assigner'),
    businessImpact: safeText(row.business_impact) || null,
    urgencyLevel: safeText(row.urgency_level) || null,
    isActionable: Boolean(row.is_actionable),
    insightReady: Boolean(row.insight_ready) || Boolean(row.sentiment || row.category || row.pain_point || row.recommended_action),
    storeName: safeText(row.store_name || row.location) || null,
    storeCity: safeText(row.store_city) || null,
    storeAddress: safeText(row.store_address) || null,
    location: safeText(row.location) || null,
    sourceUrl: safeText(row.source_url) || null,
    storeLongitude: toFiniteNumber(row.store_longitude ?? row.longitude ?? row.lng ?? row.lon),
    storeLatitude: toFiniteNumber(row.store_latitude ?? row.latitude ?? row.lat),
    ownerResponse: safeText(row.owner_response) || null,
    likes: safeNumber(row.likes),
    shares: safeNumber(row.shares || row.share_count),
    replies: safeNumber(row.replies || row.reply_count),
    views: safeNumber(row.views),
    engagement: safeNumber(row.likes) + safeNumber(row.shares || row.share_count) + safeNumber(row.replies || row.reply_count),
    author: safeText(row.author) || null,
    isVerified: Boolean(row.is_verified),
  }
}

function normalizeSocialRow(row, side) {
  return {
    id: safeText(row.review_id || row.id || `${side}-${Math.random()}`),
    source: side === 'competitor' ? 'social_mentions_competitor' : 'social_mentions',
    side,
    family: 'social',
    platform: safeText(row.platform, 'Twitter/X'),
    brand: side === 'competitor' ? 'Boulanger' : 'Fnac Darty',
    text: safeText(row.text),
    date: normalizeDate(row.date || row.created_at),
    sentiment: normalizeSentiment(row.sentiment),
    severity: safeText(row.severity).toLowerCase() || null,
    likes: safeNumber(row.likes),
    shares: safeNumber(row.shares),
    replies: safeNumber(row.replies),
    views: safeNumber(row.views),
    engagement: safeNumber(row.likes) + safeNumber(row.shares) + safeNumber(row.replies),
    author: safeText(row.author) || null,
    followers: safeNumber(row.author_followers),
    isVerified: Boolean(row.is_verified),
    insightReady: Boolean(row.insight_ready),
  }
}

function normalizeReputationRow(row) {
  return {
    id: safeText(row.review_id || row.id || `reputation-${Math.random()}`),
    source: 'reputation_crise',
    side: normalizedSideFromBrand(row.brand, 'brand'),
    family: 'reputation',
    platform: safeText(row.platform, 'Reputation'),
    brand: normalizedSideFromBrand(row.brand, 'brand') === 'competitor' ? 'Boulanger' : 'Fnac Darty',
    text: safeText(row.text),
    date: normalizeDate(row.date || row.created_at),
    sentiment: normalizeSentiment(row.sentiment),
    severity: safeText(row.severity).toLowerCase() || null,
    likes: safeNumber(row.likes),
    shares: safeNumber(row.shares || row.share_count),
    replies: safeNumber(row.replies || row.reply_count),
    views: safeNumber(row.views),
    engagement: safeNumber(row.likes) + safeNumber(row.shares || row.share_count) + safeNumber(row.replies || row.reply_count),
    ownerResponse: safeText(row.owner_response) || null,
    recommendedAction: safeText(row.recommended_action) || null,
    teamOwner: safeText(row.team_owner, 'A assigner'),
    businessImpact: safeText(row.business_impact) || null,
    urgencyLevel: safeText(row.urgency_level) || null,
    isActionable: Boolean(row.is_actionable),
    insightReady: Boolean(row.insight_ready) || Boolean(row.sentiment || row.recommended_action),
    author: safeText(row.author) || null,
    isVerified: Boolean(row.is_verified),
  }
}

function normalizeBenchmarkRow(row) {
  const side = row.target_brand_vs_competitor === 'Competitor'
    ? 'competitor'
    : row.target_brand_vs_competitor === 'Brand'
      ? 'brand'
      : normalizedSideFromBrand(row.entity_analyzed, 'brand')

  return {
    id: safeText(row.review_id || row.id || `benchmark-${Math.random()}`),
    source: 'benchmark_marche',
    side,
    family: 'benchmark',
    platform: safeText(row.platform, 'Benchmark'),
    brand: side === 'competitor' ? 'Boulanger' : 'Fnac Darty',
    text: safeText(row.text),
    date: normalizeDate(row.date || row.created_at),
    sentiment: normalizeSentiment(row.sentiment_detected || row.sentiment),
    topic: safeText(row.topic) || null,
    dimension: safeText(row.benchmark_dimension || row.topic, 'Autre'),
    businessImpact: safeText(row.business_impact) || null,
    urgencyLevel: safeText(row.urgency_level) || null,
    target: safeText(row.target_brand_vs_competitor) || null,
  }
}

function summarizeReviewScope(rows) {
  const ratedRows = rows.filter((row) => row.rating)
  const negativeRows = rows.filter((row) => row.sentiment === 'Negative')
  const positiveRows = rows.filter((row) => row.sentiment === 'Positive')
  const criticalRows = rows.filter((row) => severityRank(row.severity) <= 1)
  const storeGroups = groupBy(rows.filter((row) => row.storeCity || row.storeName), (row) => row.storeCity || row.storeName)

  const stores = Object.entries(storeGroups)
    .map(([name, storeRows]) => {
      const rated = storeRows.filter((row) => row.rating)
      const negatives = storeRows.filter((row) => row.sentiment === 'Negative').length
      return {
        name,
        count: storeRows.length,
        avgRating: rated.length ? (sumBy(rated, (row) => row.rating) / rated.length).toFixed(1) : '0.0',
        negativeRate: percentage(negatives, storeRows.length),
        criticalCount: storeRows.filter((row) => severityRank(row.severity) <= 1).length,
      }
    })
    .sort((left, right) => {
      if (right.negativeRate !== left.negativeRate) return right.negativeRate - left.negativeRate
      return right.count - left.count
    })

  return {
    total: rows.length,
    rated: ratedRows.length,
    avgRating: ratedRows.length ? (sumBy(ratedRows, (row) => row.rating) / ratedRows.length).toFixed(1) : '0.0',
    negativeRate: percentage(negativeRows.length, rows.length),
    positiveRate: percentage(positiveRows.length, rows.length),
    criticalRate: percentage(criticalRows.length, rows.length),
    topEvidence: topEvidence(negativeRows, 3, 60),
    stores,
  }
}

function buildCxFrictions(rows) {
  const grouped = {}

  rows
    .filter((row) => row.sentiment === 'Negative')
    .forEach((row) => {
      const label = row.painPoint || row.category
      if (!label) return

      if (!grouped[label]) {
        grouped[label] = {
          id: label,
          label,
          count: 0,
          severityMix: { critical: 0, high: 0, medium: 0, low: 0 },
          journey: {},
          cities: {},
          evidence: [],
        }
      }

      grouped[label].count += 1
      if (grouped[label].severityMix[row.severity] !== undefined) grouped[label].severityMix[row.severity] += 1
      if (row.journeyStep) grouped[label].journey[row.journeyStep] = (grouped[label].journey[row.journeyStep] || 0) + 1
      if (row.storeCity) grouped[label].cities[row.storeCity] = (grouped[label].cities[row.storeCity] || 0) + 1
      if (grouped[label].evidence.length < 3 && safeText(row.text).length > 40) {
        grouped[label].evidence.push(sliceQuote(row.text, 140))
      }
    })

  return Object.values(grouped)
    .map((item) => ({
      ...item,
      severity: dominantEntry(item.severityMix, 'medium'),
      journeyLabel: JOURNEY_LABELS[dominantEntry(item.journey, 'support')] || dominantEntry(item.journey, 'support'),
      cityLabel: dominantEntry(item.cities, 'Multi-sites'),
    }))
    .sort((left, right) => {
      const severityDelta = severityRank(left.severity) - severityRank(right.severity)
      if (severityDelta !== 0) return severityDelta
      return right.count - left.count
    })
}

function buildDelightPoints(rows) {
  const grouped = {}

  rows
    .filter((row) => row.sentiment === 'Positive')
    .forEach((row) => {
      const label = row.delightPoint || row.category
      if (!label) return
      if (!grouped[label]) grouped[label] = { label, count: 0, evidence: [] }
      grouped[label].count += 1
      if (grouped[label].evidence.length < 2 && safeText(row.text).length > 40) grouped[label].evidence.push(sliceQuote(row.text, 140))
    })

  return Object.values(grouped).sort((left, right) => right.count - left.count).slice(0, 6)
}

function buildJourneySteps(rows) {
  const grouped = {}

  rows.forEach((row) => {
    if (!row.journeyStep) return
    if (!grouped[row.journeyStep]) grouped[row.journeyStep] = { step: row.journeyStep, total: 0, negative: 0, critical: 0 }
    grouped[row.journeyStep].total += 1
    if (row.sentiment === 'Negative') grouped[row.journeyStep].negative += 1
    if (severityRank(row.severity) <= 1) grouped[row.journeyStep].critical += 1
  })

  return Object.values(grouped)
    .sort((left, right) => right.critical - left.critical || right.negative - left.negative || right.total - left.total)
    .map((row) => ({ ...row, label: JOURNEY_LABELS[row.step] || row.step }))
}

function buildActionItems(rows) {
  const grouped = {}

  rows
    .filter((row) => row.recommendedAction || row.isActionable)
    .forEach((row) => {
      const label = row.recommendedAction || row.painPoint || row.category
      if (!label) return

      if (!grouped[label]) {
        grouped[label] = {
          id: label,
          label,
          count: 0,
          severity: {},
          urgency: {},
          owners: {},
          impacts: {},
          categories: {},
          sides: {},
          rows: [],
        }
      }

      grouped[label].count += 1
      grouped[label].owners[row.teamOwner || 'A assigner'] = (grouped[label].owners[row.teamOwner || 'A assigner'] || 0) + 1
      grouped[label].categories[row.category || 'Autre'] = (grouped[label].categories[row.category || 'Autre'] || 0) + 1
      grouped[label].sides[row.side || 'brand'] = (grouped[label].sides[row.side || 'brand'] || 0) + 1
      if (row.businessImpact) grouped[label].impacts[row.businessImpact] = (grouped[label].impacts[row.businessImpact] || 0) + 1
      if (row.severity) grouped[label].severity[row.severity] = (grouped[label].severity[row.severity] || 0) + 1
      if (row.urgencyLevel) grouped[label].urgency[row.urgencyLevel] = (grouped[label].urgency[row.urgencyLevel] || 0) + 1
      grouped[label].rows.push(row)
    })

  const items = Object.values(grouped)
    .map((item) => {
      const severity = dominantEntry(item.severity, 'medium')
      const urgency = dominantEntry(item.urgency, severity)
      return {
        id: item.id,
        label: item.label,
        count: item.count,
        severity,
        urgency,
        owner: dominantEntry(item.owners, 'A assigner'),
        impact: dominantEntry(item.impacts, 'Impact a clarifier'),
        category: dominantEntry(item.categories, 'Autre'),
        side: dominantEntry(item.sides, 'brand'),
        now: severityRank(severity) <= 1 || severityRank(urgency) <= 1,
        proofs: topEvidence(item.rows, 2, 50),
      }
    })
    .sort((left, right) => {
      const severityDelta = severityRank(left.severity) - severityRank(right.severity)
      if (severityDelta !== 0) return severityDelta
      return right.count - left.count
    })

  return {
    items,
    now: items.filter((item) => item.now),
    later: items.filter((item) => !item.now),
    top3: items.slice(0, 3),
  }
}

function buildBattleModel(rows) {
  const grouped = {}

  rows.forEach((row) => {
    const dimension = row.dimension || 'Autre'
    if (!grouped[dimension]) {
      grouped[dimension] = {
        id: dimension,
        label: dimension,
        brandPositive: 0,
        brandNegative: 0,
        competitorPositive: 0,
        competitorNegative: 0,
        brandCount: 0,
        competitorCount: 0,
        topics: {},
        brandTopics: {},
        competitorTopics: {},
        brandRows: [],
        competitorRows: [],
      }
    }

    const bucket = grouped[dimension]
    if (row.topic) bucket.topics[row.topic] = (bucket.topics[row.topic] || 0) + 1

    if (row.side === 'competitor') {
      bucket.competitorCount += 1
      if (row.sentiment === 'Positive') bucket.competitorPositive += 1
      if (row.sentiment === 'Negative') bucket.competitorNegative += 1
      if (row.topic) bucket.competitorTopics[row.topic] = (bucket.competitorTopics[row.topic] || 0) + 1
      bucket.competitorRows.push(row)
      return
    }

    bucket.brandCount += 1
    if (row.sentiment === 'Positive') bucket.brandPositive += 1
    if (row.sentiment === 'Negative') bucket.brandNegative += 1
    if (row.topic) bucket.brandTopics[row.topic] = (bucket.brandTopics[row.topic] || 0) + 1
    bucket.brandRows.push(row)
  })

  const dimensions = Object.values(grouped)
    .map((row) => {
      const brandScore = row.brandPositive - row.brandNegative
      const competitorScore = row.competitorPositive - row.competitorNegative
      const winner = brandScore > competitorScore ? 'brand' : brandScore < competitorScore ? 'competitor' : 'tie'
      const brandProofs = topEvidence(row.brandRows, 2, 35)
      const competitorProofs = topEvidence(row.competitorRows, 2, 35)
      const mixedProofs = topEvidence([...row.brandRows, ...row.competitorRows], 2, 35)

      return {
        id: row.id,
        label: row.label,
        brandPositive: row.brandPositive,
        brandNegative: row.brandNegative,
        competitorPositive: row.competitorPositive,
        competitorNegative: row.competitorNegative,
        brandCount: row.brandCount,
        competitorCount: row.competitorCount,
        brandScore,
        competitorScore,
        delta: brandScore - competitorScore,
        winner,
        topTopic: dominantEntry(row.topics, row.label),
        brandTopTopic: dominantEntry(row.brandTopics, row.label),
        competitorTopTopic: dominantEntry(row.competitorTopics, row.label),
        brandProofs,
        competitorProofs,
        proofs: winner === 'brand' ? brandProofs : winner === 'competitor' ? competitorProofs : mixedProofs,
      }
    })
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))

  const brandMentions = rows.filter((row) => row.side === 'brand').length
  const competitorMentions = rows.filter((row) => row.side === 'competitor').length
  const brandPositiveRate = percentage(rows.filter((row) => row.side === 'brand' && row.sentiment === 'Positive').length, brandMentions)
  const competitorPositiveRate = percentage(rows.filter((row) => row.side === 'competitor' && row.sentiment === 'Positive').length, competitorMentions)
  const whiteSpaces = dimensions.filter((row) => Math.abs(row.delta) <= 1).slice(0, 4)
  const defend = dimensions.filter((row) => row.delta < 0).slice(0, 4)
  const attack = dimensions.filter((row) => row.delta > 0).slice(0, 4)

  return {
    dimensions,
    whiteSpaces,
    defend,
    attack,
    sovBrand: percentage(brandMentions, brandMentions + competitorMentions),
    sovCompetitor: percentage(competitorMentions, brandMentions + competitorMentions),
    sentimentDelta: brandPositiveRate - competitorPositiveRate,
    brandMentions,
    competitorMentions,
  }
}

function buildWarRoomModel({ socialBrandRows, socialCompetitorRows, reputationRows, brandReviewRows }) {
  const socialNegative = socialBrandRows.filter((row) => row.sentiment === 'Negative')
  const reputationNegative = reputationRows.filter((row) => row.side === 'brand' && row.sentiment === 'Negative')
  const reviewBacklog = brandReviewRows.filter((row) => severityRank(row.severity) <= 1 && !row.ownerResponse)
  const verifiedCritics = socialNegative.filter((row) => row.isVerified).length + reputationNegative.filter((row) => row.isVerified).length
  const socialCriticalPosts = sortByDateDesc(socialNegative).sort((left, right) => right.engagement - left.engagement).slice(0, 6)
  const competitorBuzz = sortByDateDesc(socialCompetitorRows).sort((left, right) => right.engagement - left.engagement).slice(0, 4)
  const reviewRiskRows = sortByDateDesc([...reputationNegative, ...reviewBacklog]).slice(0, 6)
  const crisisLevel = reviewBacklog.length > 5 || verifiedCritics > 3 || reputationNegative.length > 30
    ? 'critical'
    : reviewBacklog.length > 2 || verifiedCritics > 0
      ? 'high'
      : 'medium'

  const signals = [
    {
      id: 'social-traction',
      title: 'Traction negative sociale',
      severity: socialNegative.length > 20 ? 'high' : socialNegative.length > 8 ? 'medium' : 'low',
      value: `${socialNegative.length}`,
      note: 'mentions negatives sur les canaux sociaux',
    },
    {
      id: 'verified-critics',
      title: 'Profils a risque',
      severity: verifiedCritics > 2 ? 'critical' : verifiedCritics > 0 ? 'high' : 'low',
      value: `${verifiedCritics}`,
      note: 'auteurs verifies ou forte audience dans le flux critique',
    },
    {
      id: 'response-backlog',
      title: 'Backlog de reponse',
      severity: reviewBacklog.length > 4 ? 'critical' : reviewBacklog.length > 0 ? 'high' : 'low',
      value: `${reviewBacklog.length}`,
      note: 'avis critiques ou hauts sans owner_response',
    },
    {
      id: 'review-pressure',
      title: 'Pression reputation',
      severity: reputationNegative.length > 25 ? 'critical' : reputationNegative.length > 10 ? 'high' : 'medium',
      value: `${percentage(reputationNegative.length, reputationRows.filter((row) => row.side === 'brand').length)}%`,
      note: 'part negative de la base reputation',
    },
  ]

  return {
    crisisLevel,
    signals,
    social: {
      brand: socialBrandRows,
      competitor: socialCompetitorRows,
      total: socialBrandRows.length,
      engagement: sumBy(socialBrandRows, (row) => row.engagement),
      verifiedAuthors: socialBrandRows.filter((row) => row.isVerified).length,
      topRiskPosts: socialCriticalPosts,
      competitorBuzz,
      volumeSeries: createSentimentSeries(socialBrandRows, 21),
    },
    reviewReputation: {
      rows: reputationRows.filter((row) => row.side === 'brand'),
      negativeRows: reputationNegative,
      backlog: reviewBacklog,
      topRiskRows: reviewRiskRows,
      volumeSeries: createSentimentSeries(reputationRows.filter((row) => row.side === 'brand'), 21),
      platforms: Object.entries(groupBy(reputationRows.filter((row) => row.side === 'brand'), (row) => row.platform))
        .map(([name, platformRows]) => ({
          name,
          value: platformRows.length,
          negativeRate: percentage(platformRows.filter((row) => row.sentiment === 'Negative').length, platformRows.length),
        }))
        .sort((left, right) => right.value - left.value),
    },
  }
}

function buildExecutiveSnapshot({ warRoomModel, battleModel, brandCxModel, actionModel, coverageModel }) {
  const topAction = actionModel.top3[0]
  const topFriction = brandCxModel.frictions[0]
  const weakestBattle = battleModel.defend[0]
  const strongestBattle = battleModel.attack[0]
  const brandScore = Math.max(0, Math.min(100, Math.round((safeNumber(brandCxModel.summary.avgRating) * 16) + (100 - brandCxModel.summary.negativeRate))))

  const whatHappens = warRoomModel.crisisLevel === 'critical'
    ? `La marque subit une tension reputationnelle elevee, alimentee par ${warRoomModel.signals[0].value} signaux sociaux negatifs et un backlog critique de ${warRoomModel.signals[2].value} avis sans reponse.`
    : `La marque reste pilotable, mais la pression se concentre sur ${topFriction ? topFriction.label.toLowerCase() : 'les irritants clients'} et sur ${weakestBattle ? weakestBattle.label.toLowerCase() : 'quelques dimensions concurrentielles'}.`

  const whyItMatters = weakestBattle
    ? `Boulanger prend l'avantage sur ${weakestBattle.label} tandis que Fnac Darty garde de la force sur ${strongestBattle ? strongestBattle.label : 'ses dimensions coeur'}. L'enjeu n'est pas seulement d'eteindre le bruit, mais de proteger le territoire de marque.`
    : `Le niveau de risque principal reste operationnel: les irritants clients detruisent plus vite la perception que les campagnes ne la reconstruisent.`

  const whatNow = topAction
    ? `Priorite immediate: ${topAction.label.toLowerCase()} avec un owner dominant cote ${topAction.owner.toLowerCase()} et ${topAction.count} preuves deja visibles dans les donnees.`
    : `Priorite immediate: renforcer l'enrichissement IA et la couverture des donnees pour fiabiliser les arbitrages.`

  return {
    editorial: { whatHappens, whyItMatters, whatNow },
    brandHealth: {
      score: brandScore,
      avgRating: brandCxModel.summary.avgRating,
      negativeRate: brandCxModel.summary.negativeRate,
      reviewVolume: brandCxModel.summary.total,
    },
    crisis: {
      level: warRoomModel.crisisLevel,
      signalCount: warRoomModel.signals.filter((signal) => severityRank(signal.severity) <= 1).length,
      backlog: warRoomModel.reviewReputation.backlog.length,
      riskyAuthors: warRoomModel.signals[1].value,
    },
    market: {
      sovBrand: battleModel.sovBrand,
      sovCompetitor: battleModel.sovCompetitor,
      sentimentDelta: battleModel.sentimentDelta,
      weakestDimension: weakestBattle?.label || 'A clarifier',
    },
    frictions: brandCxModel.frictions.slice(0, 3),
    actions: actionModel.top3,
    freshness: coverageModel,
  }
}

function inferOwnerFromStoreIssue(issue) {
  const normalized = normalizeSearchText(issue)
  if (!normalized) return 'Direction reseau'
  if (normalized.includes('sav') || normalized.includes('garantie') || normalized.includes('retour') || normalized.includes('support')) {
    return 'Service Client / SAV'
  }
  if (normalized.includes('livraison') || normalized.includes('delai') || normalized.includes('transport')) {
    return 'Operations / Logistique'
  }
  if (normalized.includes('vendeur') || normalized.includes('conseil') || normalized.includes('accueil') || normalized.includes('magasin')) {
    return 'Retail Operations'
  }
  if (normalized.includes('prix') || normalized.includes('promo') || normalized.includes('tarif')) {
    return 'Pricing / Merchandising'
  }
  return 'Direction reseau'
}

function buildStoreActivation(store) {
  if (store.negativeBacklog > 2) {
    return {
      label: `Sprint de reponse locale sur ${store.store}`,
      owner: 'Direction reseau',
      impact: 'Faire baisser le bruit visible sur Google Reviews',
      urgency: 'critical',
    }
  }

  if (store.avgRating !== null && store.avgRating < 3.6) {
    return {
      label: `Plan de recovery manager sur ${store.store}`,
      owner: inferOwnerFromStoreIssue(store.topIssue),
      impact: 'Remonter la note magasin et traiter l irritant dominant',
      urgency: 'high',
    }
  }

  if (store.reviewCount < 6 && store.avgRating !== null && store.avgRating >= 4.2) {
    return {
      label: `Booster la sollicitation d avis positifs sur ${store.store}`,
      owner: 'Marketing local',
      impact: 'Faire emerger un magasin vitrine dans le reseau',
      urgency: 'medium',
    }
  }

  return {
    label: `Stabiliser ${store.store} sur ${store.topIssue.toLowerCase()}`,
    owner: inferOwnerFromStoreIssue(store.topIssue),
    impact: 'Eviter la degradation locale de l experience',
    urgency: store.negRate >= 35 ? 'high' : 'medium',
  }
}

function buildStoreNetwork(rows, side) {
  const googleReviewRows = rows.filter((row) => row.platform === 'Google Reviews' && row.side === side)
  const grouped = {}

  googleReviewRows.forEach((row) => {
    const city = inferStoreCity(row)
    const storeName = safeText(row.storeName || row.location, city || 'Magasin')
    const coordinates = inferStoreCoordinates(row, city)

    const key = `${storeName}__${city || 'Ville inconnue'}`
    if (!grouped[key]) {
      grouped[key] = {
        id: key,
        storeKey: key,
        store: storeName,
        side,
        city: city || 'Ville inconnue',
        coordinates,
        address: row.storeAddress || null,
        reviewCount: 0,
        positive: 0,
        negative: 0,
        neutral: 0,
        ratings: [],
        categories: {},
        painPoints: {},
        owners: {},
        rows: [],
        negativeBacklog: 0,
        recentDates: [],
      }
    }

    const bucket = grouped[key]
    if (!bucket.coordinates && coordinates) bucket.coordinates = coordinates
    bucket.reviewCount += 1
    if (row.sentiment === 'Positive') bucket.positive += 1
    if (row.sentiment === 'Negative') bucket.negative += 1
    if (row.sentiment === 'Neutral') bucket.neutral += 1
    if (row.rating) bucket.ratings.push(Number(row.rating))
    if (row.category) bucket.categories[row.category] = (bucket.categories[row.category] || 0) + 1
    if (row.painPoint) bucket.painPoints[row.painPoint] = (bucket.painPoints[row.painPoint] || 0) + 1
    if (row.teamOwner) bucket.owners[row.teamOwner] = (bucket.owners[row.teamOwner] || 0) + 1
    if (row.sentiment === 'Negative' && !row.ownerResponse) bucket.negativeBacklog += 1
    if (row.date) bucket.recentDates.push(row.date)
    bucket.rows.push(row)
  })

  const stores = Object.values(grouped)
    .map((store) => {
      const avgRating = store.ratings.length
        ? Number((store.ratings.reduce((sum, rating) => sum + rating, 0) / store.ratings.length).toFixed(1))
        : null
      const negRate = percentage(store.negative, store.reviewCount)
      const responseRate = percentage(store.negative - store.negativeBacklog, store.negative || 0)
      const topIssue = dominantEntry({ ...store.painPoints, ...store.categories }, 'A clarifier')
      const riskScore = Math.max(
        0,
        Math.min(
          100,
          Math.round((negRate * 0.65) + ((avgRating !== null ? (5 - avgRating) * 15 : 20)) + (store.negativeBacklog * 4))
        )
      )

      const negativeRows = store.rows.filter((row) => row.sentiment === 'Negative')
      const recentEvidence = topEvidence(negativeRows.length ? negativeRows : store.rows, 3, 40)

      return {
        ...store,
        brand: side === 'competitor' ? 'Boulanger' : 'Fnac Darty',
        avgRating,
        negRate,
        responseRate,
        topIssue,
        owner: dominantEntry(store.owners, inferOwnerFromStoreIssue(topIssue)),
        riskScore,
        latestReviewAt: sortByDateDesc(store.rows)[0]?.date || null,
        evidence: recentEvidence,
        activation: side === 'brand'
          ? buildStoreActivation({
            ...store,
            avgRating,
            negRate,
            reviewCount: store.reviewCount,
            topIssue,
            negativeBacklog: store.negativeBacklog,
          })
          : null,
      }
    })
    .sort((left, right) => right.riskScore - left.riskScore || right.reviewCount - left.reviewCount)

  const cityMap = {}
  stores.forEach((store) => {
    if (!cityMap[store.city]) cityMap[store.city] = { city: store.city, stores: 0, reviews: 0, avgRisk: 0, negativeRate: 0 }
    cityMap[store.city].stores += 1
    cityMap[store.city].reviews += store.reviewCount
    cityMap[store.city].avgRisk += store.riskScore
    cityMap[store.city].negativeRate += store.negRate
  })

  const cityHotspots = Object.values(cityMap)
    .map((city) => ({
      ...city,
      avgRisk: Math.round(city.avgRisk / city.stores),
      negativeRate: Math.round(city.negativeRate / city.stores),
    }))
    .sort((left, right) => right.avgRisk - left.avgRisk || right.reviews - left.reviews)

  const ratedStores = stores.filter((store) => store.avgRating !== null)
  const networkRating = ratedStores.length
    ? Number((ratedStores.reduce((sum, store) => sum + store.avgRating, 0) / ratedStores.length).toFixed(1))
    : null

  return {
    side,
    label: side === 'competitor' ? 'Boulanger' : 'Fnac Darty',
    googleReviewRows,
    stores,
    cityHotspots,
    summary: {
      coveredStores: stores.length,
      mappedStores: stores.filter((store) => Boolean(store.coordinates)).length,
      coveredCities: new Set(stores.map((store) => store.city)).size,
      networkRating,
      networkNegativeRate: percentage(sumBy(stores, (store) => store.negative), sumBy(stores, (store) => store.reviewCount)),
      reviewBacklog: sumBy(stores, (store) => store.negativeBacklog),
      totalReviews: googleReviewRows.length,
      highestRisk: stores[0] || null,
    },
  }
}

function buildStoreModel(brandRows, competitorRows) {
  const brandNetwork = buildStoreNetwork(brandRows, 'brand')
  const competitorNetwork = buildStoreNetwork(competitorRows, 'competitor')

  const atRiskStores = brandNetwork.stores.filter((store) => store.riskScore >= 55)
  const championStores = brandNetwork.stores
    .filter((store) => store.avgRating !== null && store.avgRating >= 4.2 && store.negRate <= 15)
    .sort((left, right) => right.avgRating - left.avgRating || right.reviewCount - left.reviewCount)

  const activations = brandNetwork.stores
    .slice(0, 6)
    .map((store) => ({
      id: `store-${store.id}`,
      label: store.activation.label,
      owner: store.activation.owner,
      severity: store.activation.urgency === 'critical' ? 'critical' : store.activation.urgency === 'high' ? 'high' : 'medium',
      impact: store.activation.impact,
      count: store.reviewCount,
      side: 'brand',
      proofs: store.evidence,
      store: store.store,
      city: store.city,
      topIssue: store.topIssue,
      category: 'Magasins',
    }))

  const comparisonMap = {}

  brandNetwork.cityHotspots.forEach((city) => {
    if (!comparisonMap[city.city]) comparisonMap[city.city] = { city: city.city }
    comparisonMap[city.city].brand = city
  })

  competitorNetwork.cityHotspots.forEach((city) => {
    if (!comparisonMap[city.city]) comparisonMap[city.city] = { city: city.city }
    comparisonMap[city.city].competitor = city
  })

  const cityComparison = Object.values(comparisonMap)
    .map((entry) => {
      const brandCity = entry.brand || null
      const competitorCity = entry.competitor || null
      const brandStores = brandNetwork.stores.filter((store) => store.city === entry.city)
      const competitorStores = competitorNetwork.stores.filter((store) => store.city === entry.city)
      const brandRated = brandStores.filter((store) => store.avgRating !== null)
      const competitorRated = competitorStores.filter((store) => store.avgRating !== null)
      const brandRating = brandRated.length
        ? Number((brandRated.reduce((sum, store) => sum + store.avgRating, 0) / brandRated.length).toFixed(1))
        : null
      const competitorRating = competitorRated.length
        ? Number((competitorRated.reduce((sum, store) => sum + store.avgRating, 0) / competitorRated.length).toFixed(1))
        : null
      const brandNegRate = brandCity?.negativeRate ?? null
      const competitorNegRate = competitorCity?.negativeRate ?? null
      const brandScore = (brandRating !== null ? brandRating * 15 : 0) + (brandNegRate !== null ? (100 - brandNegRate) : 0)
      const competitorScore = (competitorRating !== null ? competitorRating * 15 : 0) + (competitorNegRate !== null ? (100 - competitorNegRate) : 0)
      const delta = Math.round(brandScore - competitorScore)

      return {
        city: entry.city,
        brandStores: brandStores.length,
        competitorStores: competitorStores.length,
        brandRating,
        competitorRating,
        brandNegRate,
        competitorNegRate,
        delta,
        leader: delta > 5 ? 'brand' : delta < -5 ? 'competitor' : 'tie',
      }
    })
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))

  const defendCities = cityComparison.filter((city) => city.leader === 'competitor').slice(0, 5)
  const leadCities = cityComparison.filter((city) => city.leader === 'brand').slice(0, 5)
  const overlapCities = cityComparison.filter((city) => city.brandStores > 0 && city.competitorStores > 0)

  return {
    stores: brandNetwork.stores,
    network: brandNetwork,
    competitorNetwork,
    cityHotspots: brandNetwork.cityHotspots,
    atRiskStores,
    championStores,
    activations,
    cityComparison,
    defendCities,
    leadCities,
    summary: {
      ...brandNetwork.summary,
      competitorCoveredStores: competitorNetwork.summary.coveredStores,
      competitorMappedStores: competitorNetwork.summary.mappedStores,
      competitorNetworkRating: competitorNetwork.summary.networkRating,
      overlapCities: overlapCities.length,
      strongestCity: leadCities[0] || null,
      weakestCity: defendCities[0] || null,
    },
  }
}

function buildCoverageModel({ tables, allRows }) {
  const latestAt = allRows
    .map((row) => row.date)
    .filter(Boolean)
    .sort((left, right) => right.localeCompare(left))[0] || null

  const aiEligible = allRows.filter((row) => row.family !== 'social').length
  const aiEnriched = allRows.filter((row) => row.insightReady || row.sentiment || row.businessImpact || row.recommendedAction).length

  return {
    latestAt,
    totalRows: allRows.length,
    aiCoverage: percentage(aiEnriched, aiEligible || allRows.length),
    sources: Object.entries(tables).map(([key, value]) => ({
      key,
      count: value.length,
      latestAt: value
        .map((row) => normalizeDate(row.date || row.created_at))
        .filter(Boolean)
        .sort((left, right) => right.localeCompare(left))[0] || null,
    })),
  }
}

export function useStrategicDashboardData() {
  const [state, setState] = useState({ loading: true, error: null, tables: {} })
  const { applyFilters } = useFilters()

  useEffect(() => {
    let active = true

    async function load() {
      setState((current) => ({ ...current, loading: true, error: null }))

      try {
        if (!strategicTablesPromise) {
          strategicTablesPromise = Promise.all(
            SOURCE_CONFIG.map((source) =>
              fetchAll(source.table, '*', { order: source.order, limit: source.limit }).then((response) => [source.key, response.data || []])
            )
          )
        }

        const results = strategicTablesCache || await strategicTablesPromise
        if (!strategicTablesCache) strategicTablesCache = results

        if (!active) return

        setState({
          loading: false,
          error: null,
          tables: Object.fromEntries(results),
        })
      } catch (error) {
        strategicTablesPromise = null
        if (!active) return
        setState({ loading: false, error: error.message, tables: {} })
      }
    }

    load()

    return () => {
      active = false
    }
  }, [])

  const normalized = useMemo(() => {
    const tables = state.tables || {}

    const reviewBrandRows = sortByDateDesc([
      ...(tables.cx || []).map((row) => normalizeReviewRow(row, 'voix_client_cx', 'brand')),
      ...(tables.brandReviews || []).map((row) => normalizeReviewRow(row, 'scraping_brand', 'brand')),
    ])

    const reviewCompetitorRows = sortByDateDesc(
      (tables.competitorReviews || []).map((row) => normalizeReviewRow(row, 'scraping_competitor', 'competitor'))
    )

    const reputationRows = sortByDateDesc((tables.reputation || []).map(normalizeReputationRow))
    const benchmarkRows = sortByDateDesc((tables.benchmark || []).map(normalizeBenchmarkRow))
    const socialBrandRows = sortByDateDesc((tables.socialBrand || []).map((row) => normalizeSocialRow(row, 'brand')))
    const socialCompetitorRows = sortByDateDesc((tables.socialCompetitor || []).map((row) => normalizeSocialRow(row, 'competitor')))

    return {
      tables,
      reviewBrandRows,
      reviewCompetitorRows,
      reputationRows,
      benchmarkRows,
      socialBrandRows,
      socialCompetitorRows,
      allRows: [
        ...reviewBrandRows,
        ...reviewCompetitorRows,
        ...reputationRows,
        ...benchmarkRows,
        ...socialBrandRows,
        ...socialCompetitorRows,
      ],
    }
  }, [state.tables])

  const filtered = useMemo(() => ({
    reviewBrandRows: applyFilters(normalized.reviewBrandRows),
    reviewCompetitorRows: applyFilters(normalized.reviewCompetitorRows),
    reputationRows: applyFilters(normalized.reputationRows),
    benchmarkRows: applyFilters(normalized.benchmarkRows),
    socialBrandRows: applyFilters(normalized.socialBrandRows),
    socialCompetitorRows: applyFilters(normalized.socialCompetitorRows),
  }), [normalized, applyFilters])

  const brandCxModel = useMemo(() => ({
    summary: summarizeReviewScope(filtered.reviewBrandRows),
    frictions: buildCxFrictions(filtered.reviewBrandRows),
    delights: buildDelightPoints(filtered.reviewBrandRows),
    journey: buildJourneySteps(filtered.reviewBrandRows),
    recentQuotes: topEvidence(filtered.reviewBrandRows, 5, 50),
  }), [filtered.reviewBrandRows])

  const competitorCxModel = useMemo(() => ({
    summary: summarizeReviewScope(filtered.reviewCompetitorRows),
    frictions: buildCxFrictions(filtered.reviewCompetitorRows),
    delights: buildDelightPoints(filtered.reviewCompetitorRows),
    journey: buildJourneySteps(filtered.reviewCompetitorRows),
    recentQuotes: topEvidence(filtered.reviewCompetitorRows, 5, 50),
  }), [filtered.reviewCompetitorRows])

  const actionRows = useMemo(
    () => [...filtered.reviewBrandRows, ...filtered.reviewCompetitorRows, ...filtered.reputationRows],
    [filtered.reviewBrandRows, filtered.reviewCompetitorRows, filtered.reputationRows]
  )

  const actionModel = useMemo(() => buildActionItems(actionRows), [actionRows])
  const battleModel = useMemo(() => buildBattleModel(filtered.benchmarkRows), [filtered.benchmarkRows])
  const storeModelAllTime = useMemo(
    () => buildStoreModel(normalized.reviewBrandRows, normalized.reviewCompetitorRows),
    [normalized.reviewBrandRows, normalized.reviewCompetitorRows]
  )
  const storeModel = useMemo(
    () => buildStoreModel(filtered.reviewBrandRows, filtered.reviewCompetitorRows),
    [filtered.reviewBrandRows, filtered.reviewCompetitorRows]
  )
  const warRoomModel = useMemo(
    () => buildWarRoomModel({
      socialBrandRows: filtered.socialBrandRows,
      socialCompetitorRows: filtered.socialCompetitorRows,
      reputationRows: filtered.reputationRows,
      brandReviewRows: filtered.reviewBrandRows,
    }),
    [filtered.socialBrandRows, filtered.socialCompetitorRows, filtered.reputationRows, filtered.reviewBrandRows]
  )

  const coverageModel = useMemo(
    () => buildCoverageModel({ tables: normalized.tables, allRows: normalized.allRows }),
    [normalized.tables, normalized.allRows]
  )

  const executiveSnapshot = useMemo(
    () => buildExecutiveSnapshot({ warRoomModel, battleModel, brandCxModel, actionModel, coverageModel }),
    [warRoomModel, battleModel, brandCxModel, actionModel, coverageModel]
  )

  return {
    loading: state.loading,
    error: state.error,
    raw: normalized,
    filtered,
    executiveSnapshot,
    crisisSignals: warRoomModel.signals,
    battleDimensions: battleModel.dimensions,
    cxFrictions: brandCxModel.frictions,
    actionItems: actionModel.items,
    warRoomModel,
    battleModel,
    cxModel: {
      brand: brandCxModel,
      competitor: competitorCxModel,
    },
    actionModel,
    coverageModel,
    storeModelAllTime,
    storeModel,
  }
}
