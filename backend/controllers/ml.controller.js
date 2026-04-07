import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const BACKEND_DIR = path.join(__dirname, '..')
const SCRIPT_PATH = path.join(BACKEND_DIR, 'scripts', 'ml-enrich-tables.mjs')

let mlProcess = null
let mlState = {
  status: 'idle',
  startedAt: null,
  finishedAt: null,
  pid: null,
  lastSummary: null,
  lastScanSummary: null,
  lastScanAt: null,
  lastError: null,
  logs: [],
}

function asText(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function sanitizeLogLine(line) {
  const value = asText(line)
  if (!value) return null
  if (/^[\[\]\{\}]+$/.test(value)) return null
  if (value.startsWith('"')) return null
  if (value === ',' || value === '],' || value === '},') return null
  return value
}

function appendLogs(targetState, chunk) {
  const lines = String(chunk)
    .split(/\r?\n/)
    .map((line) => sanitizeLogLine(line))
    .filter(Boolean)

  if (!lines.length) return
  const nextLogs = [...(targetState.logs || [])]

  lines.forEach((line) => {
    if (nextLogs[nextLogs.length - 1] === line) return
    nextLogs.push(line)
  })

  targetState.logs = nextLogs.slice(-24)
}

function extractSummary(stdout) {
  const trimmed = asText(stdout)
  if (!trimmed) return null

  const jsonStart = trimmed.lastIndexOf('\n{')
  const candidate = jsonStart >= 0 ? trimmed.slice(jsonStart + 1) : (trimmed.startsWith('{') ? trimmed : '')
  if (!candidate) return null

  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

function buildArgs({ dryRun = false, concurrency = 15, preview = 0, tables = null } = {}) {
  const args = [SCRIPT_PATH, '--concurrency', String(concurrency), '--preview', String(preview)]
  if (dryRun) args.push('--dry-run')

  const tableList = Array.isArray(tables)
    ? tables.map((value) => asText(value)).filter(Boolean)
    : asText(tables).split(',').map((value) => value.trim()).filter(Boolean)

  if (tableList.length) {
    args.push('--tables', tableList.join(','))
  }

  return args
}

function executeMlCommand(options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, buildArgs(options), {
      cwd: BACKEND_DIR,
      env: process.env,
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', reject)
    child.on('close', (code) => {
      const summary = extractSummary(stdout)
      if (code === 0) {
        resolve({ code, stdout, stderr, summary })
        return
      }

      reject(new Error(asText(stderr) || asText(stdout) || `ML command failed with exit code ${code}`))
    })
  })
}

async function refreshScanIfNeeded(forceRefresh = false) {
  if (mlState.status === 'running') return mlState.lastScanSummary
  if (!forceRefresh && mlState.lastScanSummary) return mlState.lastScanSummary

  const result = await executeMlCommand({ dryRun: true, concurrency: 12, preview: 0 })
  mlState = {
    ...mlState,
    lastScanSummary: result.summary,
    lastScanAt: new Date().toISOString(),
    logs: [...(mlState.logs || [])].slice(-12),
  }
  return result.summary
}

function serializeMlState() {
  return {
    status: mlState.status,
    running: mlState.status === 'running',
    startedAt: mlState.startedAt,
    finishedAt: mlState.finishedAt,
    pid: mlState.pid,
    lastSummary: mlState.lastSummary,
    lastScanSummary: mlState.lastScanSummary,
    lastScanAt: mlState.lastScanAt,
    lastError: mlState.lastError,
    logs: mlState.logs || [],
  }
}

function buildCompletionLog(summary) {
  if (!summary) return 'ML local termine.'

  const updated = (summary.summary || []).reduce((total, item) => total + (item.updated || 0), 0)
  const touchedTables = (summary.summary || []).filter((item) => (item.updated || item.pending || item.failed || item.skipped) > 0).length
  const pendingRows = summary.pendingRows ?? 0

  return `ML termine: ${updated} lignes maj sur ${touchedTables} table${touchedTables > 1 ? 's' : ''}, ${pendingRows} ligne${pendingRows > 1 ? 's' : ''} encore detectee${pendingRows > 1 ? 's' : ''} au lancement.`
}

export async function getMlEnrichmentStatus(req, res) {
  const refresh = String(req.query.refresh || '') === '1'

  try {
    if (refresh) {
      await refreshScanIfNeeded(true)
    }
    res.json(serializeMlState())
  } catch (error) {
    res.status(500).json({
      ...serializeMlState(),
      error: error.message,
    })
  }
}

export async function runMlEnrichment(req, res) {
  if (mlProcess) {
    return res.status(409).json({
      error: 'Le machine learning local est deja en cours.',
      ...serializeMlState(),
    })
  }

  const tables = req.body?.tables

  try {
    await refreshScanIfNeeded(false)
  } catch {
    // A failed dry scan should not block the actual run.
  }

  const child = spawn(process.execPath, buildArgs({ concurrency: 15, preview: 0, tables }), {
    cwd: BACKEND_DIR,
    env: process.env,
    windowsHide: true,
  })

  mlProcess = child
  mlState = {
    ...mlState,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    pid: child.pid || null,
    lastError: null,
    logs: ['Demarrage du ML local...'],
  }

  let stdout = ''
  let stderr = ''

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString()
    stdout += text
    appendLogs(mlState, text)
  })

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    stderr += text
    appendLogs(mlState, text)
  })

  child.on('error', (error) => {
    mlProcess = null
    mlState = {
      ...mlState,
      status: 'error',
      finishedAt: new Date().toISOString(),
      pid: null,
      lastError: error.message,
    }
  })

  child.on('close', (code) => {
    const summary = extractSummary(stdout)
    mlProcess = null

    if (code === 0) {
      mlState = {
        ...mlState,
        status: 'completed',
        finishedAt: new Date().toISOString(),
        pid: null,
        lastSummary: summary,
        lastScanSummary: summary || mlState.lastScanSummary,
        lastScanAt: new Date().toISOString(),
        lastError: null,
        logs: [...(mlState.logs || []), buildCompletionLog(summary)].slice(-24),
      }
      return
    }

    mlState = {
      ...mlState,
      status: 'error',
      finishedAt: new Date().toISOString(),
      pid: null,
      lastError: asText(stderr) || asText(stdout) || `ML local en echec (code ${code})`,
    }
  })

  return res.json({
    success: true,
    message: 'Machine learning local lance.',
    ...serializeMlState(),
  })
}
