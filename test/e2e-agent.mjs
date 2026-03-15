#!/usr/bin/env node
/**
 * test/e2e-agent.mjs — Level B end-to-end test: real agent + real GitHub PR
 *
 * Spins up a full team via the Manager API, sends the agent a task over IRC,
 * waits for the agent to open a PR in safitudo/a1-test-repo, then tears down.
 *
 * Credential loading (layered — no single env var required):
 *   SESSION_TOKEN      — Claude Max session token (env or ROOT/.env). Takes
 *                        priority: sets testapp.json auth.mode to "session".
 *   ANTHROPIC_API_KEY  — Claude API key fallback (env or ROOT/.env); uses
 *                        testapp.json auth.mode "api-key" (the default).
 *   Graceful skip      — exit 0 if NEITHER SESSION_TOKEN nor ANTHROPIC_API_KEY
 *                        is found. CI injects via env var; local devs use .env.
 *   GitHub token       — after team creation, read from team dir's github_token.txt
 *                        (written by Manager when it resolves GitHub App creds from
 *                        testapp.json). Falls back to GITHUB_TOKEN env / ROOT/.env.
 *   GitHub App creds   — provided via testapp.json (appId, installationId,
 *                        privateKeyPath). Manager resolves these automatically.
 *
 * Prerequisites (skipped gracefully if absent):
 *   SESSION_TOKEN or ANTHROPIC_API_KEY — Claude auth (env or ROOT/.env)
 *   Docker daemon       — running and accessible
 *
 * Exit codes:
 *   0 = all assertions passed (or prerequisites absent → graceful skip)
 *   1 = setup / config failure
 *   3 = agent timeout or PR not found within limit
 *
 * Usage:
 *   node test/e2e-agent.mjs [configs/testapp.json]
 *
 * Run from repo root or any directory — paths are resolved relative to this file.
 */

import { spawn, execSync }         from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { createServer, connect }   from 'node:net'
import { fileURLToPath }           from 'node:url'
import { resolve, dirname, join }  from 'node:path'
import { setTimeout as sleep }     from 'node:timers/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)
const ROOT       = resolve(__dirname, '..')

// ── Colours ───────────────────────────────────────────────────────────────────
const G  = '\x1b[0;32m'
const R  = '\x1b[0;31m'
const Y  = '\x1b[1;33m'
const C  = '\x1b[0;36m'
const RS = '\x1b[0m'

const pass = (label, msg)           => console.log(`${G}[PASS]${RS} ${label} — ${msg}`)
const fail = (label, msg, code = 1) => { console.error(`${R}[FAIL]${RS} ${label} — ${msg}`); process.exitCode = code; throw new Error(msg) }
const info = (msg)                  => console.log(`${C}[INFO]${RS} ${msg}`)
const warn = (msg)                  => console.warn(`${Y}[WARN]${RS} ${msg}`)

// ── Dotenv parser (ESM-safe, no external deps) ────────────────────────────────
// Reads a .env file and returns key=value pairs. Handles quotes and inline
// comments. Returns {} if the file is absent or unreadable.

function parseDotenv(filePath) {
  const result = {}
  let raw
  try { raw = readFileSync(filePath, 'utf8') } catch { return result }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    // Strip inline comments (space + #)
    const commentIdx = val.search(/ +#/)
    if (commentIdx > -1) val = val.slice(0, commentIdx).trim()
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    result[key] = val
  }
  return result
}

// ── Credential loading ────────────────────────────────────────────────────────
// Precedence: process.env → root .env file → graceful skip / team-dir file

const rootEnv = parseDotenv(join(ROOT, '.env'))

// Auth: SESSION_TOKEN takes priority (Claude Max / local dev).
// Fallback: ANTHROPIC_API_KEY (standard API key / CI).
const SESSION_TOKEN     = process.env.SESSION_TOKEN     || rootEnv.SESSION_TOKEN     || ''
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || rootEnv.ANTHROPIC_API_KEY || ''

if (!SESSION_TOKEN && !ANTHROPIC_API_KEY) {
  warn('Neither SESSION_TOKEN nor ANTHROPIC_API_KEY set (checked process.env and ROOT/.env) — skipping Level B e2e test')
  process.exit(0)
}

// GitHub token: resolved after team creation from github_token.txt written by
// Manager; PAT fallback for local dev without GitHub App config.
let githubToken = process.env.GITHUB_TOKEN || rootEnv.GITHUB_TOKEN || null

// Docker check
try {
  execSync('docker info', { stdio: 'ignore' })
} catch {
  warn('Docker not available — skipping Level B e2e test')
  process.exit(0)
}

// ── Config ────────────────────────────────────────────────────────────────────

const configArg  = process.argv[2] ?? 'configs/testapp.json'
const configPath = resolve(ROOT, configArg)

if (!existsSync(configPath)) {
  console.error(`${R}Config not found: ${configPath}${RS}`)
  process.exit(1)
}

// Use the full config — Manager resolves GitHub App creds from appId /
// installationId / privateKeyPath and writes github_token.txt to the team dir.
const teamConfig = JSON.parse(readFileSync(configPath, 'utf8'))

// Override auth mode based on available credentials.
// SESSION_TOKEN wins (Claude Max session, Stan's local machine path).
// ANTHROPIC_API_KEY keeps the testapp.json default of "api-key".
if (SESSION_TOKEN) {
  teamConfig.auth ??= {}
  teamConfig.auth.mode = 'session'
  info('Auth mode: session (SESSION_TOKEN present)')
} else {
  info('Auth mode: api-key (ANTHROPIC_API_KEY present)')
}

const TIMESTAMP   = Date.now()
const TASK_FILE   = `test-e2e-${TIMESTAMP}.txt`
const GITHUB_REPO = 'safitudo/a1-test-repo'
const E2E_API_KEY = `e2e-test-key-${TIMESTAMP}`

const IRC_HOST_PORT = teamConfig.ergo?.hostPort ?? null

// ── Mutable state (for cleanup) ───────────────────────────────────────────────

let managerProc    = null
let managerPort    = 0
let teamId         = null
let agentId        = null
let composeFile    = null
let createdPrNumber = null
let checkerProc    = null

// ── Cleanup ───────────────────────────────────────────────────────────────────

async function cleanup() {
  info('Running cleanup…')

  // Kill IRC observer if still running
  if (checkerProc) {
    try { checkerProc.kill() } catch { /* ignore */ }
    checkerProc = null
  }

  // Close PR if opened
  if (createdPrNumber) {
    try {
      await githubApi(`repos/${GITHUB_REPO}/pulls/${createdPrNumber}`, 'PATCH', { state: 'closed' })
      info(`Closed PR #${createdPrNumber}`)
    } catch (e) {
      warn(`Could not close PR #${createdPrNumber}: ${e.message}`)
    }
    createdPrNumber = null
  }

  // Destroy team via Manager API
  if (teamId && managerPort) {
    try {
      await managerApi('DELETE', `/api/teams/${teamId}`)
      info(`Team ${teamId} destroyed`)
    } catch { /* best effort */ }
    teamId = null
  }

  // Force-down containers
  if (composeFile && existsSync(composeFile)) {
    try {
      execSync(`docker compose -f "${composeFile}" down --timeout 10`, { stdio: 'ignore' })
    } catch { /* best effort */ }
    composeFile = null
  }

  // Kill Manager
  if (managerProc) {
    try { managerProc.kill() } catch { /* ignore */ }
    await new Promise((r) => managerProc.once('exit', r))
    managerProc = null
  }
}

// ── Network helpers ───────────────────────────────────────────────────────────

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

function waitForPort(host, port, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const attempt  = () => {
      const sock = connect({ host, port })
      sock.once('connect', () => { sock.destroy(); resolve() })
      sock.once('error', () => {
        sock.destroy()
        if (Date.now() >= deadline) return reject(new Error(`Port ${port} not ready after ${timeoutMs}ms`))
        setTimeout(attempt, 500)
      })
    }
    attempt()
  })
}

// ── GitHub API helper ─────────────────────────────────────────────────────────
// Uses the `githubToken` variable which is updated after team creation.

async function githubApi(path, method = 'GET', body = null) {
  if (!githubToken) {
    throw new Error('No GitHub token available — cannot call GitHub API')
  }
  const url = `https://api.github.com/${path}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization:          `Bearer ${githubToken}`,
      Accept:                 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type':         'application/json',
      'User-Agent':           'a1engineer-e2e-test',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GitHub API ${method} ${path} → ${res.status}: ${text}`)
  }
  if (res.status === 204) return null
  return res.json()
}

// ── Manager API helper ────────────────────────────────────────────────────────

async function managerApi(method, path, body = null) {
  const url = `http://localhost:${managerPort}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization:  `Bearer ${E2E_API_KEY}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const parsed = res.status === 204 ? null : await res.json().catch(() => null)
  return { status: res.status, body: parsed }
}

// ── Container helper ──────────────────────────────────────────────────────────

async function waitForContainers(file, timeoutMs = 120000) {
  const content  = readFileSync(file, 'utf8')
  const agents   = (content.match(/image: a1-agent/g) ?? []).length
  const expected = agents + 1  // +1 for ergo

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const out   = execSync(`docker compose -f "${file}" ps --status running --format json 2>/dev/null`, { encoding: 'utf8' })
      const lines = out.trim().split('\n').filter(Boolean)
      if (lines.length >= expected) return lines.length
    } catch { /* ignore */ }
    const elapsed = Math.round((Date.now() - (deadline - timeoutMs)) / 1000)
    info(`Waiting for containers… ${elapsed}s / ${Math.round(timeoutMs / 1000)}s`)
    await sleep(5000)
  }
  throw new Error(`Containers did not reach running state within ${timeoutMs}ms`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log()
  console.log(`${C}═══════════════════════════════════════════════════════════${RS}`)
  console.log(`${C}  Level B e2e — real agent + GitHub PR (${new Date().toISOString()})  ${RS}`)
  console.log(`${C}═══════════════════════════════════════════════════════════${RS}`)
  console.log()

  // ── Step 1: Start Manager ────────────────────────────────────────────────
  console.log(`${C}═══ Step 1: Start Manager ═══${RS}`)
  managerPort = await findFreePort()
  info(`Starting Manager on port ${managerPort}…`)

  const managerEnv = { ...process.env }
  if (ANTHROPIC_API_KEY) managerEnv.ANTHROPIC_API_KEY = ANTHROPIC_API_KEY
  if (SESSION_TOKEN)     managerEnv.SESSION_TOKEN     = SESSION_TOKEN
  if (githubToken)       managerEnv.GITHUB_TOKEN      = githubToken

  managerProc = spawn(
    'node',
    [join(ROOT, 'manager/src/index.js'), 'serve', '--port', String(managerPort)],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: managerEnv,
    },
  )
  managerProc.stdout.on('data', (d) => process.stdout.write(`[mgr] ${d}`))
  managerProc.stderr.on('data', (d) => process.stderr.write(`[mgr] ${d}`))
  managerProc.once('error', (e) => { warn(`Manager process error: ${e.message}`) })

  await waitForPort('localhost', managerPort, 15000)
  pass('1', `Manager ready on :${managerPort}`)

  // ── Step 2: Create team ──────────────────────────────────────────────────
  console.log()
  console.log(`${C}═══ Step 2: Create team ═══${RS}`)
  info(`Creating team from ${configArg} (auth.mode: ${teamConfig.auth?.mode ?? 'api-key'})…`)

  const createRes = await managerApi('POST', '/api/teams', teamConfig)
  if (createRes.status !== 201) {
    fail('2', `POST /api/teams → ${createRes.status}: ${JSON.stringify(createRes.body)}`)
  }

  teamId      = createRes.body.id
  agentId     = createRes.body.agents?.[0]?.id ?? ''
  composeFile = `/tmp/a1-teams/${teamId}/docker-compose.yml`

  if (!existsSync(composeFile)) {
    fail('2', `Compose file not found: ${composeFile}`)
  }

  // Resolve GitHub token: prefer the one written by Manager (GitHub App mode),
  // fall back to the PAT we loaded earlier.
  const teamGithubTokenPath = `/tmp/a1-teams/${teamId}/github_token.txt`
  if (existsSync(teamGithubTokenPath)) {
    githubToken = readFileSync(teamGithubTokenPath, 'utf8').trim()
    info('GitHub token loaded from team directory (GitHub App mode)')
  } else if (githubToken) {
    info('GitHub token loaded from environment (PAT mode)')
  } else {
    warn('No GitHub token available — GitHub polling step will fail if reached')
  }

  pass('2', `Team created: ${teamId} | first agent: ${agentId}`)

  // ── Step 3: Wait for containers ──────────────────────────────────────────
  console.log()
  console.log(`${C}═══ Step 3: Wait for containers (120s) ═══${RS}`)

  const runningCount = await waitForContainers(composeFile, 120000)
  pass('3', `${runningCount} containers running`)

  // ── Step 4: Ergo IRC ready ───────────────────────────────────────────────
  console.log()
  console.log(`${C}═══ Step 4: Ergo IRC ready ═══${RS}`)

  if (IRC_HOST_PORT) {
    await waitForPort('localhost', IRC_HOST_PORT, 24000)
    pass('4', `Ergo IRC accepting connections on :${IRC_HOST_PORT}`)
  } else {
    warn('No Ergo hostPort in config — skipping IRC port check')
    pass('4', 'Ergo internal only')
  }

  // ── Step 5: Send task + verify agent responds in IRC ─────────────────────
  console.log()
  console.log(`${C}═══ Step 5: Send task + verify IRC response (60s) ═══${RS}`)

  if (!IRC_HOST_PORT) {
    warn('No Ergo hostPort — skipping agent response check')
    pass('5', 'IRC check skipped (internal Ergo)')
  } else {
    const CHECKER_NICK = `e2e-checker-${TIMESTAMP}`
    const TASK_MSG = [
      `[e2e-test] Please create a file named \`${TASK_FILE}\` containing exactly the text "OK"`,
      `and open a pull request for it in the repository (${GITHUB_REPO}).`,
      `This is an automated test. PR title should start with "e2e-test".`,
    ].join(' ')

    // Start IRC observer BEFORE sending the message (avoids race condition)
    info(`Starting IRC observer (nick: ${CHECKER_NICK}, filter: ${agentId || 'any'})…`)
    const checkerArgs = [
      join(ROOT, 'test/irc-check.mjs'),
      'localhost', String(IRC_HOST_PORT), '#main', '60000', CHECKER_NICK,
      ...(agentId ? [agentId] : []),
    ]
    checkerProc = spawn('node', checkerArgs, {
      cwd:   join(ROOT, 'manager'),  // irc-framework resolves from manager/node_modules
      stdio: 'inherit',
    })

    // Give the observer time to connect and JOIN before the PING lands
    await sleep(2000)

    // Send the task via Manager API
    info('Posting task to #main via Manager API…')
    const pingRes = await managerApi(
      'POST',
      `/api/teams/${teamId}/channels/main/messages`,
      { text: TASK_MSG },
    )
    if (pingRes.status !== 200) {
      warn(`POST /channels/main/messages returned ${pingRes.status} — continuing anyway`)
    }

    // Wait for observer to exit (0 = agent responded, 1 = timeout)
    const checkerExitCode = await new Promise((resolve) => {
      checkerProc.once('exit', (code) => resolve(code ?? 1))
      checkerProc.once('error', ()    => resolve(1))
    })
    checkerProc = null

    if (checkerExitCode !== 0) {
      fail('5', 'Agent did not respond in #main within 60s', 3)
    }
    pass('5', 'Agent responded in #main')
  }

  // ── Step 6: Poll GitHub for new PR ───────────────────────────────────────
  console.log()
  console.log(`${C}═══ Step 6: Poll GitHub for new PR (5 min) ═══${RS}`)
  info(`Polling ${GITHUB_REPO} for a PR created after ${new Date(TIMESTAMP).toISOString()}…`)

  const PR_TIMEOUT_MS  = 5 * 60 * 1000
  const prDeadline     = Date.now() + PR_TIMEOUT_MS
  let   foundPr        = null

  while (Date.now() < prDeadline) {
    let prs
    try {
      prs = await githubApi(
        `repos/${GITHUB_REPO}/pulls?state=open&sort=created&direction=desc&per_page=20`,
      )
    } catch (e) {
      warn(`GitHub API error: ${e.message} — retrying in 15s`)
      await sleep(15000)
      continue
    }

    // Accept any PR whose created_at is within 60s before TIMESTAMP
    // (agent may have started creating the PR slightly before our PING arrived)
    foundPr = prs.find((pr) => {
      const created = new Date(pr.created_at).getTime()
      return created >= TIMESTAMP - 60_000
    })

    if (foundPr) break

    const remaining = Math.round((prDeadline - Date.now()) / 1000)
    info(`No matching PR yet — ${remaining}s remaining; retrying in 15s…`)
    await sleep(15000)
  }

  if (!foundPr) {
    fail('6', `No new PR found in ${GITHUB_REPO} within 5 minutes`, 3)
  }

  createdPrNumber = foundPr.number
  pass('6', `PR #${createdPrNumber} found: "${foundPr.title}"`)

  // ── Step 7: Close PR ─────────────────────────────────────────────────────
  console.log()
  console.log(`${C}═══ Step 7: Close PR ═══${RS}`)

  await githubApi(`repos/${GITHUB_REPO}/pulls/${createdPrNumber}`, 'PATCH', { state: 'closed' })
  createdPrNumber = null  // prevent double-close in cleanup
  pass('7', `PR #${foundPr.number} closed`)

  // ── Step 8: Destroy team ─────────────────────────────────────────────────
  console.log()
  console.log(`${C}═══ Step 8: Destroy team ═══${RS}`)

  const delRes = await managerApi('DELETE', `/api/teams/${teamId}`)
  if (delRes.status !== 204) {
    fail('8', `DELETE /api/teams/${teamId} → ${delRes.status}: ${JSON.stringify(delRes.body)}`)
  }
  teamId = null  // prevent double-delete in cleanup
  pass('8', 'Team destroyed (204)')

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log()
  console.log(`${G}═══════════════════════════════════════════════════════════${RS}`)
  console.log(`${G}  Level B e2e passed — agent created PR, all 8 steps OK!   ${RS}`)
  console.log(`${G}═══════════════════════════════════════════════════════════${RS}`)
  console.log()
}

// ── Entry point ───────────────────────────────────────────────────────────────

main()
  .then(async () => {
    await cleanup()
    process.exit(0)
  })
  .catch(async (err) => {
    if (!process.exitCode) {
      console.error(`${R}[FAIL]${RS} Uncaught error: ${err.message}`)
      process.exitCode = 1
    }
    await cleanup()
    process.exit(process.exitCode)
  })
