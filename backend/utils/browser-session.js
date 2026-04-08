import fs from 'node:fs'
import { execSync } from 'node:child_process'

let browserPromise = null
let cachedBrowser = null

const CHROME_PATHS = [
  process.env.CHROME_EXECUTABLE,
  '/root/.nix-profile/bin/chromium',
  '/nix/var/nix/profiles/default/bin/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/snap/bin/chromium',
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe` : null,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean)

export function findBrowserExecutable() {
  for (const candidate of CHROME_PATHS) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate
    } catch {}
  }

  for (const binary of ['chromium', 'chromium-browser', 'google-chrome', 'chrome', 'msedge']) {
    try {
      const resolved = execSync(`where ${binary}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
        .split(/\r?\n/)
        .map(line => line.trim())
        .find(Boolean)
      if (resolved && fs.existsSync(resolved)) return resolved
    } catch {}
  }

  return null
}

async function loadPuppeteer() {
  try {
    return await import('puppeteer-core')
  } catch {
    throw new Error('puppeteer-core manquant. Lancez `npm install` dans backend pour activer le scraping navigateur.')
  }
}

export function isServerlessEnv() {
  return Boolean(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.FUNCTION_NAME ||
    (process.env.HOME && process.env.HOME.startsWith('/var/task'))
  )
}

export async function getBrowser() {
  if (cachedBrowser?.connected) return cachedBrowser
  if (browserPromise) return browserPromise

  browserPromise = (async () => {
    if (isServerlessEnv()) {
      throw new Error('Le scraping Puppeteer (Google Reviews, Trustpilot) necessite un navigateur local et ne fonctionne pas en environnement serverless (Vercel). Utilisez les scrapers Apify (Twitter, TikTok, Facebook) ou lancez le scraping depuis votre machine locale.')
    }

    const executablePath = findBrowserExecutable()
    if (!executablePath) {
      throw new Error('Chrome ou Edge introuvable sur cette machine. Installez un navigateur Chromium pour activer le scraping direct.')
    }

    const puppeteerModule = await loadPuppeteer()
    const puppeteer = puppeteerModule.default || puppeteerModule
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ]
    })

    browser.on('disconnected', () => {
      cachedBrowser = null
      browserPromise = null
    })

    cachedBrowser = browser
    return browser
  })()

  try {
    return await browserPromise
  } catch (error) {
    browserPromise = null
    throw error
  }
}

export async function createBrowserPage({ language = 'fr-FR,fr;q=0.9,en;q=0.8' } = {}) {
  const browser = await getBrowser()
  const page = await browser.newPage()

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')
  await page.setViewport({ width: 1440, height: 1200 })
  await page.setExtraHTTPHeaders({ 'accept-language': language })
  page.setDefaultNavigationTimeout(45000)
  page.setDefaultTimeout(20000)

  return page
}

export async function closeBrowserPage(page) {
  if (!page) return
  try {
    await page.close()
  } catch {}
}

export async function closeBrowser() {
  if (!cachedBrowser) return
  try {
    await cachedBrowser.close()
  } catch {}
  cachedBrowser = null
  browserPromise = null
}
