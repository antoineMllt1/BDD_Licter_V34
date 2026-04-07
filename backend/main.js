import app from './app.js'
const { initializeScrapeScheduler } = await import('./services/scrape-scheduler.service.js')

const PORT = process.env.PORT || 3001

app.listen(PORT, () => {
  initializeScrapeScheduler()
  console.log(`Licter backend running on http://localhost:${PORT}`)
})
