import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { TEAMS_DIR } from '../constants.js'

const execFileAsync = promisify(execFile)

/**
 * Write a command to the sidecar FIFO inside an agent container.
 * The sidecar nudge_listener routes commands based on agent mode:
 *   print-loop → writes to /tmp/agent-inbox.txt
 *   interactive → sends via tmux send-keys
 *
 * @param {string} teamId
 * @param {string} agentId
 * @param {string} command — e.g. 'nudge <msg>', 'interrupt', 'directive <msg>'
 */
export async function writeFifo(teamId, agentId, command) {
  // Use env var to safely pass arbitrary payload without shell escaping issues
  const serviceName = `agent-${agentId}`
  const cf = join(TEAMS_DIR, teamId, 'docker-compose.yml')
  const args = ['compose', '-f', cf, 'exec', '-T', '-u', 'agent',
    '-e', `FIFO_CMD=${command}`,
    serviceName, 'bash', '-c', 'printf "%s\\n" "$FIFO_CMD" > /tmp/nudge.fifo']
  await execFileAsync('docker', args, { timeout: 15000 })
}
