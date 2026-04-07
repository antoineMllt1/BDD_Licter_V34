import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

config({ path: path.join(__dirname, '..', '..', '.env') })
config({ path: path.join(__dirname, '..', '.env'), override: true })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
)

const TABLES = {
  scraping_brand: {
    select: 'id,review_id,text,platform,brand,sentiment,category,subcategory,severity,pain_point,delight_point,customer_journey_step,issue_type,topic_confidence,is_actionable,recommended_action,team_owner,insight_ready',
  },
  scraping_competitor: {
    select: 'id,review_id,text,platform,brand,sentiment,category,subcategory,severity,pain_point,delight_point,customer_journey_step,issue_type,topic_confidence,is_actionable,recommended_action,team_owner,insight_ready',
  },
  voix_client_cx: {
    select: 'id,review_id,text,platform,brand,sentiment,category,subcategory,severity,pain_point,delight_point,customer_journey_step,issue_type,topic_confidence,is_actionable,recommended_action,team_owner,insight_ready',
  },
  reputation_crise: {
    select: 'id,review_id,text,platform,brand,sentiment,category,subcategory,severity,pain_point,delight_point,customer_journey_step,issue_type,topic_confidence,is_actionable,recommended_action,team_owner,insight_ready',
  },
  social_mentions: {
    select: 'id,review_id,text,platform,brand,sentiment,category,severity,pain_point,delight_point,topic,topic_confidence,is_actionable,recommended_action,team_owner,insight_ready',
  },
  social_mentions_competitor: {
    select: 'id,review_id,text,platform,brand,sentiment,category,severity,pain_point,delight_point,topic,topic_confidence,is_actionable,recommended_action,team_owner,insight_ready',
  },
  benchmark_marche: {
    select: 'id,review_id,text,platform,brand,entity_analyzed,target_brand_vs_competitor,sentiment_detected,topic,topic_confidence,urgency_level,business_impact,insight_ready',
  },
}

const REVIEW_LIKE = new Set(['scraping_brand', 'scraping_competitor', 'voix_client_cx', 'reputation_crise'])
const SOCIAL_LIKE = new Set(['social_mentions', 'social_mentions_competitor'])
const SENTIMENT_VALUES = new Set(['Positive', 'Negative', 'Neutral'])
const CATEGORY_VALUES = new Set([
  'SAV',
  'Livraison',
  'Retour/remboursement',
  'Stock/disponibilit\u00e9',
  'Accueil magasin',
  'Conseil vendeur',
  'Qualit\u00e9 produit',
  'Prix',
  'Site web/application',
  'Installation/montage',
  'Programme de fid\u00e9lit\u00e9',
  'Autre',
])
const SEVERITY_VALUES = new Set(['low', 'medium', 'high', 'critical'])
const JOURNEY_VALUES = new Set(['pre_purchase', 'purchase', 'delivery', 'post_purchase', 'support'])
const ISSUE_TYPE_VALUES = new Set(['product', 'service', 'logistics', 'communication', 'pricing', 'digital_experience'])
const TEAM_OWNER_VALUES = new Set(['retail_ops', 'ecommerce', 'customer_support', 'logistics', 'product', 'marketing', 'crm', 'unknown'])

const CATEGORY_SUMMARIES = {
  SAV: 'Probleme SAV',
  Livraison: 'Probleme de livraison',
  'Retour/remboursement': 'Retour ou remboursement',
  'Stock/disponibilit\u00e9': 'Disponibilite produit',
  'Accueil magasin': 'Experience en magasin',
  'Conseil vendeur': 'Conseil vendeur',
  'Qualit\u00e9 produit': 'Qualite produit',
  Prix: 'Perception prix',
  'Site web/application': 'Parcours digital',
  'Installation/montage': 'Installation ou montage',
  'Programme de fid\u00e9lit\u00e9': 'Programme de fidelite',
  Autre: 'Signal client',
}

function parseArgs(argv) {
  const options = {
    tables: Object.keys(TABLES),
    limitPerTable: null,
    dryRun: false,
    topK: 7,
    concurrency: 10,
    preview: 3,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]
    if (arg === '--tables' && next) {
      options.tables = next.split(',').map((value) => value.trim()).filter(Boolean)
      index += 1
    } else if (arg === '--limit-per-table' && next) {
      options.limitPerTable = Number(next)
      index += 1
    } else if (arg === '--top-k' && next) {
      options.topK = Math.max(3, Number(next) || 7)
      index += 1
    } else if (arg === '--concurrency' && next) {
      options.concurrency = Math.max(1, Number(next) || 10)
      index += 1
    } else if (arg === '--preview' && next) {
      options.preview = Math.max(0, Number(next) || 0)
      index += 1
    } else if (arg === '--dry-run') {
      options.dryRun = true
    }
  }

  return options
}

function asText(value) {
  if (value === null || value === undefined) return ''
  const text = String(value).trim()
  if (!text) return ''
  if (['null', 'undefined', 'nan', 'n/a'].includes(text.toLowerCase())) return ''
  return text
}

function asBool(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.toLowerCase() === 'true'
  return Boolean(value)
}

function safeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function compactText(value, maxLength = 160) {
  const text = asText(value).replace(/\s+/g, ' ').trim()
  if (!text) return ''
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 3).trim()}...`
}

function normalizeText(value) {
  return asText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function normalizeKey(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function clampConfidence(value, fallback = 0) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(0.98, Math.max(0.05, Number(number.toFixed(2))))
}

function sentenceFromText(text, maxLength = 120) {
  const cleaned = compactText(text, 240)
  if (!cleaned) return ''
  const firstSentence = cleaned.split(/[.!?]/)[0].trim()
  if (!firstSentence) return ''
  return compactText(firstSentence, maxLength)
}

function matchesAny(value, patterns) {
  return patterns.some((pattern) => value.includes(pattern))
}

function canonicalSentiment(value, text = '') {
  const key = `${normalizeKey(value)} ${normalizeKey(text)}`.trim()
  if (!key) return null
  if (matchesAny(key, ['neutral', 'neutre', 'ni bon ni mauvais', 'pas fou mais ca va', 'correct', 'sans plus', 'mitige', 'pourquoi pas'])) return 'Neutral'
  if (matchesAny(key, ['negative', 'negatif', 'neg', 'decu', 'mauvais', 'nul', 'honte', 'arnaque', 'probleme', 'retard', 'remboursement'])) return 'Negative'
  if (matchesAny(key, ['positive', 'positif', 'satisfait', 'parfait', 'excellent', 'super', 'top', 'merci', 'bravo'])) return 'Positive'
  return 'Neutral'
}

function canonicalCategory(value, text = '') {
  const key = `${normalizeKey(value)} ${normalizeKey(text)}`.trim()
  if (!key) return null
  if (matchesAny(key, ['sav', 'service apres vente', 'garantie', 'reparation'])) return 'SAV'
  if (matchesAny(key, ['livraison', 'livrer', 'colis', 'transporteur', 'commande', 'expedition', 'delai de livraison'])) return 'Livraison'
  if (matchesAny(key, ['retour', 'rembourse', 'annulation', 'avoir'])) return 'Retour/remboursement'
  if (matchesAny(key, ['stock', 'disponib', 'rupture'])) return 'Stock/disponibilit\u00e9'
  if (matchesAny(key, ['accueil magasin', 'accueil', 'caiss', 'file attente', 'magasin'])) return 'Accueil magasin'
  if (matchesAny(key, ['conseil vendeur', 'vendeur', 'vendeuse', 'conseil', 'commercial'])) return 'Conseil vendeur'
  if (matchesAny(key, ['qualite produit', 'defaut', 'casse', 'mauvaise qualite', 'produit defectueux'])) return 'Qualit\u00e9 produit'
  if (matchesAny(key, ['prix', 'tarif', 'cher', 'promotion', 'promo', 'reduction'])) return 'Prix'
  if (matchesAny(key, ['site web', 'application', 'appli', 'web', 'compte', 'connexion', 'paiement', 'panier'])) return 'Site web/application'
  if (matchesAny(key, ['installation', 'montage', 'pose', 'assemblage'])) return 'Installation/montage'
  if (matchesAny(key, ['fidelite', 'cagnotte', 'points', 'carte fnac', 'parrainage'])) return 'Programme de fid\u00e9lit\u00e9'
  if (matchesAny(key, ['image de marque', 'reseaux sociaux', 'social', 'communication', 'buzz', 'twitter', 'facebook', 'tiktok', 'reddit'])) return 'Autre'
  return null
}

function canonicalSeverity(value, sentiment = null, text = '') {
  const valueKey = normalizeKey(value)
  if (SEVERITY_VALUES.has(valueKey)) return valueKey
  if (matchesAny(valueKey, ['critique', 'crise'])) return 'critical'
  if (matchesAny(valueKey, ['eleve', 'urgent'])) return 'high'
  if (matchesAny(valueKey, ['moyen', 'moyenne'])) return 'medium'
  if (matchesAny(valueKey, ['faible', 'mineur'])) return 'low'
  if (sentiment !== 'Negative') return 'low'

  const textKey = normalizeKey(text)
  if (matchesAny(textKey, ['arnaque', 'scandale', 'escroquerie', 'inadmissible'])) return 'critical'
  if (matchesAny(textKey, ['catastroph', 'inacceptable', 'jamais plus', 'honte', 'urgent'])) return 'high'
  return 'medium'
}

function inferJourney(category, text = '') {
  const key = normalizeKey(text)
  if (matchesAny(key, ['livraison', 'transporteur', 'colis', 'commande'])) return 'delivery'
  if (matchesAny(key, ['retour', 'rembourse', 'sav', 'garantie', 'panne', 'reparation', 'support'])) return 'support'
  if (matchesAny(key, ['site', 'appli', 'panier', 'prix', 'stock', 'disponib'])) return 'pre_purchase'

  const map = {
    SAV: 'support',
    Livraison: 'delivery',
    'Retour/remboursement': 'post_purchase',
    'Stock/disponibilit\u00e9': 'pre_purchase',
    'Accueil magasin': 'purchase',
    'Conseil vendeur': 'purchase',
    'Qualit\u00e9 produit': 'post_purchase',
    Prix: 'pre_purchase',
    'Site web/application': 'purchase',
    'Installation/montage': 'post_purchase',
    'Programme de fid\u00e9lit\u00e9': 'post_purchase',
    Autre: 'purchase',
  }

  return map[category] || 'purchase'
}

function canonicalJourney(value, category, text = '') {
  const key = normalizeKey(value)
  if (JOURNEY_VALUES.has(key)) return key
  if (key === 'in store' || key === 'in_store') return 'purchase'
  return inferJourney(category, text)
}

function inferIssueType(category, text = '') {
  const key = normalizeKey(text)
  if (matchesAny(key, ['site', 'appli', 'web', 'bug', 'connexion', 'panier', 'paiement'])) return 'digital_experience'
  if (matchesAny(key, ['livraison', 'transporteur', 'commande', 'colis'])) return 'logistics'
  if (matchesAny(key, ['prix', 'tarif', 'promo', 'promotion'])) return 'pricing'

  const map = {
    SAV: 'service',
    Livraison: 'logistics',
    'Retour/remboursement': 'service',
    'Stock/disponibilit\u00e9': 'service',
    'Accueil magasin': 'service',
    'Conseil vendeur': 'service',
    'Qualit\u00e9 produit': 'product',
    Prix: 'pricing',
    'Site web/application': 'digital_experience',
    'Installation/montage': 'service',
    'Programme de fid\u00e9lit\u00e9': 'communication',
    Autre: 'communication',
  }

  return map[category] || 'communication'
}

function canonicalIssueType(value, category, text = '') {
  const key = normalizeKey(value)
  if (ISSUE_TYPE_VALUES.has(key)) return key
  if (key.includes('pricing')) return 'pricing'
  if (key.includes('digital')) return 'digital_experience'
  if (key.includes('logistics')) return 'logistics'
  if (key.includes('product')) return 'product'
  if (key.includes('service') || key.includes('stock')) return category === 'Stock/disponibilit\u00e9' ? 'service' : 'service'
  if (key.includes('communication')) return 'communication'
  return inferIssueType(category, text)
}

function inferOwner(category, issueType) {
  if (issueType === 'digital_experience') return 'ecommerce'
  if (issueType === 'logistics') return 'logistics'
  if (category === 'Programme de fid\u00e9lit\u00e9') return 'crm'
  if (category === 'Prix') return 'marketing'
  if (category === 'Qualit\u00e9 produit') return 'product'
  if (category === 'Accueil magasin' || category === 'Conseil vendeur') return 'retail_ops'
  if (category === 'SAV' || category === 'Retour/remboursement') return 'customer_support'
  return 'unknown'
}

function canonicalTeamOwner(value, category, issueType) {
  const key = normalizeKey(value)
  if (TEAM_OWNER_VALUES.has(key)) return key
  if (key.includes('ecommerce') || key.includes('digital')) return 'ecommerce'
  if (key.includes('logistics')) return 'logistics'
  if (key.includes('customer support')) return 'customer_support'
  if (key.includes('retail')) return 'retail_ops'
  if (key.includes('marketing')) return 'marketing'
  if (key.includes('product')) return 'product'
  if (key.includes('crm') || key.includes('fidel')) return 'crm'
  return inferOwner(category, issueType)
}

function inferActionFromCategory(category, sentiment, issueType) {
  if (sentiment === 'Positive') return 'Capitaliser sur ce point fort dans la communication et le parcours'

  const map = {
    SAV: 'Renforcer le traitement SAV et clarifier les delais de resolution',
    Livraison: 'Corriger le suivi des commandes et la communication transport',
    'Retour/remboursement': 'Fluidifier le process de retour et le remboursement client',
    'Stock/disponibilit\u00e9': 'Mieux synchroniser disponibilite, promesse produit et information client',
    'Accueil magasin': 'Reprendre les standards d accueil et de prise en charge en magasin',
    'Conseil vendeur': 'Renforcer l accompagnement vendeur sur le besoin client',
    'Qualit\u00e9 produit': 'Analyser les causes produit et corriger la promesse qualite',
    Prix: 'Clarifier le positionnement prix et la lisibilite promotionnelle',
    'Site web/application': 'Corriger les frictions du parcours digital et de navigation',
    'Installation/montage': 'Fiabiliser le parcours installation et la coordination terrain',
    'Programme de fid\u00e9lit\u00e9': 'Clarifier les avantages CRM et les regles d usage',
    Autre: issueType === 'communication'
      ? 'Corriger la communication client sur ce point de friction'
      : 'Analyser le signal et definir une action corrective concrete',
  }

  return map[category] || map.Autre
}

function inferBusinessImpact(sentiment, severity, category) {
  const area = normalizeText(category || 'le parcours client') || 'le parcours client'
  if (sentiment === 'Positive') return `Signal positif a valoriser sur ${area}`
  if (severity === 'critical') return `Risque critique sur ${area} avec impact business eleve`
  if (severity === 'high') return `Risque eleve sur ${area} et la satisfaction`
  if (severity === 'medium') return `Friction visible sur ${area}`
  return `Signal faible a surveiller sur ${area}`
}

function fallbackTopic(category, text) {
  return sentenceFromText(text, 80) || CATEGORY_SUMMARIES[category] || 'Signal client'
}

function prepareRowForModel(table, rawRow) {
  const text = asText(rawRow.text)
  const rawCategory = table === 'benchmark_marche' ? asText(rawRow.topic) : asText(rawRow.category)
  const category = canonicalCategory(rawCategory, `${text} ${asText(rawRow.topic)}`)
  const sentiment = table === 'benchmark_marche'
    ? canonicalSentiment(rawRow.sentiment_detected, text)
    : canonicalSentiment(rawRow.sentiment, text)
  const severity = table === 'benchmark_marche'
    ? canonicalSeverity(rawRow.urgency_level, sentiment, text)
    : canonicalSeverity(rawRow.severity, sentiment, text)
  const issueType = REVIEW_LIKE.has(table) ? canonicalIssueType(rawRow.issue_type, category, text) : null
  const customerJourneyStep = REVIEW_LIKE.has(table) ? canonicalJourney(rawRow.customer_journey_step, category, text) : null
  const teamOwner = table === 'benchmark_marche' ? null : canonicalTeamOwner(rawRow.team_owner, category, issueType)
  const inferredSubcategory = rawCategory && category && normalizeKey(rawCategory) !== normalizeKey(category)
    ? compactText(rawCategory, 80)
    : ''

  return {
    ...rawRow,
    text,
    sentiment: table === 'benchmark_marche' ? undefined : sentiment,
    sentiment_detected: table === 'benchmark_marche' ? sentiment : undefined,
    category,
    subcategory: REVIEW_LIKE.has(table) ? compactText(rawRow.subcategory || inferredSubcategory, 80) : undefined,
    severity: table === 'benchmark_marche' ? undefined : severity,
    urgency_level: table === 'benchmark_marche' ? severity : undefined,
    pain_point: compactText(rawRow.pain_point, 140),
    delight_point: compactText(rawRow.delight_point, 140),
    customer_journey_step: REVIEW_LIKE.has(table) ? customerJourneyStep : undefined,
    issue_type: REVIEW_LIKE.has(table) ? issueType : undefined,
    topic: compactText(rawRow.topic, 120),
    topic_confidence: clampConfidence(rawRow.topic_confidence),
    is_actionable: typeof rawRow.is_actionable === 'boolean' ? rawRow.is_actionable : null,
    recommended_action: compactText(rawRow.recommended_action, 180),
    team_owner: teamOwner,
    business_impact: compactText(rawRow.business_impact, 180),
    insight_ready: rawRow.insight_ready === true,
  }
}

function tokenize(text) {
  const tokens = normalizeText(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1)

  const grams = []
  for (let index = 0; index < tokens.length - 1; index += 1) {
    grams.push(`${tokens[index]}_${tokens[index + 1]}`)
  }

  return [...tokens, ...grams]
}

function buildFeatureText(row, table) {
  return [
    asText(row.platform),
    asText(row.brand || row.entity_analyzed || row.target_brand_vs_competitor),
    table,
    asText(row.category),
    asText(row.subcategory),
    asText(row.topic),
    asText(row.text),
  ].filter(Boolean).join(' | ')
}

function determinePending(table, row) {
  if (!asText(row.text)) return false

  const missingAction = row.is_actionable === true && !asText(row.recommended_action)

  if (table === 'benchmark_marche') {
    return !asText(row.sentiment_detected)
      || !safeNumber(row.topic_confidence)
      || !asText(row.urgency_level)
      || !asText(row.business_impact)
      || !asBool(row.insight_ready)
  }

  if (SOCIAL_LIKE.has(table)) {
    return !asText(row.sentiment)
      || !asText(row.category)
      || !asText(row.severity)
      || !safeNumber(row.topic_confidence)
      || !asText(row.team_owner)
      || typeof row.is_actionable !== 'boolean'
      || missingAction
      || !asBool(row.insight_ready)
  }

  return !asText(row.sentiment)
    || !asText(row.category)
    || !asText(row.severity)
    || !asText(row.customer_journey_step)
    || !asText(row.issue_type)
    || !safeNumber(row.topic_confidence)
    || !asText(row.team_owner)
    || typeof row.is_actionable !== 'boolean'
    || missingAction
    || !asBool(row.insight_ready)
}

function isTrainingReady(table, row) {
  if (table === 'benchmark_marche') {
    return Boolean(asText(row.sentiment_detected) && asText(row.urgency_level) && safeNumber(row.topic_confidence))
  }

  if (SOCIAL_LIKE.has(table)) {
    return Boolean(asText(row.sentiment) && asText(row.category) && asText(row.severity) && asText(row.team_owner))
  }

  return Boolean(
    asText(row.sentiment)
    && asText(row.category)
    && asText(row.severity)
    && asText(row.customer_journey_step)
    && asText(row.issue_type)
    && asText(row.team_owner)
  )
}

function buildSparseVector(tokens, idfMap) {
  const counts = new Map()
  tokens.forEach((token) => counts.set(token, (counts.get(token) || 0) + 1))
  const entries = []
  let norm = 0

  counts.forEach((count, token) => {
    const idf = idfMap.get(token)
    if (!idf) return
    const weight = count * idf
    entries.push([token, weight])
    norm += weight * weight
  })

  const divisor = Math.sqrt(norm) || 1
  return entries.map(([token, weight]) => [token, weight / divisor])
}

function buildModel(trainingRows) {
  const documentFrequency = new Map()
  const prepared = trainingRows.map((row) => {
    const tokens = Array.from(new Set(tokenize(row.featureText)))
    tokens.forEach((token) => documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1))
    return { ...row, tokens }
  })

  const docCount = prepared.length || 1
  const idfMap = new Map()
  documentFrequency.forEach((count, token) => {
    idfMap.set(token, Math.log(1 + docCount / (1 + count)) + 1)
  })

  const invertedIndex = new Map()
  const docs = prepared.map((row, index) => {
    const vector = buildSparseVector(tokenize(row.featureText), idfMap)
    vector.forEach(([token, weight]) => {
      if (!invertedIndex.has(token)) invertedIndex.set(token, [])
      invertedIndex.get(token).push([index, weight])
    })
    return { ...row, vector }
  })

  return { docs, idfMap, invertedIndex }
}

function topMatches(model, featureText, topK) {
  const queryVector = buildSparseVector(tokenize(featureText), model.idfMap)
  const scores = new Map()

  queryVector.forEach(([token, weight]) => {
    const postings = model.invertedIndex.get(token) || []
    postings.forEach(([docIndex, docWeight]) => {
      scores.set(docIndex, (scores.get(docIndex) || 0) + (weight * docWeight))
    })
  })

  return Array.from(scores.entries())
    .map(([index, score]) => ({ doc: model.docs[index], score }))
    .filter((entry) => entry.score > 0.04)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK)
}

function chooseMatchesForTable(table, matches) {
  if (table === 'benchmark_marche') {
    const benchmarkMatches = matches.filter(({ doc }) => doc.table === 'benchmark_marche')
    return benchmarkMatches.length >= 2 ? benchmarkMatches : matches
  }

  const sameFamilyMatches = matches.filter(({ doc }) => {
    if (SOCIAL_LIKE.has(table)) return SOCIAL_LIKE.has(doc.table)
    return REVIEW_LIKE.has(doc.table)
  })

  return sameFamilyMatches.length >= 3 ? sameFamilyMatches : matches
}

function weightedVote(matches, field) {
  const scores = new Map()
  matches.forEach(({ doc, score }) => {
    const value = doc[field]
    if (value === null || value === undefined || value === '') return
    scores.set(value, (scores.get(value) || 0) + score)
  })
  if (!scores.size) return null
  return Array.from(scores.entries()).sort((left, right) => right[1] - left[1])[0][0]
}

function weightedText(matches, field) {
  const scores = new Map()
  matches.forEach(({ doc, score }) => {
    const value = asText(doc[field])
    if (!value) return
    scores.set(value, (scores.get(value) || 0) + score)
  })
  if (!scores.size) return null
  return Array.from(scores.entries()).sort((left, right) => right[1] - left[1])[0][0]
}

function inferFromNeighbors(table, row, matches) {
  const filteredMatches = chooseMatchesForTable(table, matches)
  const topScore = filteredMatches[0]?.score || 0
  const sentiment = canonicalSentiment(weightedVote(filteredMatches, table === 'benchmark_marche' ? 'sentiment_detected' : 'sentiment'), row.text) || row.sentiment || row.sentiment_detected || 'Neutral'
  const topicHint = weightedText(filteredMatches, 'topic')
  const textDrivenCategory = canonicalCategory('', `${row.text} ${row.topic} ${topicHint}`)
  const matchedCategory = canonicalCategory(weightedVote(filteredMatches, 'category'), `${row.text} ${row.topic}`)
  const category = row.category || textDrivenCategory || matchedCategory || 'Autre'
  const severity = canonicalSeverity(weightedVote(filteredMatches, table === 'benchmark_marche' ? 'urgency_level' : 'severity'), sentiment, row.text)
  const issueType = REVIEW_LIKE.has(table)
    ? (canonicalIssueType(weightedVote(filteredMatches, 'issue_type'), category, row.text) || inferIssueType(category, row.text))
    : null
  const customerJourneyStep = REVIEW_LIKE.has(table)
    ? (canonicalJourney(weightedVote(filteredMatches, 'customer_journey_step'), category, row.text) || inferJourney(category, row.text))
    : null
  const teamOwner = table === 'benchmark_marche'
    ? null
    : (canonicalTeamOwner(weightedVote(filteredMatches, 'team_owner'), category, issueType) || inferOwner(category, issueType))
  const bestPainPoint = compactText(weightedText(filteredMatches, 'pain_point'), 140)
  const bestDelightPoint = compactText(weightedText(filteredMatches, 'delight_point'), 140)
  const bestSubcategory = compactText(weightedText(filteredMatches, 'subcategory'), 80)
  const bestTopic = compactText(topicHint || bestSubcategory || bestPainPoint || fallbackTopic(category, row.text), 120)
  const confidence = clampConfidence(0.35 + (topScore * 1.9), 0.35)
  const inferredIsActionable = typeof row.is_actionable === 'boolean'
    ? row.is_actionable
    : (sentiment === 'Negative' ? true : asBool(weightedVote(filteredMatches, 'is_actionable')))
  const recommendedAction = asText(row.recommended_action)
    || (inferredIsActionable
      ? compactText(weightedText(filteredMatches, 'recommended_action') || inferActionFromCategory(category, sentiment, issueType), 180)
      : null)

  if (table === 'benchmark_marche') {
    return {
      sentiment_detected: SENTIMENT_VALUES.has(asText(row.sentiment_detected)) ? row.sentiment_detected : sentiment,
      topic: asText(row.topic) || bestTopic,
      topic_confidence: safeNumber(row.topic_confidence) || confidence,
      urgency_level: SEVERITY_VALUES.has(asText(row.urgency_level)) ? row.urgency_level : severity,
      business_impact: asText(row.business_impact) || inferBusinessImpact(sentiment, severity, asText(row.topic) || bestTopic || category),
      insight_ready: true,
    }
  }

  const base = {
    sentiment: SENTIMENT_VALUES.has(asText(row.sentiment)) ? row.sentiment : sentiment,
    category: CATEGORY_VALUES.has(asText(row.category)) ? row.category : category,
    severity: SEVERITY_VALUES.has(asText(row.severity)) ? row.severity : severity,
    pain_point: asText(row.pain_point) || (sentiment === 'Negative' ? bestPainPoint || fallbackTopic(category, row.text) : null),
    delight_point: asText(row.delight_point) || (sentiment === 'Positive' ? bestDelightPoint || fallbackTopic(category, row.text) : null),
    topic_confidence: safeNumber(row.topic_confidence) || confidence,
    is_actionable: inferredIsActionable,
    recommended_action: asText(row.recommended_action) || recommendedAction,
    team_owner: TEAM_OWNER_VALUES.has(asText(row.team_owner)) ? row.team_owner : teamOwner,
    insight_ready: true,
  }

  if (SOCIAL_LIKE.has(table)) {
    return {
      ...base,
      topic: asText(row.topic) || bestTopic,
    }
  }

  return {
    ...base,
    subcategory: asText(row.subcategory) || bestSubcategory || null,
    customer_journey_step: JOURNEY_VALUES.has(asText(row.customer_journey_step)) ? row.customer_journey_step : customerJourneyStep,
    issue_type: ISSUE_TYPE_VALUES.has(asText(row.issue_type)) ? row.issue_type : issueType,
  }
}

async function fetchRows(table, limitPerTable) {
  const rows = []
  const pageSize = 1000
  const maxRows = Number.isFinite(limitPerTable) && limitPerTable > 0 ? limitPerTable : Number.POSITIVE_INFINITY
  let from = 0

  while (rows.length < maxRows) {
    const to = Number.isFinite(maxRows)
      ? Math.min(from + pageSize - 1, maxRows - 1)
      : from + pageSize - 1

    const { data, error } = await supabase
      .from(table)
      .select(TABLES[table].select)
      .not('text', 'is', null)
      .neq('text', '')
      .range(from, to)

    if (error) throw error

    const batch = data || []
    rows.push(...batch)

    if (batch.length < pageSize) break
    from += pageSize
  }

  return rows.slice(0, Number.isFinite(maxRows) ? maxRows : rows.length)
}

async function loadDataset(selectedTables, limitPerTable) {
  const dataset = []
  for (const table of selectedTables) {
    const rows = await fetchRows(table, limitPerTable)
    rows.forEach((rawRow) => {
      const row = prepareRowForModel(table, rawRow)
      dataset.push({
        table,
        rawRow,
        row,
        featureText: buildFeatureText(row, table),
        trainingReady: isTrainingReady(table, row),
      })
    })
  }
  return dataset
}

async function updateRow(table, rowId, update, dryRun) {
  if (dryRun) return
  const { error } = await supabase.from(table).update(update).eq('id', rowId)
  if (error) throw error
}

async function processWithConcurrency(items, concurrency, task) {
  const queue = [...items]
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length) {
      const item = queue.shift()
      if (!item) return
      await task(item)
    }
  })
  await Promise.all(workers)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const selectedTables = options.tables.filter((table) => TABLES[table])
  const dataset = await loadDataset(selectedTables, options.limitPerTable)
  const trainingRows = dataset.filter((item) => item.trainingReady)

  if (!trainingRows.length) {
    console.error('No labeled data available to train the local model')
    process.exit(1)
  }

  const model = buildModel(trainingRows.map((item) => ({
    table: item.table,
    featureText: item.featureText,
    ...item.row,
  })))
  const pendingRows = dataset.filter((item) => determinePending(item.table, item.rawRow))

  const summary = []

  for (const table of selectedTables) {
    const tableRows = pendingRows.filter((item) => item.table === table)
    let updated = 0
    let skipped = 0
    let failed = 0
    const preview = []

    await processWithConcurrency(tableRows, options.concurrency, async (item) => {
      const matches = topMatches(model, item.featureText, options.topK)
      if (!matches.length) {
        skipped += 1
        return
      }

      try {
        const update = inferFromNeighbors(table, item.row, matches)
        if (options.dryRun && preview.length < options.preview) {
          preview.push({
            id: item.row.id,
            text: compactText(item.row.text, 110),
            update,
          })
        }
        await updateRow(table, item.row.id, update, options.dryRun)
        updated += 1
      } catch (error) {
        failed += 1
      }
    })

    summary.push({ table, pending: tableRows.length, updated, skipped, failed, preview })
    console.log(`[${table}] pending=${tableRows.length} updated=${updated} skipped=${skipped} failed=${failed}`)
    if (options.dryRun && preview.length) {
      console.log(JSON.stringify({ table, preview }, null, 2))
    }
  }

  console.log(JSON.stringify({
    dryRun: options.dryRun,
    trainingRows: trainingRows.length,
    pendingRows: pendingRows.length,
    summary,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
