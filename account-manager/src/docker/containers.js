import Dockerode from 'dockerode'

const docker = new Dockerode({ socketPath: '/var/run/docker.sock' })

export function getDocker() {
  return docker
}

/**
 * Launch an agent container.
 * @param {object} opts
 * @param {string} opts.agentId
 * @param {string} opts.image
 * @param {object} opts.env  - key/value env vars
 * @returns {Promise<string>} container ID
 */
export async function launchContainer({ agentId, image, env = {} }) {
  const envArray = Object.entries(env).map(([k, v]) => `${k}=${v}`)
  const container = await docker.createContainer({
    name: `agent-${agentId}`,
    Image: image,
    Env: envArray,
    Labels: { 'a1.agent_id': agentId },
    HostConfig: {
      NetworkMode: 'a1-net',
    },
  })
  await container.start()
  return container.id
}

/**
 * Stop an agent container gracefully.
 * @param {string} containerId
 */
export async function stopContainer(containerId) {
  const container = docker.getContainer(containerId)
  await container.stop({ t: 10 })
}

/**
 * Kill an agent container immediately.
 * @param {string} containerId
 */
export async function killContainer(containerId) {
  const container = docker.getContainer(containerId)
  await container.kill()
}

/**
 * Run docker exec to capture tmux output for an agent.
 * @param {string} containerId
 * @returns {Promise<string>} captured output
 */
export async function captureScreen(containerId) {
  const container = docker.getContainer(containerId)
  const exec = await container.exec({
    Cmd: ['tmux', 'capture-pane', '-p', '-t', 'agent'],
    AttachStdout: true,
    AttachStderr: true,
  })
  return new Promise((resolve, reject) => {
    exec.start({}, (err, stream) => {
      if (err) return reject(err)
      let output = ''
      stream.on('data', (chunk) => { output += chunk.toString() })
      stream.on('end', () => resolve(output))
      stream.on('error', reject)
    })
  })
}

/**
 * Send a directive to an agent via tmux send-keys.
 * @param {string} containerId
 * @param {string} message
 */
export async function sendDirective(containerId, message) {
  const container = docker.getContainer(containerId)
  const exec = await container.exec({
    Cmd: ['tmux', 'send-keys', '-t', 'agent', message, 'Enter'],
    AttachStdout: true,
    AttachStderr: true,
  })
  await new Promise((resolve, reject) => {
    exec.start({}, (err, stream) => {
      if (err) return reject(err)
      stream.on('end', resolve)
      stream.on('error', reject)
    })
  })
}

/**
 * List all agent containers managed by this account manager.
 * @returns {Promise<Array>}
 */
export async function listAgentContainers() {
  const containers = await docker.listContainers({
    all: true,
    filters: { label: ['a1.agent_id'] },
  })
  return containers.map((c) => ({
    containerId: c.Id,
    agentId: c.Labels['a1.agent_id'],
    status: c.State,
    name: c.Names[0],
  }))
}
