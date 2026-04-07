export function decodeHtml(str) {
  return String(str || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
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

function textScore(text) {
  const t = ` ${text.toLowerCase()} `
  let score = Math.min(40, text.length / 10)

  const positiveSignals = [' je ', " j'", ' sav ', ' commande', ' livraison', ' vendeur', ' magasin', ' produit', ' achat', ' rembours', ' satisfait', ' déçu', ' probleme', ' problème', ' service client']
  const negativeSignals = [' sign in ', ' log in ', ' privacy policy ', ' terms of service ', ' create account ']

  score += positiveSignals.filter(token => t.includes(token)).length * 8
  score -= negativeSignals.filter(token => t.includes(token)).length * 25

  return score
}

function splitSegments(normalized) {
  return normalized
    .split(/\s+\.\.\.\s+|\s+\|\s+|(?=Posted by u\/)|(?=Et tu as un conseiller dédié)|(?=Ça m est déjà arrivé)|(?=J’ai une fois acheté)|(?=J'avais acheté)|(?=Le pire c'est)|(?=Bonjour[,!])/i)
    .map(segment => segment.trim())
    .filter(Boolean)
}

function selectBestSegment(str) {
  const normalized = decodeHtml(str)
    .replace(/\u00A0/g, ' ')
    .replace(/\b(?:fnac|darty|trustpilot)\.com\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const segments = splitSegments(normalized)
  if (segments.length <= 1) return normalized

  const viable = segments
    .filter(segment => segment.length >= 40)
    .map(segment => ({ segment, score: textScore(segment) }))
    .sort((a, b) => b.score - a.score)

  return viable[0]?.segment || normalized
}

export function cleanScrapedText(str) {
  let cleaned = selectBestSegment(str)

  for (const pattern of boilerplatePatterns) {
    cleaned = cleaned.replace(pattern, ' ')
  }

  return cleaned
    .replace(/\bcom\b/gi, ' ')
    .replace(/\s+[.,;:!?](?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isUsefulScrapedText(text) {
  if (!text || text.length < 20) return false

  const t = text.toLowerCase()
  const noise = [
    'sign in',
    'log in',
    'privacy policy',
    'terms of service',
    'cookie',
    'javascript',
    'create account',
    'comment laisser un avis',
    'how to leave a review',
    'write a review'
  ]

  if (noise.some(token => t.includes(token))) return false
  if ((text.match(/\.\.\./g) || []).length >= 2 && text.length > 320) return false

  const letterRatio = (text.match(/[a-zA-ZÀ-ÿ]/g) || []).length / text.length
  if (letterRatio < 0.45) return false

  return true
}

/**
 * Clean Twitter-specific noise from text
 */
export function cleanTweetText(str) {
  return String(str || '')
    .replace(/\u00A0/g, ' ')
    // Remove URLs
    .replace(/https?:\/\/t\.co\/\S+/gi, '')
    .replace(/https?:\/\/\S+/gi, '')
    // Remove RT prefix
    .replace(/^RT\s+@\w+:\s*/i, '')
    // Remove leading @mentions (reply chains like "@user1 @user2 actual text")
    .replace(/^(?:@\w+\s*)+/i, '')
    // Remove pic.twitter links
    .replace(/pic\.twitter\.com\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Detect if a "Boulanger" mention is about the retail brand vs actual bakeries.
 * Returns true if it looks like the brand, false if it's about real bakeries.
 */
export function isBoulangerBrand(text) {
  const t = (text || '').toLowerCase()

  // Strong brand signals — if any match, it's the brand
  const brandSignals = [
    'boulanger.com', 'boulanger.fr', '@boulanger', '#boulanger',
    'electromenager', 'électroménager', 'high-tech', 'hightech',
    'magasin boulanger', 'chez boulanger', 'site boulanger',
    'commande boulanger', 'livraison boulanger', 'sav boulanger',
    'acheté chez boulanger', 'achete chez boulanger',
    'tv', 'smartphone', 'ordinateur', 'lave-linge', 'lave linge',
    'frigo', 'réfrigérateur', 'refrigerateur', 'micro-onde',
    'aspirateur', 'machine à laver', 'machine a laver',
    'sèche-linge', 'seche-linge', 'four', 'plaque',
    'enceinte', 'casque', 'tablette', 'console',
    'fnac', 'darty', 'ldlc', 'cdiscount', 'amazon',
    'garantie', 'retour produit', 'service client',
    'marketplace', 'click and collect', 'click & collect',
    'vendeur en magasin', 'rayon', 'drive',
  ]

  if (brandSignals.some(s => t.includes(s))) return true

  // Strong bakery signals — if match and no brand signal, it's a real baker
  const bakerySignals = [
    'pain', 'baguette', 'croissant', 'patisserie', 'pâtisserie',
    'brioche', 'farine', 'levain', 'four à pain', 'fournil',
    'boulangerie', 'artisan boulanger', 'maître boulanger',
    'maitre boulanger', 'mon boulanger', 'notre boulanger',
    'petit boulanger', 'viennoiserie', 'pain au chocolat',
    'tradition', 'meilleur ouvrier', 'compagnon boulanger',
    'pétrir', 'petrir', 'levure', 'miche', 'tartine',
    'recette', 'gluten', 'blé', 'ble',
  ]

  if (bakerySignals.some(s => t.includes(s))) return false

  // Ambiguous — keep it (better to have false positives than miss brand mentions)
  return true
}
