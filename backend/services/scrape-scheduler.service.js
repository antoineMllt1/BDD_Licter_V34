import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scrapeTrustpilot, scrapeGoogleReviews } from '../controllers/scraper.controller.js'
import { scrapeTwitterApify } from '../controllers/twitter-apify.controller.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_DIR = path.join(__dirname, '..', 'data')
const CONFIG_PATH = path.join(DATA_DIR, 'scrape-schedule.json')

const DEFAULT_CONFIG = {
  enabled: false,
  intervalMinutes: 60,
  targetDb: 'scraping',
  scrapers: {
    trustpilot: { enabled: true, amount: 30, brand: 'fnac.com' },
    google: { enabled: true, amount: 30, query: 'Fnac Darty' },
    twitter: { enabled: true, amount: 50, searchTerm: 'Fnac Darty', target: 'reputation' },
  },
  lastRunAt: null
}

let state = null
let timer = null
let running = false

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function cloneConfig(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeConfig(input = {}) {
  const merged = {
    ...DEFAULT_CONFIG,
    ...input,
    scrapers: {
      trustpilot: { ...DEFAULT_CONFIG.scrapers.trustpilot, ...(input.scrapers?.trustpilot || {}) },
      google: { ...DEFAULT_CONFIG.scrapers.google, ...(input.scrapers?.google || {}) },
      twitter: { ...DEFAULT_CONFIG.scrapers.twitter, ...(input.scrapers?.twitter || {}) },
    }
  }

  merged.enabled = Boolean(merged.enabled)
  merged.intervalMinutes = Math.max(5, Math.min(1440, parseInt(merged.intervalMinutes, 10) || DEFAULT_CONFIG.intervalMinutes))
  merged.targetDb = ['scraping', 'competitor', 'csv'].includes(merged.targetDb) ? merged.targetDb : 'scraping'

  for (const scraper of Object.values(merged.scrapers)) {
    scraper.enabled = Boolean(scraper.enabled)
    scraper.amount = Math.max(1, Math.min(200, parseInt(scraper.amount, 10) || 30))
  }

  return merged
}

function persistConfig(config) {
  ensureDataDir()
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8')
}

function invokeHandler(handler, body) {
  return new Promise((resolve, reject) => {
    const req = { body }
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code
        return this
      },
      json(payload) {
        if (this.statusCode >= 400) reject(new Error(payload?.error || 'Scheduled scrape failed'))
        else resolve(payload)
      }
    }

    Promise.resolve(handler(req, res)).catch(reject)
  })
}

async function runEnabledScrapers() {
  if (!state?.enabled || running) return
  running = true

  try {
    const { targetDb, scrapers } = state

    if (scrapers.trustpilot.enabled) {
      await invokeHandler(scrapeTrustpilot, {
        brand: scrapers.trustpilot.brand,
        maxReviews: scrapers.trustpilot.amount,
        targetDb
      })
    }

    if (scrapers.google.enabled) {
      await invokeHandler(scrapeGoogleReviews, {
        query: scrapers.google.query,
        maxReviews: scrapers.google.amount,
        targetDb
      })
    }

    if (scrapers.twitter.enabled) {
      await invokeHandler(scrapeTwitterApify, {
        searchTerm: scrapers.twitter.searchTerm,
        maxItems: scrapers.twitter.amount,
        target: scrapers.twitter.target,
        targetDb
      })
    }

    state.lastRunAt = new Date().toISOString()
    persistConfig(state)
  } finally {
    running = false
  }
}

function clearSchedule() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function applySchedule() {
  clearSchedule()
  if (!state?.enabled) return

  timer = setInterval(() => {
    runEnabledScrapers().catch(err => {
      console.error('Scheduled scraping failed:', err.message)
    })
  }, state.intervalMinutes * 60 * 1000)
}

export function initializeScrapeScheduler() {
  ensureDataDir()
  if (fs.existsSync(CONFIG_PATH)) {
    state = normalizeConfig(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')))
  } else {
    state = normalizeConfig(DEFAULT_CONFIG)
    persistConfig(state)
  }

  applySchedule()
  return getScrapeSchedule()
}

export function getScrapeSchedule() {
  if (!state) initializeScrapeScheduler()
  return cloneConfig(state)
}

export function updateScrapeSchedule(nextConfig) {
  state = normalizeConfig({ ...state, ...nextConfig, scrapers: { ...state?.scrapers, ...nextConfig?.scrapers } })
  persistConfig(state)
  applySchedule()
  return getScrapeSchedule()
}

export async function runScrapeScheduleNow() {
  await runEnabledScrapers()
  return getScrapeSchedule()
}
