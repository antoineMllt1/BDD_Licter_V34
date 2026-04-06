import { closeBrowserPage, createBrowserPage } from '../utils/browser-session.js'
import { cleanScrapedText, decodeHtml, isUsefulScrapedText } from '../utils/scraper-cleaner.js'

const GOOGLE_CITY_SEEDS = [
  'Paris',
  'Lille',
  'Strasbourg',
  'Nancy',
  'Dijon',
  'Lyon',
  'Grenoble',
  'Marseille',
  'Nice',
  'Montpellier',
  'Toulouse',
  'Bordeaux',
  'Nantes',
  'Rennes',
  'Rouen',
  'Tours'
]
const GOOGLE_CITY_SEEDS_MASSIVE = [
  ...GOOGLE_CITY_SEEDS,
  'Le Havre',
  'Amiens',
  'Reims',
  'Metz',
  'Mulhouse',
  'Clermont-Ferrand',
  'Saint-Etienne',
  'Annecy',
  'Avignon',
  'Perpignan',
  'Nimes',
  'Bayonne',
  'Pau',
  'Limoges',
  'Poitiers',
  'Angers',
  'Brest',
  'Caen',
  'Orleans',
  'Besancon',
  'Toulon',
  'La Rochelle',
  'Valence'
]
const GOOGLE_CITY_ALIASES = [
  ['Boulogne', 'Boulogne-Billancourt'],
  ['Beaugrenelle', 'Paris'],
  ['Ternes', 'Paris'],
  ['Montparnasse', 'Paris'],
  ['Passy', 'Paris'],
  ['La Part Dieu', 'Lyon'],
  ['La Defense', 'Paris'],
  ['La Défense', 'Paris']
]

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeUiText(value) {
  return `${value || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function reportProgress(onProgress, payload) {
  onProgress?.(payload)
}

function parseRatingLabel(label) {
  const text = `${label || ''}`.replace(/,/g, '.')
  const match = text.match(/([1-5](?:\.\d)?)\s*(?:star|etoile|e?toile)/i)
    || text.match(/rated\s*([1-5](?:\.\d)?)/i)
    || text.match(/note\s*:?\s*([1-5](?:\.\d)?)/i)
  if (!match) return null
  const rating = Math.round(Number(match[1]))
  return Number.isFinite(rating) ? Math.max(1, Math.min(5, rating)) : null
}

function inferGoogleStoreCity(...values) {
  const text = values.filter(Boolean).join(' ')
  if (!text) return null

  const alias = GOOGLE_CITY_ALIASES.find(([needle]) => new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text))
  if (alias) return alias[1]

  return GOOGLE_CITY_SEEDS
    .sort((left, right) => right.length - left.length)
    .find(city => new RegExp(city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)) || null
}

function normalizeReviewDate(value, fallbackDate) {
  const raw = `${value || ''}`.trim()
  if (!raw) return fallbackDate || new Date().toISOString()

  const absoluteDate = new Date(raw)
  if (!Number.isNaN(absoluteDate.getTime())) return absoluteDate.toISOString()

  const normalized = raw
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/il y a\s+/g, '')
    .replace(/about\s+/g, '')
    .replace(/approximately\s+/g, '')
    .trim()

  const match = normalized.match(/(\d+|un|une|a|an)\s+(minute|minutes|heure|heures|hour|hours|jour|jours|day|days|semaine|semaines|week|weeks|mois|month|months|an|ans|year|years)/i)
  if (!match) return fallbackDate || new Date().toISOString()

  const amountToken = match[1]
  const amount = /^\d+$/.test(amountToken) ? Number(amountToken) : 1
  const unit = match[2].toLowerCase()
  const date = new Date()

  if (/minute/.test(unit)) date.setMinutes(date.getMinutes() - amount)
  else if (/heure|hour/.test(unit)) date.setHours(date.getHours() - amount)
  else if (/jour|day/.test(unit)) date.setDate(date.getDate() - amount)
  else if (/semaine|week/.test(unit)) date.setDate(date.getDate() - (amount * 7))
  else if (/mois|month/.test(unit)) date.setMonth(date.getMonth() - amount)
  else if (/an|year/.test(unit)) date.setFullYear(date.getFullYear() - amount)

  return date.toISOString()
}

function compactReviewToken(value) {
  return `${value || ''}`.toLowerCase().replace(/[^0-9a-z]/g, '').slice(0, 24)
}

function buildReviewSemanticKey(review = {}) {
  const textKey = `${review.text || ''}`.toLowerCase().replace(/\s+/g, ' ').trim()
  const dateKey = compactReviewToken(review.reviewDateOriginal || review.date || '')
  const storeKey = `${review.storeName || review.location || ''}`.toLowerCase().replace(/\s+/g, ' ').trim()
  return [textKey, dateKey, storeKey].filter(Boolean).join('|')
}

function normalizeReview(item, fallbackDate = null) {
  const text = cleanScrapedText(item?.text || '')
  if (!isUsefulScrapedText(text)) return null
  if (/^bonjour\b/i.test(text) && /cordialement|l['’]equipe|l['’]équipe/i.test(text)) return null

  return {
    author: decodeHtml(item?.author || '').trim() || null,
    text,
    rating: parseRatingLabel(item?.ratingLabel) ?? item?.rating ?? null,
    date: normalizeReviewDate(item?.date, fallbackDate),
    reviewDateOriginal: item?.date || null,
    location: item?.location || null,
    storeName: item?.storeName || null,
    storeAddress: item?.storeAddress || null,
    storeCity: item?.storeCity || null,
    sourceUrl: item?.sourceUrl || null
  }
}

async function dismissCommonBanners(page) {
  const labels = [
    'Tout accepter',
    'Accepter tout',
    'Accept all',
    'I agree',
    'J accepte',
    'J\'accepte',
    'OK'
  ]

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const clicked = await page.evaluate((buttonLabels) => {
      const norm = value => (value || '').toLowerCase().replace(/\s+/g, ' ').trim()
      const targets = buttonLabels.map(norm)
      const elements = [...document.querySelectorAll('button, [role="button"], input[type="button"]')]
      const candidate = elements.find(element => {
        const label = norm(element.innerText || element.getAttribute('aria-label') || element.value || '')
        return label && targets.some(target => label.includes(target))
      })
      if (candidate) {
        candidate.click()
        return true
      }
      return false
    }, labels)

    if (!clicked) break
    await wait(1000)
  }
}

async function clickHandleByMatcher(page, selector, matcher) {
  const handles = await page.$$(selector)
  for (const handle of handles) {
    const label = await page.evaluate(element => (
      `${element.innerText || element.getAttribute('aria-label') || element.getAttribute('title') || ''}`.trim()
    ), handle).catch(() => '')

    if (!matcher(label)) continue
    await handle.click().catch(() => {})
    return true
  }

  return false
}

async function acceptGoogleConsent(page) {
  const title = normalizeUiText(await page.title().catch(() => ''))
  const currentUrl = page.url()
  const isConsentPage = currentUrl.includes('consent.google.com')
    || title.includes("avant d'acceder a google")
    || title.includes('before you continue to google')
  if (!isConsentPage) return

  const navigationPromise = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null)
  const clicked = await clickHandleByMatcher(page, 'button, [role="button"]', label => {
    const normalized = normalizeUiText(label)
    return normalized.includes('tout accepter')
      || normalized.includes('accept all')
      || normalized.includes("j'accepte")
      || normalized.includes('i agree')
  })
  if (!clicked) {
    await clickHandleByMatcher(page, 'button, [role="button"]', label => {
      const normalized = normalizeUiText(label)
      return normalized.includes('tout refuser') || normalized.includes('reject all')
    })
  }
  await navigationPromise
  await wait(1500)

  if (page.url().includes('consent.google.com')) {
    throw new Error('Google Maps est reste bloque sur la page de consentement.')
  }
}
async function extractTrustpilotPage(page, url) {
  await page.goto(url, { waitUntil: 'networkidle2' })
  await dismissCommonBanners(page)
  await page.waitForSelector('body')
  await page.waitForFunction(() => document.querySelectorAll('article').length > 0, { timeout: 15000 }).catch(() => {})

  return page.evaluate(() => {
    const textSelectors = [
      '[data-service-review-text-typography]',
      'p[data-reviews-review-content="true"]',
      'p',
      'span'
    ]

    const getText = article => {
      const candidates = textSelectors
        .flatMap(selector => [...article.querySelectorAll(selector)])
        .map(node => (node.innerText || '').trim())
        .filter(text => text.length > 25)
        .sort((a, b) => b.length - a.length)

      return candidates[0] || ''
    }

    const getRatingLabel = article => {
      const nodes = [...article.querySelectorAll('[aria-label], img[alt]')]
      return nodes
        .map(node => node.getAttribute('aria-label') || node.getAttribute('alt') || '')
        .find(label => /rated|star|etoile|étoile|note/i.test(label)) || null
    }

    return [...document.querySelectorAll('article')].map(article => {
      const author =
        article.querySelector('[data-consumer-name-typography="true"]')?.innerText?.trim()
        || article.querySelector('aside a, header a, a[href*="/users/"]')?.innerText?.trim()
        || null

      const date =
        article.querySelector('time')?.getAttribute('datetime')
        || article.querySelector('time')?.innerText?.trim()
        || null

      return {
        author,
        date,
        text: getText(article),
        ratingLabel: getRatingLabel(article)
      }
    })
  })
}

export async function scrapeTrustpilotDirect({ brand, maxReviews = 30, massive = false, onProgress = null, excludeTextKeys = null }) {
  const perPage = 20
  const exclusionPadding = excludeTextKeys?.size ? (massive ? 12 : 6) : 0
  const maxPages = Math.max(1, Math.ceil(maxReviews / perPage) + (massive ? 3 : 1) + exclusionPadding)
  const hardMaxPages = excludeTextKeys?.size ? maxPages + (massive ? 35 : 25) : maxPages
  const fallbackDate = new Date().toISOString()
  const collected = []
  const seen = new Set()
  const stats = {
    extracted: 0,
    kept: 0,
    skippedExisting: 0,
    skippedInRun: 0,
    skippedInvalid: 0
  }
  const page = await createBrowserPage()

  try {
    let pagesWithoutNew = 0

    for (let pageIndex = 1; pageIndex <= hardMaxPages && collected.length < maxReviews; pageIndex += 1) {
      const url = pageIndex === 1
        ? `https://fr.trustpilot.com/review/${brand}`
        : `https://fr.trustpilot.com/review/${brand}?page=${pageIndex}`

      const collectedBeforePage = collected.length
      reportProgress(onProgress, {
        message: `Trustpilot page ${pageIndex}/${hardMaxPages} en cours`,
        pageIndex,
        url
      })
      const reviews = await extractTrustpilotPage(page, url)
      if (!reviews.length) break
      stats.extracted += reviews.length

      for (const review of reviews) {
        const normalized = normalizeReview(review, fallbackDate)
        if (!normalized) {
          stats.skippedInvalid += 1
          continue
        }
        const externalKey = buildReviewSemanticKey(normalized)
        if (excludeTextKeys?.has(externalKey)) {
          stats.skippedExisting += 1
          reportProgress(onProgress, {
            message: 'Avis Trustpilot deja present en base, poursuite des pages',
            level: 'info',
            preview: normalized.text.slice(0, 140)
          })
          continue
        }
        const key = buildReviewSemanticKey(normalized)
        if (seen.has(key)) {
          stats.skippedInRun += 1
          continue
        }
        seen.add(key)
        collected.push(normalized)
        stats.kept += 1
        reportProgress(onProgress, {
          message: `Avis Trustpilot retenu (${collected.length}/${maxReviews})`,
          level: 'success',
          count: collected.length,
          preview: normalized.text.slice(0, 140)
        })
        if (collected.length >= maxReviews) break
      }

      if (collected.length === collectedBeforePage) {
        pagesWithoutNew += 1
        if (excludeTextKeys?.size && pageIndex < hardMaxPages && pagesWithoutNew < 4) {
          reportProgress(onProgress, {
            message: 'Trustpilot: aucun nouvel avis sur cette page, on cherche plus loin',
            level: 'info',
            pageIndex
          })
        }
      } else {
        pagesWithoutNew = 0
      }

      if (pagesWithoutNew >= (excludeTextKeys?.size ? 6 : 2)) break
    }

    return { reviews: collected, stats }
  } finally {
    await closeBrowserPage(page)
  }
}

async function ensureGooglePlaceOpen(page) {
  await page.waitForSelector('body')
  await dismissCommonBanners(page)
  await wait(1500)

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reviewCount = await page.evaluate(() => document.querySelectorAll('div[data-review-id]').length).catch(() => 0)
    if (reviewCount > 0) return

    const openedReviews = await clickHandleByMatcher(page, 'button, [role="button"]', label => /plus d'avis|avis|reviews/i.test(label))
    if (openedReviews) {
      await wait(2000)
      const refreshedReviewCount = await page.evaluate(() => document.querySelectorAll('div[data-review-id]').length).catch(() => 0)
      if (refreshedReviewCount > 0) return
    }

    const openedPlace = await clickHandleByMatcher(page, '[role="article"], a[href*="/place/"]', label => /fnac|darty/i.test(label) || !label)
    if (openedPlace) {
      await wait(3000)
      await clickHandleByMatcher(page, 'button, [role="button"]', label => /\bavis\b|reviews/i.test(label))
      await wait(2000)
    }
  }
}

function buildGoogleSearchTerms(query, massive = false) {
  const cleanedQuery = `${query || ''}`.trim()
  if (!cleanedQuery) return []

  const cities = massive ? GOOGLE_CITY_SEEDS_MASSIVE : GOOGLE_CITY_SEEDS
  if (/fnac|darty/i.test(cleanedQuery)) {
    return cities.map(city => `${cleanedQuery} ${city}`)
  }

  return [cleanedQuery]
}

async function openGoogleSearch(page, term) {
  await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(term)}?hl=fr`, { waitUntil: 'networkidle2' })
  await acceptGoogleConsent(page)
  await dismissCommonBanners(page)
  await wait(1500)
}

async function listRelevantPlaceLabels(page, query) {
  const tokens = `${query || ''}`.toLowerCase().split(/\s+/).filter(token => token.length > 2)
  const handles = await page.$$('[role="article"], a[href*="/place/"]')
  const labels = []

  for (const handle of handles) {
    const label = await page.evaluate(element => (
      `${element.innerText || element.getAttribute('aria-label') || ''}`.trim()
    ), handle).catch(() => '')

    const normalized = label.toLowerCase()
    if (!normalized) continue
    if (tokens.length && !tokens.some(token => normalized.includes(token))) continue
    labels.push(label)
  }

  return labels
}

async function openRelevantPlaceAtIndex(page, query, targetIndex = 0) {
  const tokens = `${query || ''}`.toLowerCase().split(/\s+/).filter(token => token.length > 2)
  const handles = await page.$$('[role="article"], a[href*="/place/"]')
  let matchIndex = 0

  for (const handle of handles) {
    const label = await page.evaluate(element => (
      `${element.innerText || element.getAttribute('aria-label') || ''}`.trim()
    ), handle).catch(() => '')

    const normalized = label.toLowerCase()
    if (!normalized) continue
    if (tokens.length && !tokens.some(token => normalized.includes(token))) continue

    if (matchIndex !== targetIndex) {
      matchIndex += 1
      continue
    }

    await handle.click().catch(() => {})
    await wait(3000)
    await clickHandleByMatcher(page, 'button, [role="button"]', text => /\bavis\b|reviews|plus d'avis/i.test(text))
    await wait(2000)
    return true
  }

  return false
}

async function extractGooglePlaceDetails(page) {
  const sourceUrl = page.url()
  const pageTitle = await page.title().catch(() => '')
  const placeName = pageTitle.replace(/\s*-\s*Google\s*Maps\s*$/i, '').trim() || null
  const address = await page.evaluate(() => {
    return document.querySelector('button[aria-label^="Adresse:"]')?.getAttribute('aria-label')?.replace(/^Adresse:\s*/i, '').trim()
      || [...document.querySelectorAll('[aria-label]')].map(node => node.getAttribute('aria-label')).find(value => /^Adresse:/i.test(value || ''))?.replace(/^Adresse:\s*/i, '').trim()
      || null
  }).catch(() => null)

  return {
    sourceUrl,
    placeName,
    address,
    storeCity: address?.split(',').pop()?.trim() || null,
    location: [placeName, address].filter(Boolean).join(' — ') || placeName || null
  }
}

async function expandGoogleReviewTexts(page) {
  await page.evaluate(() => {
    const controls = [...document.querySelectorAll('button, [role="button"]')]
    controls
      .filter(node => /plus|more/i.test(node.innerText || node.getAttribute('aria-label') || ''))
      .slice(0, 60)
      .forEach(node => node.click())
  }).catch(() => {})
}

async function scrollGoogleReviews(page, maxReviews) {
  let stagnant = 0
  let previousCount = 0

  for (let i = 0; i < 18 && stagnant < 3; i += 1) {
    await expandGoogleReviewTexts(page)
    const count = await page.evaluate(() => document.querySelectorAll('div[data-review-id]').length)
    if (count >= maxReviews) break

    await page.evaluate(() => {
      const containers = [...document.querySelectorAll('div.m6QErb[aria-label], div[role="main"] div[aria-label]')]
      const target = containers
        .sort((left, right) => right.scrollHeight - left.scrollHeight)
        .find(node => node.scrollHeight > node.clientHeight)
      if (target) target.scrollTop = target.scrollHeight
    }).catch(() => {})

    await wait(1400)
    const refreshedCount = await page.evaluate(() => document.querySelectorAll('div[data-review-id]').length)
    if (refreshedCount <= previousCount) stagnant += 1
    else stagnant = 0
    previousCount = refreshedCount
  }
}

async function extractGoogleReviews(page) {
  return page.evaluate(() => {
    const placeName =
      [...document.querySelectorAll('h1, h2, h3, button[aria-label], [role="tab"]')]
        .map(node => (node.innerText || node.getAttribute('aria-label') || '').trim())
        .find(text => text.length > 2 && text.length < 90 && /fnac|darty/i.test(text) && !/^avis$|^results?$|^résultats?$/i.test(text))
      || null

    const address =
      document.querySelector('button[aria-label^="Adresse:"]')?.getAttribute('aria-label')?.replace(/^Adresse:\s*/i, '').trim()
      || [...document.querySelectorAll('[aria-label]')].map(node => node.getAttribute('aria-label')).find(value => /^Adresse:/i.test(value || ''))?.replace(/^Adresse:\s*/i, '').trim()
      || null

    const location = [placeName, address].filter(Boolean).join(' — ') || null

    const pickLongest = nodes => nodes
      .map(node => (node.innerText || '').trim())
      .map(text => text.replace(/\bPlus$/i, '').trim())
      .filter(text => !/^bonjour\b/i.test(text) && !/reponse du proprietaire|owner response|cordialement|l['’']equipe|l['’']équipe/i.test(text))
      .filter(text => text.length > 15)
      .sort((a, b) => b.length - a.length)[0] || ''

    return [...document.querySelectorAll('div[data-review-id]')]
      .filter(node => !node.parentElement?.closest('div[data-review-id]'))
      .map(node => {
      const author =
        node.querySelector('.d4r55')?.innerText?.trim()
        || node.querySelector('button[aria-label]')?.getAttribute('aria-label')?.trim()
        || null

      const ratingLabel =
        node.querySelector('span[role="img"][aria-label*="star"], span[role="img"][aria-label*="etoile"], span[role="img"][aria-label*="étoile"]')?.getAttribute('aria-label')
        || null

      const date =
        node.querySelector('.rsqaWe')?.innerText?.trim()
        || [...node.querySelectorAll('span')].map(el => el.innerText?.trim()).find(text => /\b(?:jour|jours|semaine|semaines|mois|an|ans|day|days|week|weeks|month|months|year|years)\b/i.test(text || ''))
        || null

      const text = pickLongest([
        ...node.querySelectorAll('.wiI7pd, .MyEned, [data-expandable-section] span')
      ])

      return { author, ratingLabel, date, text, location }
    })
  })
}

export async function scrapeGoogleReviewsDirect({ query, maxReviews = 30, massive = false, onProgress = null, excludeTextKeys = null }) {
  const page = await createBrowserPage()
  const fallbackDate = new Date().toISOString()
  const stats = {
    extracted: 0,
    kept: 0,
    skippedExisting: 0,
    skippedInRun: 0,
    skippedInvalid: 0,
    storesVisited: 0
  }

  try {
    const seen = new Set()
    const collected = []
    const seenStores = new Set()
    const searchTerms = buildGoogleSearchTerms(query, massive || Boolean(excludeTextKeys?.size))
    const maxPlaceCandidatesPerTerm = excludeTextKeys?.size ? (massive ? 4 : 3) : 1

    for (let index = 0; index < searchTerms.length && collected.length < maxReviews; index += 1) {
      const term = searchTerms[index]
      const seededCity = GOOGLE_CITY_SEEDS.find(city => term.endsWith(city)) || null
      reportProgress(onProgress, {
        message: `Recherche Google ${index + 1}/${searchTerms.length}: ${term}`,
        searchTerm: term,
        city: seededCity
      })
      try {
        await openGoogleSearch(page, term)
      } catch (error) {
        reportProgress(onProgress, {
          message: `Google Maps bloque la recherche ${term}: ${error.message}`,
          level: 'error',
          searchTerm: term,
          city: seededCity
        })
        throw error
      }

      const candidateLabels = await listRelevantPlaceLabels(page, query)
      if (!candidateLabels.length) {
        await ensureGooglePlaceOpen(page)
      }

      for (let candidateIndex = 0; candidateIndex < maxPlaceCandidatesPerTerm && collected.length < maxReviews; candidateIndex += 1) {
        if (candidateIndex > 0) {
          await openGoogleSearch(page, term)
        }

        const opened = await openRelevantPlaceAtIndex(page, query, candidateIndex)
        if (!opened) {
          if (candidateIndex === 0) {
            await ensureGooglePlaceOpen(page)
          }
          break
        }

        const details = await extractGooglePlaceDetails(page)
        if (!details.placeName) {
          reportProgress(onProgress, {
            message: `Aucun magasin exploitable trouve pour ${term}`,
            level: 'error',
            searchTerm: term,
            city: seededCity
          })
          break
        }
        const resolvedStoreCity = inferGoogleStoreCity(details.placeName, details.address) || details.storeCity || seededCity
        const storeIdentity = [details.placeName, resolvedStoreCity || details.address || term]
          .filter(Boolean)
          .join('|')
          .toLowerCase()
        if (seenStores.has(storeIdentity)) {
          reportProgress(onProgress, {
            message: `${details.placeName}: magasin deja traite, passage au suivant`,
            level: 'info',
            storeName: details.placeName,
            storeCity: resolvedStoreCity || seededCity
          })
          continue
        }
        seenStores.add(storeIdentity)
        stats.storesVisited += 1
        reportProgress(onProgress, {
          message: `Magasin trouve: ${details.placeName}${resolvedStoreCity ? ` (${resolvedStoreCity})` : ''}`,
          level: 'success',
          storeName: details.placeName,
          storeCity: resolvedStoreCity
        })

        const remaining = maxReviews - collected.length
        const remainingSearches = Math.max(1, searchTerms.length - index)
        const targetForStore = Math.max(massive ? 4 : 2, Math.min(massive ? 14 : 6, Math.ceil(remaining / remainingSearches)))
        let retainedForStore = 0
        const storeSeenCandidates = new Set()
        const maxRounds = excludeTextKeys?.size ? (massive ? 7 : 6) : 1
        const initialLoadTarget = excludeTextKeys?.size
          ? Math.min(massive ? 48 : 24, Math.max(targetForStore * 5, targetForStore + 12))
          : targetForStore
        const hardReviewLoadTarget = excludeTextKeys?.size ? (massive ? 140 : 70) : targetForStore

        for (let round = 0; round < maxRounds && retainedForStore < targetForStore && collected.length < maxReviews; round += 1) {
          const reviewLoadTarget = excludeTextKeys?.size
            ? Math.min(hardReviewLoadTarget, initialLoadTarget + round * (massive ? 14 : 8))
            : targetForStore

          await scrollGoogleReviews(page, reviewLoadTarget)
          const rawReviews = await extractGoogleReviews(page)
          if (!rawReviews.length) {
            reportProgress(onProgress, {
              message: `${details.placeName}: aucun avis detecte dans le panneau Google Maps`,
              level: 'error',
              storeName: details.placeName,
              storeCity: resolvedStoreCity
            })
            break
          }
          stats.extracted += rawReviews.length
          const retainedBeforeRound = retainedForStore

          for (const review of rawReviews) {
            const normalized = normalizeReview({
              ...review,
              location: details.location,
              storeName: details.placeName,
              storeAddress: details.address,
              storeCity: resolvedStoreCity,
              sourceUrl: details.sourceUrl
            }, fallbackDate)
            if (!normalized) {
              stats.skippedInvalid += 1
              continue
            }

            const candidateKey = buildReviewSemanticKey(normalized)
            if (storeSeenCandidates.has(candidateKey)) continue
            storeSeenCandidates.add(candidateKey)

            const externalKey = candidateKey
            if (excludeTextKeys?.has(externalKey)) {
              stats.skippedExisting += 1
              reportProgress(onProgress, {
                message: `${details.placeName}: avis deja present en base, on cherche plus loin`,
                level: 'info',
                storeName: details.placeName,
                preview: normalized.text.slice(0, 140)
              })
              continue
            }

            const key = `${details.placeName}-${candidateKey}`
            if (seen.has(key)) {
              stats.skippedInRun += 1
              continue
            }
            seen.add(key)
            collected.push(normalized)
            stats.kept += 1
            retainedForStore += 1
            reportProgress(onProgress, {
              message: `${details.placeName}: avis retenu (${collected.length}/${maxReviews})`,
              level: 'success',
              count: collected.length,
              storeName: details.placeName,
              preview: normalized.text.slice(0, 140)
            })
            if (collected.length >= maxReviews) break
            if (retainedForStore >= targetForStore) break
          }

          if (retainedForStore === retainedBeforeRound && round < maxRounds - 1 && excludeTextKeys?.size) {
            reportProgress(onProgress, {
              message: `${details.placeName}: pas assez de nouveaux avis pour l'instant, on charge plus loin`,
              level: 'info',
              storeName: details.placeName,
              storeCity: resolvedStoreCity
            })
          }
        }

        if (retainedForStore === 0) {
          reportProgress(onProgress, {
            message: `${details.placeName}: avis trouves mais aucun texte utile apres nettoyage`,
            level: 'error',
            storeName: details.placeName,
            storeCity: resolvedStoreCity
          })
        }
      }
    }

    return { reviews: collected, stats }
  } finally {
    await closeBrowserPage(page)
  }
}
