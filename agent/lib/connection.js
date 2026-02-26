import IRC from 'irc-framework'

/**
 * Connect to IRC, join channels, resolve when ready.
 * @param {object} cfg - { host, port, nick, channels }
 * @param {object} [opts] - { timeout: ms }
 * @returns {Promise<IRC.Client>}
 */
export function connect(cfg, opts = {}) {
  const timeout = opts.timeout || 10000
  return new Promise((resolve, reject) => {
    const client = new IRC.Client()
    const timer = setTimeout(() => {
      client.quit()
      reject(new Error('IRC connect timeout'))
    }, timeout)

    client.connect({
      host: cfg.host,
      port: cfg.port,
      nick: cfg.nick,
    })

    client.on('registered', () => {
      let pending = cfg.channels.length
      if (pending === 0) {
        clearTimeout(timer)
        return resolve(client)
      }
      for (const ch of cfg.channels) {
        client.join(ch)
      }
      client.on('join', () => {
        pending--
        if (pending <= 0) {
          clearTimeout(timer)
          resolve(client)
        }
      })
    })

    client.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

/**
 * Disconnect from IRC.
 * @param {IRC.Client} client
 */
export function disconnect(client) {
  return new Promise((resolve) => {
    client.on('close', resolve)
    client.quit()
    // Force resolve after 2s if quit hangs
    setTimeout(resolve, 2000)
  })
}
