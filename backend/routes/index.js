import { Router } from 'express'
import {
  scrapeTrustpilot,
  scrapeGoogleReviews,
  scrapeTwitter,
  getScrapingLogs
} from '../controllers/scraper.controller.js'
import {
  getScenarios,
  activateScenario,
  deactivateScenario,
  runScenario
} from '../controllers/make.controller.js'
import { generateComexPdf } from '../controllers/comex.controller.js'

const router = Router()

// Scraping
router.post('/scrape/trustpilot', scrapeTrustpilot)
router.post('/scrape/google-reviews', scrapeGoogleReviews)
router.post('/scrape/twitter', scrapeTwitter)
router.get('/scrape/logs', getScrapingLogs)

// Make.com
router.get('/make/scenarios', getScenarios)
router.post('/make/scenarios/:id/activate', activateScenario)
router.post('/make/scenarios/:id/deactivate', deactivateScenario)
router.post('/make/scenarios/:id/run', runScenario)

// COMEX Report
router.post('/comex/generate', generateComexPdf)

export default router
