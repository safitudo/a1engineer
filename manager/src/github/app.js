import { readFile } from 'fs/promises'
import { createPrivateKey, createSign } from 'crypto'

/**
 * GitHub App authentication for A1 Engineer.
 *
 * Generates short-lived installation tokens scoped to specific repos.
 * Tokens last 1 hour and are auto-refreshed by the Manager.
 *
 * Required env vars or config:
 *   GITHUB_APP_ID            — numeric App ID
 *   GITHUB_APP_PRIVATE_KEY   — PEM string (or path via GITHUB_APP_PRIVATE_KEY_PATH)
 *   GITHUB_INSTALLATION_ID   — numeric installation ID for the target org/repo
 */

// ── JWT generation (RS256) ──────────────────────────────────────────────────

function base64url(buf) {
  return Buffer.from(buf).toString('base64url')
}

function buildJWT(appId, privateKeyPem, ttlSeconds = 600) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: String(appId),
    iat: now - 60, // clock skew tolerance
    exp: now + ttlSeconds,
  }

  const segments = [
    base64url(JSON.stringify(header)),
    base64url(JSON.stringify(payload)),
  ]

  const signingInput = segments.join('.')
  const key = createPrivateKey(privateKeyPem)
  const sign = createSign('RSA-SHA256')
  sign.update(signingInput)
  const signature = sign.sign(key, 'base64url')

  return `${signingInput}.${signature}`
}

// ── Load private key ────────────────────────────────────────────────────────

async function loadPrivateKey(config = {}) {
  // 1. Direct PEM string from config or env
  if (config.privateKey) return config.privateKey
  if (process.env.GITHUB_APP_PRIVATE_KEY) return process.env.GITHUB_APP_PRIVATE_KEY

  // 2. Path to PEM file
  const keyPath = config.privateKeyPath || process.env.GITHUB_APP_PRIVATE_KEY_PATH
  if (keyPath) return readFile(keyPath, 'utf8')

  throw new Error(
    'GitHub App private key not found. Set GITHUB_APP_PRIVATE_KEY, ' +
    'GITHUB_APP_PRIVATE_KEY_PATH, or provide privateKey/privateKeyPath in config.'
  )
}

// ── Installation token ──────────────────────────────────────────────────────

/**
 * Generate a short-lived installation access token.
 *
 * @param {object} opts
 * @param {string|number} opts.appId          — GitHub App ID
 * @param {string|number} opts.installationId — Installation ID
 * @param {string}        [opts.privateKey]   — PEM string
 * @param {string}        [opts.privateKeyPath] — Path to PEM file
 * @param {object}        [opts.permissions]  — Optional permission scoping
 * @param {string[]}      [opts.repositories] — Optional repo name filter
 * @returns {Promise<{token: string, expiresAt: string}>}
 */
export async function createInstallationToken(opts) {
  const appId = opts.appId || process.env.GITHUB_APP_ID
  const installationId = opts.installationId || process.env.GITHUB_INSTALLATION_ID

  if (!appId) throw new Error('GitHub App ID is required (appId or GITHUB_APP_ID)')
  if (!installationId) throw new Error('Installation ID is required (installationId or GITHUB_INSTALLATION_ID)')

  const privateKey = await loadPrivateKey(opts)
  const jwt = buildJWT(appId, privateKey)

  // Exchange JWT for installation token
  const url = `https://api.github.com/app/installations/${installationId}/access_tokens`
  const body = {}
  if (opts.permissions) body.permissions = opts.permissions
  if (opts.repositories) body.repositories = opts.repositories

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GitHub API error ${res.status}: ${text}`)
  }

  const data = await res.json()
  return {
    token: data.token,
    expiresAt: data.expires_at,
  }
}

// ── Token cache with auto-refresh ───────────────────────────────────────────

const tokenCache = new Map() // installationId → { token, expiresAt }
const REFRESH_MARGIN_MS = 5 * 60 * 1000 // refresh 5 min before expiry

/**
 * Get a cached installation token, refreshing if near expiry.
 * Same signature as createInstallationToken.
 */
export async function getInstallationToken(opts) {
  const installationId = String(opts.installationId || process.env.GITHUB_INSTALLATION_ID)
  const cached = tokenCache.get(installationId)

  if (cached) {
    const expiresMs = new Date(cached.expiresAt).getTime()
    if (Date.now() < expiresMs - REFRESH_MARGIN_MS) {
      return cached
    }
  }

  const fresh = await createInstallationToken(opts)
  tokenCache.set(installationId, fresh)
  console.log(`[github] Token refreshed for installation ${installationId}, expires ${fresh.expiresAt}`)
  return fresh
}

/**
 * Clear the token cache (for testing or forced refresh).
 */
export function clearTokenCache() {
  tokenCache.clear()
}

// ── Convenience: resolve token for a team config ────────────────────────────

/**
 * Given a team config with a `github` section, return a fresh token.
 * Falls back to env vars if config fields are missing.
 *
 * @param {object} teamConfig — must have teamConfig.github with appId + installationId
 * @returns {Promise<string>} — the token string
 */
export async function resolveGitHubToken(teamConfig) {
  const gh = teamConfig.github
  if (!gh) {
    // No GitHub App config — fall back to GITHUB_TOKEN env var (PAT mode)
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
    return null
  }

  const { token } = await getInstallationToken({
    appId: gh.appId,
    installationId: gh.installationId,
    privateKey: gh.privateKey,
    privateKeyPath: gh.privateKeyPath,
  })
  return token
}
