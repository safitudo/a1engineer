// Ergo IRC channel management
// MVP: channels auto-created when agents join; this module handles explicit provisioning

const ERGO_HOST = process.env.ERGO_HOST || 'localhost'
const ERGO_PORT = Number(process.env.ERGO_PORT) || 6667

export interface ChannelEntry {
  name: string
  created: string
}

// In-memory map of channel name → created timestamp
const channels = new Map<string, string>()

export async function createChannel(name: string): Promise<{ name: string; created: boolean }> {
  // Ergo creates channels automatically when a user JOINs them.
  // This stub tracks channel creation intent for the API response.
  const channelName = name.startsWith('#') ? name : `#${name}`
  channels.set(channelName, new Date().toISOString())
  return { name: channelName, created: true }
}

export function listChannels(): ChannelEntry[] {
  return Array.from(channels.entries()).map(([name, created]) => ({ name, created }))
}

export function getErgoConfig(): { host: string; port: number } {
  return { host: ERGO_HOST, port: ERGO_PORT }
}
