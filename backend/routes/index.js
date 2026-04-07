import { Router } from 'express'
import {
  scrapeTrustpilot,
  scrapeGoogleReviews,
  getScrapingLogs,
  streamScrapeEvents
} from '../controllers/scraper.controller.js'
import { scrapeTwitterApify } from '../controllers/twitter-apify.controller.js'
import { scrapeTikTok } from '../controllers/tiktok-apify.controller.js'
import { scrapeFacebook } from '../controllers/facebook-apify.controller.js'
import {
  fetchScrapeSchedule,
  saveScrapeSchedule,
  triggerScrapeSchedule
} from '../controllers/scrape-schedule.controller.js'
import {
  getScenarios,
  activateScenario,
  deactivateScenario,
  runScenario,
  getScenarioProgress
} from '../controllers/make.controller.js'
import { generateComexPdf } from '../controllers/comex.controller.js'

const router = Router()

// Scraping
router.post('/scrape/trustpilot', scrapeTrustpilot)
router.post('/scrape/google-reviews', scrapeGoogleReviews)
router.post('/scrape/twitter', scrapeTwitterApify)
router.post('/scrape/tiktok', scrapeTikTok)
router.post('/scrape/facebook', scrapeFacebook)
router.get('/scrape/logs', getScrapingLogs)
router.get('/scrape/stream', streamScrapeEvents)
router.get('/scrape/schedule', fetchScrapeSchedule)
router.put('/scrape/schedule', saveScrapeSchedule)
router.post('/scrape/schedule/run', triggerScrapeSchedule)

// Make.com
router.get('/make/scenarios', getScenarios)
router.get('/make/scenarios/:id/progress', getScenarioProgress)
router.post('/make/scenarios/:id/activate', activateScenario)
router.post('/make/scenarios/:id/deactivate', deactivateScenario)
router.post('/make/scenarios/:id/run', runScenario)

// COMEX Report
router.post('/comex/generate', generateComexPdf)

export default router
