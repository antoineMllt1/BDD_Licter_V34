import PDFDocument from 'pdfkit';
import { createWriteStream } from 'fs';

const stats = {
  reputation: { total: 779, negative: 778, positive: 0, crisisScore: 100 },
  benchmark: {
    sovFnac: 56, sovBoulanger: 44,
    fnacMentions: 1448, boulMentions: 1153,
    topTopics: [['conseil vendeur', 540], ['prix', 533], ['délais de livraison', 529], ['SAV', 514], ['garantie', 485]]
  },
  cx: { avgRating: '3.15', total: 1447, negative: 496, positive: 748,
    topCategories: [['garantie', 310], ['conseil vendeur', 298], ['prix', 285], ['SAV', 282], ['délais de livraison', 267]]
  }
};

const brand = 'Fnac Darty';
const dateRange = '12 derniers mois';

const sections = [
  {
    title: '1. RÉSUMÉ EXÉCUTIF',
    body: "L'analyse des données sur les 12 derniers mois révèle une situation préoccupante pour Fnac Darty sur l'ensemble des axes d'observation. Le score de crise atteint 100%, signalant une exposition réputationnelle critique avec 778 mentions négatives sur 779 analysées. En termes de benchmark concurrentiel, Fnac Darty maintient un avantage en volume de mentions avec 56% de share of voice face à Boulanger (44%), mais la qualité perçue demeure un axe de travail prioritaire. La note d'expérience client de 3,15/5 sur 1 447 avis consolidés confirme l'existence d'irritants structurels qui pénalisent la satisfaction globale. Des actions correctrices immédiates s'imposent sur les axes SAV, garantie et conseil vendeur, qui concentrent l'essentiel des insatisfactions."
  },
  {
    title: '2. ANALYSE RÉPUTATION & CRISE',
    body: "Le score de crise de 100% constitue un signal d'alerte maximal : sur les 779 mentions analysées, 778 présentent une tonalité négative. Cette quasi-absence de contenu positif organique indique soit une crise médiatique concentrée sur la période, soit un biais de déclaration où les consommateurs mécontents surexpriment leur insatisfaction sur les canaux monitorés. Le niveau de risque réputationnel est élevé et requiert une intervention immédiate.\n\nUn plan de réponse proactif est nécessaire : activation des relais positifs (clients ambassadeurs, prise de parole institutionnelle), revue des protocoles de gestion des incidents, et renforcement de la veille en temps réel. La concentration des thématiques négatives sur des sujets fonctionnels — SAV, garanties, délais de livraison — suggère que les défaillances opérationnelles sont à l'origine du décrochage réputationnel, et non une crise d'image pure. Cela constitue paradoxalement une opportunité : des actions correctrices ciblées peuvent produire un effet visible sur les indicateurs réputationnels dans un délai de 3 à 6 mois."
  },
  {
    title: '3. BENCHMARK MARCHÉ',
    body: "Fnac Darty conserve une position dominante en volume de mentions avec 56% de share of voice contre 44% pour Boulanger, sur un total de 2 601 mentions analysées. Cette supériorité volumétrique témoigne d'une empreinte médiatique et conversationnelle plus importante, mobilisable positivement dans une stratégie de reconquête.\n\nCependant, Boulanger affiche une structure de sentiment plus équilibrée (418 positifs / 466 négatifs, ratio 0,90) contre Fnac Darty (585 positifs / 539 négatifs, ratio 1,09), signalant une légère avance qualitative pour la marque challenger. Les cinq sujets les plus discutés — conseil vendeur (540), prix (533), délais de livraison (529), SAV (514), garantie (485) — sont quasi équitablement répartis, indiquant une conversation de marché mature et multidimensionnelle.\n\nFnac Darty dispose d'une marge de progression significative sur le conseil vendeur et les délais de livraison, deux axes où son positionnement premium devrait constituer un avantage différentiel face à un concurrent perçu comme plus accessible."
  },
  {
    title: '4. EXPÉRIENCE CLIENT',
    body: "La note moyenne de 3,15/5 sur 1 447 avis consolidés se situe en deçà du seuil de satisfaction solide (généralement établi à 3,5/5 dans le secteur retail spécialisé). Le ratio positifs/négatifs (748 vs 496) reste favorable mais la marge est insuffisante pour sécuriser la fidélisation à long terme.\n\nL'analyse par catégorie révèle cinq axes d'irritants principaux : la garantie (310 mentions), le conseil vendeur (298), le prix (285), le SAV (282) et les délais de livraison (267). La garantie en tête des catégories CX est particulièrement significative : elle traduit une rupture de confiance post-achat, souvent liée à des difficultés de mise en oeuvre des engagements contractuels. Le conseil vendeur en deuxième position interroge sur la formation et la disponibilité des équipes en magasin, pilier historique du positionnement Fnac Darty.\n\nCes deux irritants, combinés, fragilisent la proposition de valeur différenciante de la marque face au e-commerce pur. Un plan d'action sur l'expérience post-achat doit devenir une priorité de la feuille de route 2026."
  },
  {
    title: '5. RECOMMANDATIONS STRATÉGIQUES',
    body: "1. Refonte du parcours garantie et SAV. Déployer un portail digital unifié de gestion des garanties avec suivi en temps réel, objectif de réduction des contacts entrants de 30% en 6 mois. Budget estimé : 2-3M€. KPI cible : satisfaction SAV ≥ 4/5.\n\n2. Programme de montée en compétences conseil vendeur. Lancer un plan de formation intensif de 40h/an par vendeur centré sur l'expertise produit et la posture conseil, avec certification interne. Objectif : améliorer le NPS en magasin de +15 points en 12 mois. Investissement : 1,5M€.\n\n3. Stratégie de contenu positif et activation ambassadeurs. Structurer un programme de client advocacy (objectif 5 000 ambassadeurs actifs) pour rééquilibrer la balance réputationnelle. Mise en place d'un mécanisme de sollicitation systématique d'avis post-expérience positive. Cible : score de crise ≤ 25% à 12 mois.\n\n4. Optimisation logistique last-mile. Renégocier les SLAs livraison avec les partenaires transporteurs et étendre la couverture créneaux express J+1 à 80% du territoire. Objectif : réduire les mentions négatives délais de 40% en 9 mois. ROI estimé : impact direct sur le taux de réachat (+2 points).\n\n5. Repositionnement prix perçu. Mettre en place une communication proactive sur le rapport qualité-prix et les services inclus (garantie étendue, reprise, installation) pour contrer la perception de surcoût vs concurrents. Lancer des campagnes comparatives ciblées sur les segments premium. Objectif : améliorer le score prix perçu de +0,4 point sur l'indice satisfaction d'ici 6 mois."
  }
];

const outputPath = '/sessions/keen-cool-bohr/mnt/outputs/COMEX_FnacDarty_2026-04-01.pdf';
const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: { Title: `Rapport COMEX — ${brand}`, Author: 'Licter Intelligence' } });
const writeStream = createWriteStream(outputPath);
doc.pipe(writeStream);

// ── Cover page ──
doc.rect(0, 0, 595, 200).fill('#6C5CE7');
doc.fillColor('white').font('Helvetica-Bold').fontSize(28).text('RAPPORT COMEX', 50, 60, { width: 495 });
doc.fontSize(18).text('Brand & Market Intelligence', 50, 100, { width: 495 });
doc.fontSize(14).font('Helvetica').text(`${brand}  —  ${dateRange}`, 50, 132, { width: 495 });
doc.fontSize(10).text('Généré le 1 avril 2026', 50, 158, { width: 495 });
doc.fillColor('#E9E7F6').fontSize(9).text('Powered by Licter × Claude AI', 50, 178, { width: 495 });

// ── KPI Summary box ──
doc.rect(50, 215, 495, 95).fill('#F5F4FE');
doc.fillColor('#6C5CE7').font('Helvetica-Bold').fontSize(9).text('INDICATEURS CLÉS', 65, 228);

const kpis = [
  { value: `${stats.reputation.crisisScore}%`, label: 'Score de Crise', x: 65 },
  { value: `${stats.benchmark.sovFnac}%`, label: 'Share of Voice', x: 195 },
  { value: `${stats.cx.avgRating}/5`, label: 'Note CX Moyenne', x: 325 },
  { value: `${stats.cx.total + stats.reputation.total}`, label: 'Mentions totales', x: 455 }
];
kpis.forEach(k => {
  doc.fillColor('#2B2852').font('Helvetica-Bold').fontSize(22).text(k.value, k.x, 245, { width: 120 });
  doc.fillColor('#7B78A8').font('Helvetica').fontSize(8).text(k.label, k.x, 275, { width: 120 });
});

// ── Report sections ──
let currentY = 330;

sections.forEach((section) => {
  // Section header
  if (currentY > 730) { doc.addPage(); currentY = 50; }
  doc.rect(50, currentY - 4, 495, 24).fill('#EDE9FF');
  doc.fillColor('#6C5CE7').font('Helvetica-Bold').fontSize(11)
     .text(section.title, 60, currentY, { width: 475 });
  currentY += 30;

  // Section body paragraphs
  const paragraphs = section.body.split('\n\n');
  paragraphs.forEach(para => {
    if (!para.trim()) return;
    if (currentY > 740) { doc.addPage(); currentY = 50; }
    const h = doc.heightOfString(para.trim(), { width: 475, align: 'justify' });
    if (currentY + h > 780) { doc.addPage(); currentY = 50; }
    doc.fillColor('#2B2852').font('Helvetica').fontSize(9.5)
       .text(para.trim(), 60, currentY, { width: 475, align: 'justify', lineGap: 2 });
    currentY += h + 10;
  });
  currentY += 8;
});

// ── Footers on all pages ──
const range = doc.bufferedPageRange();
for (let i = 0; i < range.count; i++) {
  doc.switchToPage(range.start + i);
  doc.fillColor('#B8B5D6').fontSize(8).font('Helvetica')
     .text(`Licter Brand Intelligence  —  Confidentiel  —  Page ${i + 1}/${range.count}`,
           50, 815, { align: 'center', width: 495 });
}

doc.end();

await new Promise((resolve, reject) => {
  writeStream.on('finish', resolve);
  writeStream.on('error', reject);
});

console.log('PDF generated:', outputPath);
