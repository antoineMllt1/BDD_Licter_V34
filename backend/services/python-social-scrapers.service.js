import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const BACKEND_DIR = path.join(__dirname, '..')
const SCRIPTS_DIR = path.join(BACKEND_DIR, 'scripts', 'social_scrapers')

function resolvePythonExecutable() {
  const venvPython = path.join(BACKEND_DIR, '.venv', 'Scripts', 'python.exe')
  if (fs.existsSync(venvPython)) return venvPython
  return process.env.PYTHON_EXECUTABLE || 'python'
}

function runPythonJsonScript(scriptName, payload) {
  const pythonExecutable = resolvePythonExecutable()
  const scriptPath = path.join(SCRIPTS_DIR, scriptName)

  return new Promise((resolve, reject) => {
    const child = spawn(pythonExecutable, [scriptPath], {
      cwd: BACKEND_DIR,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })

    child.on('error', error => {
      reject(new Error(`Impossible de lancer ${scriptName}: ${error.message}`))
    })

    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `${scriptName} a quitte avec le code ${code}`))
        return
      }

      try {
        resolve(JSON.parse(stdout || '[]'))
      } catch (error) {
        reject(new Error(`Sortie JSON invalide pour ${scriptName}: ${error.message}`))
      }
    })

    child.stdin.write(JSON.stringify(payload || {}))
    child.stdin.end()
  })
}

export function runTwikitSearch({ searchTerm, maxItems = 50 }) {
  return runPythonJsonScript('twitter_twikit.py', { searchTerm, maxItems })
}

export function runRedditUrsSearch({ query, maxItems = 30 }) {
  return runPythonJsonScript('reddit_urs.py', { query, maxItems })
}
