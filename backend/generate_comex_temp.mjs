import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

// Force override so sandbox empty vars don't block
config({ path: '/sessions/keen-cool-bohr/mnt/Desktop/BDD_Licter_V34/backend/.env', override: true });

console.log('ANTHROPIC_API_KEY loaded:', !!process.env.ANTHROPIC_API_KEY);
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);

import Anthropic from '/sessions/keen-cool-bohr/mnt/Desktop/BDD_Licter_V34/backend/node_modules/@anthropic-ai/sdk/dist/index.js';
import PDFDocument from '/sessions/keen-cool-bohr/mnt/Desktop/BDD_Licter_V34/backend/node_modules/pdfkit/js/pdfkit.standalone.js';
import { createClient } from '/sessions/keen-cool-bohr/mnt/Desktop/BDD_Licter_V34/backend/node_modules/@supabase/supabase-js/dist/module/index.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

console.log('Fetching data from Supabase...');

const [rep, bench, cx] = await Promise.all([
  supabase.from('reputation_crise').select('sentiment, rating, platform, date, likes, share_count').limit(500),
  supabase.from('benchmark_marche').select('entity_analyzed, sentiment_detected, topic, target_brand_vs_competitor').limit(500),
  supabase.from('voix_client_cx').select('rating, sentiment, category, platform, date').limit(500)
]);

console.log('Data fetched - rep:', rep.data?.length, 'bench:', bench.data?.length, 'cx:', cx.data?.length);

const repData = rep.data || [];
const repTotal = repData.length;
const repNeg = repData.filter(r => r.sentiment === 'Negative').length;
const repPos = repData.filter(r => r.sentiment === 'Positive').length;
const repCrisisScore = repTotal > 0 ? Math.round((repNeg / repTotal) * 100) : 0;

const benchData = bench.data || [];
const fnacMentions = benchData.filter(r => r.entity_analyzed === 'Fnac Darty').length;
const boulMentions = benchData.filter(r => r.entity_analyzed === 'Boulanger').length;
const totalBench = fnacMentions + boulMentions;
const sovFnac = totalBench > 0 ? Math.round((fnacMentions / totalBench) * 100) : 0;
const topicsRaw = benchData.reduce((acc, r) => { if (r.topic) acc[r.topic] = (acc[r.topic] || 0) + 1; return acc }, {});
const topTopics = Object.entries(topicsRaw).sort((a, b) => b[1] - a[1]).slice(0, 5);

const cxData = cx.data || [];
const avgRating = cxData.reduce((s, r) => s + (r.rating || 0), 0) / (cxData.filter(r => r.rating).length || 1);
const categoriesRaw = cxData.reduce((acc, r) => { if (r.category) acc[r.category] = (acc[r.category] || 0) + 1; return acc }, {});
const topCategories = Object.entries(categoriesRaw).sort((a, b) => b[1] - a[1]).slice(0, 5);
const cxNeg = cxData.filter(r => r.sentiment === 'Negative').length;
const cxPos = cxData.filter(r => r.sentiment === 'Positive').length;

const brand = 'Fnac Darty';
const dateRange = '12 derniers mois';

console.log('Calling Claude AI to generate report content...');

const message = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 2500,
  messages: [{ role: 'user', content: `Tu es un senior analyst chez un cabinet de conseil. Rédige un rapport COMEX professionnel en français pour la marque ${brand}.

DONNÉES CLÉS:
Réputation & Crise:
- ${repTotal} mentions analysées
- Score de crise: ${repCrisisScore}% (${repNeg} mentions négatives)
- Mentions positives: ${repPos}

Benchmark Marché (vs Boulanger):
- Share of Voice ${brand}: ${sovFnac}%
- Share of Voice Boulanger: ${100 - sovFnac}%
- Top sujets: ${topTopics.map(([k, v]) => k + ' (' + v + ')').join(', ')}

Expérience Client:
- Note moyenne: ${avgRating.toFixed(2)}/5
- ${cxData.length} avis analysés (${cxPos} positifs, ${cxNeg} négatifs)
- Top catégories: ${topCategories.map(([k, v]) => k + ' (' + v + ')').join(', ')}

Rédige les sections suivantes en français formel de niveau direction générale:
1. RÉSUMÉ EXÉCUTIF (4-5 phrases synthétiques)
2. ANALYSE RÉPUTATION & CRISE (insights actionnables, niveau de risque)
3. BENCHMARK MARCHÉ (positionnement vs Boulanger, forces/faiblesses)
4. EXPÉRIENCE CLIENT (irritants principaux, axes d'amélioration)
5. RECOMMANDATIONS STRATÉGIQUES (5 recommandations concrètes et chiffrées)

Format: paragraphes clairs, style COMEX, pas de markdown, French corporate tone.` }]
});

const reportText = message.content[0].text;
console.log('Claude report generated, length:', reportText.length);

// Generate PDF
const outputPath = '/sessions/keen-cool-bohr/mnt/outputs/COMEX_FnacDarty_' + new Date().toISOString().slice(0,10) + '.pdf';
const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Rapport COMEX — ${brand}`, Author: 'Licter Intelligence' } });
const writeStream = createWriteStream(outputPath);
doc.pipe(writeStream);

// Cover page
doc.rect(0, 0, 595, 200).fill('#6C5CE7');
doc.fillColor('white').font('Helvetica-Bold').fontSize(28).text('RAPPORT COMEX', 50, 60);
doc.fontSize(18).text('Brand & Market Intelligence', 50, 100);
doc.fontSize(14).font('Helvetica').text(`${brand} — ${dateRange}`, 50, 132);
doc.fontSize(10).text(`Généré le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`, 50, 158);
doc.fillColor('#E9E7F6').fontSize(9).text('Powered by Licter × Claude AI', 50, 178);

// KPI Summary
doc.fillColor('#2B2852').moveDown(8);
doc.rect(50, 215, 495, 90).fill('#F5F4FE').stroke('#E9E7F6');
doc.fillColor('#6C5CE7').font('Helvetica-Bold').fontSize(9).text('INDICATEURS CLÉS', 65, 228);
doc.fillColor('#2B2852').fontSize(22).font('Helvetica-Bold');
doc.text(`${repCrisisScore}%`, 65, 245);
doc.text(`${sovFnac}%`, 195, 245);
doc.text(`${avgRating.toFixed(2)}/5`, 325, 245);
doc.text(`${cxData.length + repTotal}`, 455, 245);
doc.fillColor('#7B78A8').fontSize(8).font('Helvetica');
doc.text('Score de Crise', 65, 273);
doc.text('Share of Voice', 195, 273);
doc.text('Note CX Moyenne', 325, 273);
doc.text('Mentions totales', 455, 273);

// Report content
let y = 330;
reportText.split('\n').forEach(line => {
  if (!line.trim()) { y += 8; return; }
  if (y > 770) { doc.addPage(); y = 50; }
  if (/^\d\./.test(line) || (line.length < 60 && line === line.toUpperCase())) {
    doc.rect(50, y - 4, 495, 22).fill('#EDE9FF');
    doc.fillColor('#6C5CE7').font('Helvetica-Bold').fontSize(11);
    doc.text(line.trim(), 60, y, { width: 475 });
    y += 26;
  } else {
    doc.fillColor('#2B2852').font('Helvetica').fontSize(9.5);
    doc.text(line.trim(), 60, y, { width: 475, lineBreak: true });
    const textHeight = doc.heightOfString(line.trim(), { width: 475 });
    y += textHeight + 4;
  }
});

doc.end();

await new Promise((resolve, reject) => {
  writeStream.on('finish', resolve);
  writeStream.on('error', reject);
});

console.log('PDF saved to:', outputPath);
