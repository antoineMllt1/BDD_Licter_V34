import Anthropic from '@anthropic-ai/sdk'
import PDFDocument from 'pdfkit'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const DEFAULT_SECTIONS = ['reputation', 'benchmark', 'cx', 'recommendations']
const DATA_SOURCE_PRESETS = {
  all: ['reputation', 'benchmark', 'cx'],
  brand360: ['reputation', 'cx'],
  market: ['reputation', 'benchmark'],
  customer: ['cx'],
  reputation: ['reputation'],
  benchmark: ['benchmark']
}

const SECTION_LABELS = {
  reputation: 'Reputation & Crise',
  benchmark: 'Benchmark Marche',
  cx: 'Experience Client',
  recommendations: 'Recommandations strategiques'
}

function resolveDataSources(payload) {
  if (Array.isArray(payload.dataSources) && payload.dataSources.length > 0) {
    return payload.dataSources.filter(source => ['reputation', 'benchmark', 'cx'].includes(source))
  }
  return DATA_SOURCE_PRESETS[payload.dataPreset] || DATA_SOURCE_PRESETS.all
}

function resolveLimit(dataVolume) {
  if (dataVolume === 'light') return 250
  if (dataVolume === 'deep') return 1500
  return 500
}

function toneInstruction(tone) {
  if (tone === 'consulting') return 'Style board memo, structure conseil, messages incisifs et axes de decision.'
  if (tone === 'executive') return 'Style executive summary, tres synthetique, oriente arbitrages et decisions.'
  return 'Style corporate, clair, sobre et adapte a une direction generale.'
}

function detailInstruction(level) {
  if (level === 'synthesis') return 'Reste tres concis, va a l essentiel, 2 a 3 points par section.'
  if (level === 'deep') return 'Sois plus detaille, explicite les implications business et les priorites.'
  return 'Maintiens un niveau de detail standard avec messages actionnables.'
}

function focusInstruction(focus) {
  if (focus === 'risk') return 'Donne la priorite aux signaux faibles, aux risques reputionnels et aux alertes.'
  if (focus === 'growth') return 'Donne la priorite aux opportunites de croissance, positionnement et part de voix.'
  if (focus === 'operations') return 'Donne la priorite aux irritants operationnels, execution et qualite de service.'
  return 'Equilibre risques, opportunites et execution.'
}

function normalizeSentiment(value) {
  if (!value) return null
  const normalized = String(value).trim().toLowerCase()
  if (normalized === 'positive') return 'Positive'
  if (normalized === 'negative') return 'Negative'
  if (normalized === 'neutral') return 'Neutral'
  return null
}

function safeText(value, fallback = 'n/a') {
  return value && String(value).trim() ? String(value) : fallback
}

async function fetchDataSummary({ brand, competitor, dataSources, dataVolume }) {
  const limit = resolveLimit(dataVolume)
  const requests = []

  if (dataSources.includes('reputation')) {
    requests.push(
      supabase.from('reputation_crise').select('sentiment, rating, platform, date, likes, share_count').limit(limit)
    )
  } else {
    requests.push(Promise.resolve({ data: [] }))
  }

  if (dataSources.includes('benchmark')) {
    requests.push(
      supabase.from('benchmark_marche').select('entity_analyzed, sentiment_detected, topic, target_brand_vs_competitor').limit(limit)
    )
  } else {
    requests.push(Promise.resolve({ data: [] }))
  }

  if (dataSources.includes('cx')) {
    requests.push(
      supabase.from('voix_client_cx').select('rating, sentiment, category, platform, date').limit(limit)
    )
  } else {
    requests.push(Promise.resolve({ data: [] }))
  }

  const [rep, bench, cx] = await Promise.all(requests)
  const repData = rep.data || []
  const benchData = bench.data || []
  const cxData = cx.data || []

  const repNeg = repData.filter(r => normalizeSentiment(r.sentiment) === 'Negative').length
  const repPos = repData.filter(r => normalizeSentiment(r.sentiment) === 'Positive').length
  const repNeu = repData.filter(r => normalizeSentiment(r.sentiment) === 'Neutral').length
  const repTotal = repData.length
  const repCrisisScore = repTotal > 0 ? Math.round((repNeg / repTotal) * 100) : 0

  const brandMentions = benchData.filter(r =>
    safeText(r.entity_analyzed).toLowerCase() === brand.toLowerCase() || r.target_brand_vs_competitor === 'Brand'
  ).length
  const competitorMentions = benchData.filter(r =>
    safeText(r.entity_analyzed).toLowerCase() === competitor.toLowerCase() || r.target_brand_vs_competitor === 'Competitor'
  ).length
  const totalBench = brandMentions + competitorMentions
  const sovBrand = totalBench > 0 ? Math.round((brandMentions / totalBench) * 100) : 0
  const topicsRaw = benchData.reduce((acc, row) => {
    if (row.topic) acc[row.topic] = (acc[row.topic] || 0) + 1
    return acc
  }, {})
  const topTopics = Object.entries(topicsRaw).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const benchPos = benchData.filter(r => normalizeSentiment(r.sentiment_detected) === 'Positive').length
  const benchNeg = benchData.filter(r => normalizeSentiment(r.sentiment_detected) === 'Negative').length

  const rated = cxData.filter(r => r.rating)
  const avgRating = rated.length > 0
    ? (rated.reduce((sum, row) => sum + Number(row.rating || 0), 0) / rated.length).toFixed(2)
    : '0.00'
  const categoriesRaw = cxData.reduce((acc, row) => {
    if (row.category) acc[row.category] = (acc[row.category] || 0) + 1
    return acc
  }, {})
  const topCategories = Object.entries(categoriesRaw).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const cxPos = cxData.filter(r => normalizeSentiment(r.sentiment) === 'Positive').length
  const cxNeg = cxData.filter(r => normalizeSentiment(r.sentiment) === 'Negative').length

  return {
    metadata: {
      rowLimit: limit,
      totalMentions: repTotal + totalBench + cxData.length,
      sources: {
        reputation: repTotal,
        benchmark: benchData.length,
        cx: cxData.length
      }
    },
    reputation: { total: repTotal, negative: repNeg, positive: repPos, neutral: repNeu, crisisScore: repCrisisScore },
    benchmark: {
      total: benchData.length,
      brandMentions,
      competitorMentions,
      sovBrand,
      sovCompetitor: totalBench > 0 ? 100 - sovBrand : 0,
      positive: benchPos,
      negative: benchNeg,
      topTopics
    },
    cx: { avgRating, total: cxData.length, negative: cxNeg, positive: cxPos, topCategories }
  }
}

function buildPrompt({ brand, competitor, dateRange, tone, detailLevel, focus, sections, dataSources, stats, includeAppendix }) {
  const lines = [
    `Tu es un senior analyst dans un cabinet de conseil.`,
    `Redige un rapport COMEX professionnel en francais pour la marque ${brand}.`,
    `Periode analysee: ${dateRange}.`,
    `Concurrent principal: ${competitor}.`,
    `Bases integrees: ${dataSources.map(source => SECTION_LABELS[source] || source).join(', ')}.`,
    toneInstruction(tone),
    detailInstruction(detailLevel),
    focusInstruction(focus),
    '',
    'DONNEES DISPONIBLES:'
  ]

  if (dataSources.includes('reputation')) {
    lines.push(`Reputation & Crise: ${stats.reputation.total} mentions, ${stats.reputation.negative} negatives, ${stats.reputation.positive} positives, score de crise ${stats.reputation.crisisScore}%.`)
  }

  if (dataSources.includes('benchmark')) {
    lines.push(`Benchmark Marche: ${stats.benchmark.total} mentions, SOV ${brand} ${stats.benchmark.sovBrand}%, SOV ${competitor} ${stats.benchmark.sovCompetitor}%, top sujets ${stats.benchmark.topTopics.map(([k, v]) => `${k} (${v})`).join(', ') || 'n/a'}.`)
  }

  if (dataSources.includes('cx')) {
    lines.push(`Experience Client: ${stats.cx.total} avis, note moyenne ${stats.cx.avgRating}/5, ${stats.cx.positive} positifs, ${stats.cx.negative} negatifs, top categories ${stats.cx.topCategories.map(([k, v]) => `${k} (${v})`).join(', ') || 'n/a'}.`)
  }

  lines.push('', 'SECTIONS A REDIGER:')

  let sectionNumber = 1
  if (sections.includes('reputation') && dataSources.includes('reputation')) {
    lines.push(`${sectionNumber++}. REPUTATION & CRISE - niveau de risque, signaux critiques, interpretation manageriale.`)
  }
  if (sections.includes('benchmark') && dataSources.includes('benchmark')) {
    lines.push(`${sectionNumber++}. BENCHMARK MARCHE - positionnement ${brand} vs ${competitor}, forces et faiblesses.`)
  }
  if (sections.includes('cx') && dataSources.includes('cx')) {
    lines.push(`${sectionNumber++}. EXPERIENCE CLIENT - irritants majeurs, points forts, priorites d'amelioration.`)
  }
  if (sections.includes('recommendations')) {
    lines.push(`${sectionNumber++}. RECOMMANDATIONS STRATEGIQUES - 5 recommandations concretes, prioritisees, orientees impact business.`)
  }

  if (includeAppendix) {
    lines.push(`${sectionNumber}. ANNEXE DONNEES - resume tres court des bases utilisees et volumes analyses.`)
  }

  lines.push('', 'Format attendu: titres de sections sur leur propre ligne, paragraphes clairs, pas de markdown en listes a puces excessives.')

  return lines.join('\n')
}

function addWrappedText(doc, text, x, y, width, options = {}) {
  const height = doc.heightOfString(text, { width, ...options })
  doc.text(text, x, y, { width, ...options })
  return height
}

function drawAppendix(doc, y, options, stats) {
  const appendixLines = [
    'ANNEXE DONNEES',
    `Bases integrees: ${options.dataSources.join(', ')}`,
    `Volume analyse: ${stats.metadata.totalMentions} enregistrements`,
    `Limite par base: ${stats.metadata.rowLimit} lignes`,
    `Reputation & Crise: ${stats.metadata.sources.reputation}`,
    `Benchmark Marche: ${stats.metadata.sources.benchmark}`,
    `Experience Client: ${stats.metadata.sources.cx}`
  ]

  appendixLines.forEach((line, index) => {
    if (y > 760) {
      doc.addPage()
      y = 50
    }

    if (index === 0) {
      doc.rect(50, y - 4, 495, 22).fill('#EDE9FF')
      doc.fillColor('#6C5CE7').font('Helvetica-Bold').fontSize(11)
      doc.text(line, 60, y, { width: 475 })
      y += 28
    } else {
      doc.fillColor('#2B2852').font('Helvetica').fontSize(9.5)
      y += addWrappedText(doc, line, 60, y, 475) + 4
    }
  })
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
  const sections = Array.isArray(req.body.sections) && req.body.sections.length > 0 ? req.body.sections : DEFAULT_SECTIONS

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(400).json({ error: 'ANTHROPIC_API_KEY manquant dans .env' })
  }

  if (dataSources.length === 0) {
    return res.status(400).json({ error: 'Aucune base de donnees selectionnee pour le rapport COMEX' })
  }

  try {
    const stats = await fetchDataSummary({ brand, competitor, dataSources, dataVolume })
    const prompt = buildPrompt({ brand, competitor, dateRange, tone, detailLevel, focus, sections, dataSources, stats, includeAppendix })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: detailLevel === 'deep' ? 3200 : detailLevel === 'synthesis' ? 1800 : 2500,
      messages: [{ role: 'user', content: prompt }]
    })

    const reportText = message.content[0]?.text || 'Aucun contenu genere.'

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="COMEX_${brand.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf"`)

    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      bufferPages: true,
      info: { Title: `Rapport COMEX - ${brand}`, Author: 'Licter Intelligence' }
    })

    doc.pipe(res)

    doc.rect(0, 0, 595, 200).fill('#6C5CE7')
    doc.fillColor('white').font('Helvetica-Bold').fontSize(28).text('RAPPORT COMEX', 50, 60)
    doc.fontSize(18).text('Brand & Market Intelligence', 50, 100)
    doc.fontSize(14).font('Helvetica').text(`${brand} - ${dateRange}`, 50, 132)
    doc.fontSize(10).text(`Genere le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`, 50, 158)
    doc.fillColor('#E9E7F6').fontSize(9).text(`Sources: ${dataSources.join(', ')}`, 50, 178)

    doc.fillColor('#2B2852').moveDown(8)
    doc.rect(50, 215, 495, 90).fill('#F5F4FE').stroke('#E9E7F6')
    doc.fillColor('#6C5CE7').font('Helvetica-Bold').fontSize(9).text('INDICATEURS CLES', 65, 228)
    doc.fillColor('#2B2852').fontSize(22).font('Helvetica-Bold')
    doc.text(`${stats.reputation.crisisScore}%`, 65, 245)
    doc.text(`${stats.benchmark.sovBrand}%`, 195, 245)
    doc.text(`${stats.cx.avgRating}/5`, 325, 245)
    doc.text(`${stats.metadata.totalMentions}`, 455, 245)
    doc.fillColor('#7B78A8').fontSize(8).font('Helvetica')
    doc.text('Score de Crise', 65, 273)
    doc.text('Share of Voice', 195, 273)
    doc.text('Note CX Moyenne', 325, 273)
    doc.text('Mentions totales', 455, 273)

    let y = 330

    reportText.split('\n').forEach(line => {
      if (!line.trim()) {
        y += 8
        return
      }

      if (y > 770) {
        doc.addPage()
        y = 50
      }

      if (/^\d\./.test(line) || (/^[A-Z0-9 &'-]+$/.test(line.trim()) && line.trim().length < 80)) {
        doc.rect(50, y - 4, 495, 22).fill('#EDE9FF')
        doc.fillColor('#6C5CE7').font('Helvetica-Bold').fontSize(11)
        doc.text(line.trim(), 60, y, { width: 475 })
        y += 26
      } else {
        doc.fillColor('#2B2852').font('Helvetica').fontSize(9.5)
        y += addWrappedText(doc, line.trim(), 60, y, 475, { lineGap: 2 }) + 4
      }
    })

    if (includeAppendix) {
      if (y > 720) {
        doc.addPage()
        y = 50
      } else {
        y += 10
      }
      drawAppendix(doc, y, { dataSources }, stats)
    }

    const pageRange = doc.bufferedPageRange()
    const pageCount = pageRange.count

    for (let i = pageRange.start; i < pageRange.start + pageCount; i++) {
      doc.switchToPage(i)
      doc.fillColor('#B8B5D6').fontSize(8).font('Helvetica')
      doc.text(`Licter Brand Intelligence - Confidentiel - Page ${i - pageRange.start + 1}/${pageCount}`, 50, 780, {
        align: 'center',
        width: 495,
        lineBreak: false
      })
    }

    doc.end()
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message })
    }
  }
}
