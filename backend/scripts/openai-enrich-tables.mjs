import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

config({ path: path.join(__dirname, '..', '..', '.env') })
config({ path: path.join(__dirname, '..', '.env'), override: true })

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim()
const OPENAI_MODEL = (process.env.OPENAI_ENRICH_MODEL || 'gpt-4o-mini').trim()
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY')
  process.exit(1)
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const SYSTEM_PROMPT = `Tu es un analyste CX expert du retail français. Analyse l'avis client et retourne UNIQUEMENT un objet JSON valide. Pas de texte avant ni après, pas de markdown. Si tu n'es pas sûr, utilise un topic_confidence faible.

Catégories : SAV | Livraison | Retour/remboursement | Stock/disponibilité | Accueil magasin | Conseil vendeur | Qualité produit | Prix | Site web/application | Installation/montage | Programme de fidélité | Autre

Format JSON strict :
{"sentiment":"Positive|Negative|Neutral","category":"<catégorie>","subcategory":"<précision ou null>","severity":"low|medium|high|critical","pain_point":"<problème court ou null>","delight_point":"<point fort court ou null>","customer_journey_step":"pre_purchase|purchase|delivery|post_purchase|support","issue_type":"product|service|logistics|communication|pricing|digital_experience","topic_confidence":0.85,"is_actionable":true,"recommended_action":"<action concrète ou null>","team_owner":"retail_ops|ecommerce|customer_support|logistics|product|marketing|crm|unknown","insight_ready":true}`

const REVIEW_TABLES = new Set(['scraping_brand', 'scraping_competitor', 'voix_client_cx', 'reputation_crise'])
const TABLE_CONFIG = {
  scraping_brand: {
    pending: 'or(insight_ready.is.null,insight_ready.eq.false,recommended_action.is.null,recommended_action.eq.)',
    select: 'id,review_id,text,platform,brand,sentiment,category,subcategory,severity,pain_point,delight_point,customer_journey_step,issue_type,topic_confidence,is_actionable,recommended_action,team_owner,insight_ready',
  },
  scraping_competitor: {
    pending: 'or(insight_ready.is.null,insight_ready.eq.false,recommended_action.is.null,recommended_action.eq.)',
    select: 'id,review_id,text,platform,brand,sentiment,category,subcategory,severity,pain_point,delight_point,customer_journey_step,issue_type,topic_confidence,is_actionable,recommended_action,team_owner,insight_ready',
  },
  voix_client_cx: {
    pending: 'or(insight_ready.is.null,insight_ready.eq.false,recommended_action.is.null,recommended_action.eq.)',
    select: 'id,review_id,text,platform,brand,sentiment,category,subcategory,severity,pain_point,delight_point,customer_journey_step,issue_type,topic_confidence,is_actionable,recommended_action,team_owner,insight_ready',
  },
  reputation_crise: {
    pending: 'or(insight_ready.is.null,insight_ready.eq.false,recommended_action.is.null,recommended_action.eq.)',
    select: 'id,review_id,text,platform,brand,sentiment,category,subcategory,severity,pain_point,delight_point,customer_journey_step,issue_type,topic_confidence,is_actionable,recommended_action,team_owner,insight_ready',
  },
  benchmark_marche: {
    pending: 'or(insight_ready.is.null,insight_ready.eq.false,topic_confidence.is.null,urgency_level.is.null,business_impact.is.null,sentiment_detected.is.null,sentiment_detected.eq.)',
    select: 'id,review_id,text,platform,brand,entity_analyzed,target_brand_vs_competitor,sentiment_detected,topic,topic_confidence,urgency_level,business_impact,insight_ready',
  },
  social_mentions: {
    pending: 'or(insight_ready.is.null,insight_ready.eq.false,recommended_action.is.null,recommended_action.eq.,sentiment.is.null,sentiment.eq.)',
    select: 'id,review_id,text,platform,brand,sentiment,category,severity,pain_point,delight_point,topic,topic_confidence,is_actionable,recommended_action,team_owner,insight_ready',
  },
  social_mentions_competitor: {
    pending: 'or(insight_ready.is.null,insight_ready.eq.false,recommended_action.is.null,recommended_action.eq.,sentiment.is.null,sentiment.eq.)',
    select: 'id,review_id,text,platform,brand,sentiment,category,severity,pain_point,delight_point,topic,topic_confidence,is_actionable,recommended_action,team_owner,insight_ready',
  },
}

function parseArgs(argv) {
  const options = {
    tables: Object.keys(TABLE_CONFIG),
    limitPerTable: null,
    concurrency: 6,
    dryRun: false,
    maxRows: null,
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
    } else if (arg === '--max-rows' && next) {
      options.maxRows = Number(next)
      index += 1
    } else if (arg === '--concurrency' && next) {
      options.concurrency = Math.max(1, Number(next) || 1)
      index += 1
    } else if (arg === '--dry-run') {
      options.dryRun = true
    }
  }

  return options
}

function asText(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function chunk(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

function normalizeCategory(value) {
  const allowed = new Set([
    'SAV',
    'Livraison',
    'Retour/remboursement',
    'Stock/disponibilité',
    'Accueil magasin',
    'Conseil vendeur',
    'Qualité produit',
    'Prix',
    'Site web/application',
    'Installation/montage',
    'Programme de fidélité',
    'Autre',
  ])
  return allowed.has(value) ? value : 'Autre'
}

function normalizeChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback
}

function normalizeNullableText(value) {
  const text = asText(value)
  return text ? text : null
}

function normalizeConfidence(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0.5
  return Math.min(1, Math.max(0.05, Number(numeric.toFixed(2))))
}

function buildBusinessImpact(result) {
  if (result.sentiment === 'Positive') return 'Signal positif a exploiter dans la communication commerciale'
  if (result.severity === 'critical') return 'Risque business critique sur image, conversion et satisfaction'
  if (result.severity === 'high') return 'Risque eleve sur satisfaction client et conversion'
  if (result.severity === 'medium') return 'Friction visible a corriger pour proteger la satisfaction'
  return 'Signal faible a surveiller dans le parcours client'
}

function normalizeResult(raw) {
  return {
    sentiment: normalizeChoice(raw.sentiment, ['Positive', 'Negative', 'Neutral'], 'Neutral'),
    category: normalizeCategory(raw.category),
    subcategory: normalizeNullableText(raw.subcategory),
    severity: normalizeChoice(raw.severity, ['low', 'medium', 'high', 'critical'], 'medium'),
    pain_point: normalizeNullableText(raw.pain_point),
    delight_point: normalizeNullableText(raw.delight_point),
    customer_journey_step: normalizeChoice(raw.customer_journey_step, ['pre_purchase', 'purchase', 'delivery', 'post_purchase', 'support'], 'purchase'),
    issue_type: normalizeChoice(raw.issue_type, ['product', 'service', 'logistics', 'communication', 'pricing', 'digital_experience'], 'service'),
    topic_confidence: normalizeConfidence(raw.topic_confidence),
    is_actionable: Boolean(raw.is_actionable),
    recommended_action: normalizeNullableText(raw.recommended_action),
    team_owner: normalizeChoice(raw.team_owner, ['retail_ops', 'ecommerce', 'customer_support', 'logistics', 'product', 'marketing', 'crm', 'unknown'], 'unknown'),
    insight_ready: true,
  }
}

function mapResultToUpdate(table, result, row) {
  const base = normalizeResult(result)

  if (REVIEW_TABLES.has(table)) {
    return {
      sentiment: base.sentiment,
      category: base.category,
      subcategory: base.subcategory,
      severity: base.severity,
      pain_point: base.pain_point,
      delight_point: base.delight_point,
      customer_journey_step: base.customer_journey_step,
      issue_type: base.issue_type,
      topic_confidence: base.topic_confidence,
      is_actionable: base.is_actionable,
      recommended_action: base.recommended_action,
      team_owner: base.team_owner,
      insight_ready: true,
    }
  }

  if (table === 'social_mentions' || table === 'social_mentions_competitor') {
    return {
      sentiment: base.sentiment,
      category: base.category,
      severity: base.severity,
      pain_point: base.pain_point,
      delight_point: base.delight_point,
      topic: row.topic || base.subcategory || base.pain_point || base.category,
      topic_confidence: base.topic_confidence,
      is_actionable: base.is_actionable,
      recommended_action: base.recommended_action,
      team_owner: base.team_owner,
      insight_ready: true,
    }
  }

  if (table === 'benchmark_marche') {
    return {
      sentiment_detected: row.sentiment_detected || base.sentiment,
      topic: row.topic || base.subcategory || base.pain_point || base.category,
      topic_confidence: base.topic_confidence,
      urgency_level: base.severity,
      business_impact: row.business_impact || buildBusinessImpact(base),
      insight_ready: true,
    }
  }

  return {}
}

async function fetchPendingRows(table, config, limitPerTable) {
  let query = supabase
    .from(table)
    .select(config.select)
    .not('text', 'is', null)
    .neq('text', '')
    .or(config.pending)
    .order('created_at', { ascending: true, nullsFirst: false })
    .limit(limitPerTable || 5000)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

async function callOpenAI(table, row, attempt = 1) {
  const identifier = asText(row.review_id || row.id)
  const subject = asText(row.brand || row.entity_analyzed || row.target_brand_vs_competitor || 'Fnac Darty')
  const platform = asText(row.platform || 'unknown')
  const text = asText(row.text)

  const payload = {
    model: OPENAI_MODEL,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          `table=${table}`,
          `id=${identifier}`,
          `subject=${subject}`,
          `platform=${platform}`,
          `text=${text}`,
          'Retourne strictement le JSON cible pour cette ligne.'
        ].join('\n'),
      }
    ],
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = await response.text()
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500))
      return callOpenAI(table, row, attempt + 1)
    }
    throw new Error(`OpenAI ${response.status}: ${body}`)
  }

  const json = await response.json()
  const content = json.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenAI returned empty content')

  try {
    return JSON.parse(content)
  } catch (error) {
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000))
      return callOpenAI(table, row, attempt + 1)
    }
    throw new Error(`Invalid JSON from OpenAI: ${content}`)
  }
}

async function updateRow(table, rowId, update, dryRun) {
  if (dryRun) return { dryRun: true }
  const { error } = await supabase.from(table).update(update).eq('id', rowId)
  if (error) throw error
  return { updated: true }
}

async function processRow(table, row, dryRun) {
  const result = await callOpenAI(table, row)
  const update = mapResultToUpdate(table, result, row)
  if (!Object.keys(update).length) return { table, id: row.id, skipped: true }
  await updateRow(table, row.id, update, dryRun)
  return { table, id: row.id, updated: true }
}

async function runPool(items, concurrency, worker) {
  const results = []
  let cursor = 0

  async function consume() {
    while (cursor < items.length) {
      const current = items[cursor]
      cursor += 1
      try {
        results.push(await worker(current))
      } catch (error) {
        results.push({ ...current, error: error.message })
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => consume()))
  return results
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const selectedTables = options.tables.filter((table) => TABLE_CONFIG[table])
  const globalSummary = []
  let processedTotal = 0

  for (const table of selectedTables) {
    const config = TABLE_CONFIG[table]
    const rows = await fetchPendingRows(table, config, options.limitPerTable)
    const limitedRows = options.maxRows ? rows.slice(0, Math.max(0, options.maxRows - processedTotal)) : rows

    if (!limitedRows.length) {
      console.log(`[${table}] no pending rows`)
      continue
    }

    console.log(`[${table}] pending=${limitedRows.length}`)
    const workItems = limitedRows.map((row) => ({ table, row }))
    const results = await runPool(workItems, options.concurrency, async ({ table: workTable, row }) => processRow(workTable, row, options.dryRun))
    const updated = results.filter((result) => result.updated).length
    const failed = results.filter((result) => result.error).length
    const skipped = results.filter((result) => result.skipped).length
    processedTotal += limitedRows.length
    globalSummary.push({ table, pending: limitedRows.length, updated, failed, skipped })
    console.log(`[${table}] updated=${updated} failed=${failed} skipped=${skipped}`)

    if (options.maxRows && processedTotal >= options.maxRows) break
  }

  console.log(JSON.stringify({ model: OPENAI_MODEL, dryRun: options.dryRun, summary: globalSummary }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
