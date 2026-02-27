import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import * as teamStore from '../store/teams.js'
import { resolveGitHubToken } from '../github/app.js'
import { TEAMS_DIR } from '../constants.js'

const execFileAsync = promisify(execFile)

const REFRESH_INTERVAL = 45 * 60 * 1000 // 45 minutes

/**
 * Token refresh loop. Generates fresh GitHub App installation tokens
 * and injects them into all running agent containers via docker exec.
 *
 * GitHub App tokens expire after 1 hour — this runs every 45 min
 * so tokens are always valid.
 */
export function startTokenRefresh() {
  console.log('[token-refresh] started (every 45 min)')

  // Delay first refresh to let containers start, then on interval
  setTimeout(refresh, 30_000)
  const interval = setInterval(refresh, REFRESH_INTERVAL)

  return { stop: () => clearInterval(interval) }
}

async function refresh() {
  const teams = teamStore.listTeams()

  for (const team of teams) {
    if (team.status !== 'running') continue
    if (!team.github) continue

    try {
      const token = await resolveGitHubToken(team)
      if (!token) continue

      const cf = join(TEAMS_DIR, team.id, 'docker-compose.yml')
      let count = 0

      for (const agent of team.agents ?? []) {
        const serviceName = `agent-${agent.id}`
        try {
          await execFileAsync('docker', [
            'compose', '-f', cf, 'exec', '-T', serviceName,
            'bash', '-c',
            [
              // .netrc for git credential fallback
              `printf 'machine github.com\\nlogin x-access-token\\npassword ${token}\\n' > /home/agent/.netrc`,
              `chmod 600 /home/agent/.netrc`,
              `cp /home/agent/.netrc /root/.netrc 2>/dev/null || true`,
              // Update GITHUB_TOKEN in agent-env.sh (sourced via BASH_ENV)
              `sed -i 's|^export GITHUB_TOKEN=.*|export GITHUB_TOKEN="${token}"|' /tmp/agent-env.sh 2>/dev/null || echo 'export GITHUB_TOKEN="${token}"' >> /tmp/agent-env.sh`,
              // Write plain token file for $(github-token) helper
              `echo '${token}' > /tmp/github-token && chmod 644 /tmp/github-token`,
            ].join(' && '),
          ], { timeout: 10000 })
          count++
        } catch {
          // Container may be stopped or restarting — skip
        }
      }

      console.log(`[token-refresh] team=${team.name ?? team.id} refreshed ${count} agents`)
    } catch (err) {
      console.error(`[token-refresh] team=${team.id} failed: ${err.message}`)
    }
  }
}
