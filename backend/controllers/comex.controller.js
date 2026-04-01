import Anthropic from '@anthropic-ai/sdk'
import PDFDocument from 'pdfkit'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function fetchDataSummary() {
  const [rep, bench, cx] = await Promise.all([
    supabase.from('reputation_crise').select('sentiment, rating, platform, date, likes, share_count').limit(500),
    supabase.from('benchmark_marche').select('entity_analyzed, sentiment_detected, topic, target_brand_vs_competitor').limit(500),
    supabase.from('voix_client_cx').select('rating, sentiment, category, platform, date').limit(500)
  ])

  // Reputation stats
  const repData = rep.data || []
  const repTotal = repData.length
  const repNeg = repData.filter(r => r.sentiment === 'Negative').length
  const repPos = repData.filter(r => r.sentiment === 'Positive').length
  const repCrisisScore = repTotal > 0 ? Math.round((repNeg / repTotal) * 100) : 0

  // Benchmark stats
  const benchData = bench.data || []
  const fnacMentions = benchData.filter(r => r.entity_analyzed === 'Fnac Darty').length
  const boulMentions = benchData.filter(r => r.entity_analyzed === 'Boulanger').length
  const totalBench = fnacMentions + boulMentions
  const sovFnac = totalBench > 0 ? Math.round((fnacMentions / totalBench) * 100) : 0
  const topicsRaw = benchData.reduce((acc, r) => { if (r.topic) acc[r.topic] = (acc[r.topic] || 0) + 1; return acc }, {})
  const topTopics = Object.entries(topicsRaw).sort((a, b) => b[1] - a[1]).slice(0, 5)

  // CX stats
  const cxData = cx.data || []
  const avgRating = cxData.reduce((s, r) => s + (r.rating || 0), 0) / (cxData.filter(r => r.rating).length || 1)
  const categoriesRaw = cxData.reduce((acc, r) => { if (r.category) acc[r.category] = (acc[r.category] || 0) + 1; return acc }, {})
  const topCategories = Object.entries(categoriesRaw).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const cxNeg = cxData.filter(r => r.sentiment === 'Negative').length
  const cxPos = cxData.filter(r => r.sentiment === 'Positive').length

  return {
    reputation: { total: repTotal, negative: repNeg, positive: repPos, crisisScore: repCrisisScore },
    benchmark: { sovFnac, sovBoulanger: 100 - sovFnac, fnacMentions, boulMentions, topTopics },
    cx: { avgRating: avgRating.toFixed(2), total: cxData.length, negative: cxNeg, positive: cxPos, topCategories }
  }
}

export async function generateComexPdf(req, res) {
  const { brand = 'Fnac Darty', dateRange = '12 derniers mois' } = req.body

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(400).json({ error: 'ANTHROPIC_API_KEY manquant dans .env' })
  }

  try {
    const stats = await fetchDataSummary()

    const prompt = `Tu es un senior analyst chez un cabinet de conseil. Rédige un rapport COMEX professionnel en français pour la marque ${brand}.

DONNÉES CLÉS:
Réputation & Crise:
- ${stats.reputation.total} mentions analysées
- Score de crise: ${stats.reputation.crisisScore}% (${stats.reputation.negative} mentions négatives)
- Mentions positives: ${stats.reputation.positive}

Benchmark Marché (vs Boulanger):
- Share of Voice ${brand}: ${stats.benchmark.sovFnac}%
- Share of Voice Boulanger: ${stats.benchmark.sovBoulanger}%
- Top sujets: ${stats.benchmark.topTopics.map(([k, v]) => `${k} (${v})`).join(', ')}

Expérience Client:
- Note moyenne: ${stats.cx.avgRating}/5
- ${stats.cx.total} avis analysés (${stats.cx.positive} positifs, ${stats.cx.negative} négatifs)
- Top catégories: ${stats.cx.topCategories.map(([k, v]) => `${k} (${v})`).join(', ')}

Rédige les sections suivantes en français formel de niveau direction générale:
1. RÉSUMÉ EXÉCUTIF (4-5 phrases synthétiques)
2. ANALYSE RÉPUTATION & CRISE (insights actionnables, niveau de risque)
3. BENCHMARK MARCHÉ (positionnement vs Boulanger, forces/faiblesses)
4. EXPÉRIENCE CLIENT (irritants principaux, axes d'amélioration)
5. RECOMMANDATIONS STRATÉGIQUES (5 recommandations concrètes et chiffrées)

Format: paragraphes clairs, style COMEX, pas de markdown, French corporate tone.`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }]
    })

    const reportText = message.content[0].text
    const sections = reportText.split(/\n(?=\d\.|[A-Z]{2,})/).filter(s => s.trim())

    // Generate PDF
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="COMEX_${brand.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf"`)

    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Rapport COMEX — ${brand}`, Author: 'Licter Intelligence' } })
    doc.pipe(res)

    // Cover page
    doc.rect(0, 0, 595, 200).fill('#6C5CE7')
    doc.fillColor('white').font('Helvetica-Bold').fontSize(28).text('RAPPORT COMEX', 50, 60)
    doc.fontSize(18).text(`Brand & Market Intelligence`, 50, 100)
    doc.fontSize(14).font('Helvetica').text(`${brand} — ${dateRange}`, 50, 132)
    doc.fontSize(10).text(`Généré le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`, 50, 158)
    doc.fillColor('#E9E7F6').fontSize(9).text('Powered by Licter × Claude AI', 50, 178)

    // KPI Summary
    doc.fillColor('#2B2852').moveDown(8)
    doc.rect(50, 215, 495, 90).fill('#F5F4FE').stroke('#E9E7F6')
    doc.fillColor('#6C5CE7').font('Helvetica-Bold').fontSize(9).text('INDICATEURS CLÉS', 65, 228)
    doc.fillColor('#2B2852').fontSize(22).font('Helvetica-Bold')
    doc.text(`${stats.reputation.crisisScore}%`, 65, 245)
    doc.text(`${stats.benchmark.sovFnac}%`, 195, 245)
    doc.text(`${stats.cx.avgRating}/5`, 325, 245)
    doc.text(`${stats.cx.total + stats.reputation.total}`, 455, 245)
    doc.fillColor('#7B78A8').fontSize(8).font('Helvetica')
    doc.text('Score de Crise', 65, 273)
    doc.text('Share of Voice', 195, 273)
    doc.text('Note CX Moyenne', 325, 273)
    doc.text('Mentions totales', 455, 273)

    // Report content
    doc.moveDown(4)
    let y = 330

    reportText.split('\n').forEach(line => {
      if (!line.trim()) { y += 8; return }
      if (y > 770) { doc.addPage(); y = 50 }

      if (/^\d\./.test(line) || line.length < 60 && line === line.toUpperCase()) {
        doc.rect(50, y - 4, 495, 22).fill('#EDE9FF')
        doc.fillColor('#6C5CE7').font('Helvetica-Bold').fontSize(11)
        doc.text(line.trim(), 60, y, { width: 475 })
        y += 26
      } else {
        doc.fillColor('#2B2852').font('Helvetica').fontSize(9.5)
        const lineHeight = 14
        doc.text(line.trim(), 60, y, { width: 475, lineBreak: true })
        const textHeight = doc.heightOfString(line.trim(), { width: 475 })
        y += textHeight + 4
      }
    })

    // Footer
    doc.page.margins.bottom = 30
    const pageCount = doc.bufferedPageRange().count
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i)
      doc.fillColor('#B8B5D6').fontSize(8).font('Helvetica')
      doc.text(`Licter Brand Intelligence — Confidentiel — Page ${i + 1}/${pageCount}`, 50, 800, { align: 'center', width: 495 })
    }

    doc.end()
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message })
    }
  }
}
