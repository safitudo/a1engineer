import Dockerode from 'dockerode'

const docker = new Dockerode({ socketPath: '/var/run/docker.sock' })

export interface ContainerStatus {
  containerId: string
  agentId: string
  status: string
  name: string
}

export interface LaunchOptions {
  agentId: string
  image: string
  env?: string[]
  name?: string
}

export async function launchContainer({ agentId, image, env = [], name }: LaunchOptions): Promise<string> {
  const container = await docker.createContainer({
    Image: image,
    name: name || `agent-${agentId}`,
    Env: env,
    HostConfig: {
      AutoRemove: false,
    },
    Labels: { 'a1.agent_id': agentId },
  })
  await container.start()
  return container.id
}

export async function stopContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId)
  await container.stop({ t: 10 })
}

export async function killContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId)
  await container.kill()
}

export async function execInContainer(containerId: string, cmd: string): Promise<string> {
  const container = docker.getContainer(containerId)
  const exec = await container.exec({
    Cmd: ['sh', '-c', cmd],
    AttachStdout: true,
    AttachStderr: true,
  })
  const stream = await exec.start({ hijack: true, stdin: false })
  return new Promise<string>((resolve, reject) => {
    let output = ''
    stream.on('data', (chunk: Buffer) => { output += chunk.toString() })
    stream.on('end', () => resolve(output))
    stream.on('error', reject)
  })
}

export async function captureScreen(containerId: string): Promise<string> {
  return execInContainer(
    containerId,
    'tmux capture-pane -pt agent -e 2>/dev/null || echo "[no tmux session]"',
  )
}

export async function listAgentContainers(): Promise<ContainerStatus[]> {
  const containers = await docker.listContainers({ all: true, filters: { label: ['a1.agent_id'] } })
  return containers.map((c) => ({
    containerId: c.Id,
    agentId: c.Labels['a1.agent_id'],
    status: c.State,
    name: (c.Names[0] ?? '').replace(/^\//, ''),
  }))
}
