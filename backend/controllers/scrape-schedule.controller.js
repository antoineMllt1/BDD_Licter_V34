import {
  getScrapeSchedule,
  updateScrapeSchedule,
  runScrapeScheduleNow
} from '../services/scrape-scheduler.service.js'

export function fetchScrapeSchedule(req, res) {
  res.json(getScrapeSchedule())
}

export function saveScrapeSchedule(req, res) {
  res.json(updateScrapeSchedule(req.body || {}))
}

export async function triggerScrapeSchedule(req, res) {
  try {
    const schedule = await runScrapeScheduleNow()
    res.json({ success: true, schedule })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}
