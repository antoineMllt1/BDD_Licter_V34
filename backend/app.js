import { config } from 'dotenv'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

config({ path: path.join(__dirname, '..', '.env') })
config({ path: path.join(__dirname, '.env'), override: true })

const { default: router } = await import('./routes/index.js')

const app = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.use('/api', router)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

export default app
