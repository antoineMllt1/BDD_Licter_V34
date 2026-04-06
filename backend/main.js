import { config } from 'dotenv'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Support both project-root `.env` and `backend/.env`, with backend-local values overriding root ones.
config({ path: path.join(__dirname, '..', '.env') })
config({ path: path.join(__dirname, '.env'), override: true })

const { default: router } = await import('./routes/index.js')
const { initializeScrapeScheduler } = await import('./services/scrape-scheduler.service.js')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }))
app.use(express.json({ limit: '10mb' }))

app.use('/api', router)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.listen(PORT, () => {
  initializeScrapeScheduler()
  console.log(`Licter backend running on http://localhost:${PORT}`)
})
