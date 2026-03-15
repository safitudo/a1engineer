import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPrivateKey, generateKeyPairSync } from 'crypto'

// Generate a throwaway RSA key for testing (never leaves this process)
const { privateKey: testKeyObj } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const TEST_PEM = testKeyObj.export({ type: 'pkcs8', format: 'pem' })

// Mock fetch globally before importing the module
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { createInstallationToken, getInstallationToken, clearTokenCache, resolveGitHubToken } = await import('./app.js')

describe('github/app', () => {
  beforeEach(() => {
    clearTokenCache()
    mockFetch.mockReset()
    // Clear env vars
    delete process.env.GITHUB_APP_ID
    delete process.env.GITHUB_INSTALLATION_ID
    delete process.env.GITHUB_APP_PRIVATE_KEY
    delete process.env.GITHUB_TOKEN
  })

  describe('createInstallationToken', () => {
    it('exchanges JWT for installation token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'ghs_test123',
          expires_at: '2099-01-01T00:00:00Z',
        }),
      })

      const result = await createInstallationToken({
        appId: '12345',
        installationId: '67890',
        privateKey: TEST_PEM,
      })

      expect(result.token).toBe('ghs_test123')
      expect(result.expiresAt).toBe('2099-01-01T00:00:00Z')

      // Verify fetch was called with correct URL and auth header
      expect(mockFetch).toHaveBeenCalledOnce()
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.github.com/app/installations/67890/access_tokens')
      expect(opts.headers.Authorization).toMatch(/^Bearer ey/)
      expect(opts.headers.Accept).toBe('application/vnd.github+json')
    })

    it('throws when no private key is available (no config, no env vars)', async () => {
      delete process.env.GITHUB_APP_PRIVATE_KEY
      delete process.env.GITHUB_APP_PRIVATE_KEY_PATH
      await expect(
        createInstallationToken({ appId: '12345', installationId: '67890' })
      ).rejects.toThrow('private key')
    })

    it('throws on missing appId', async () => {
      await expect(
        createInstallationToken({ installationId: '67890', privateKey: TEST_PEM })
      ).rejects.toThrow('App ID is required')
    })

    it('throws on missing installationId', async () => {
      await expect(
        createInstallationToken({ appId: '12345', privateKey: TEST_PEM })
      ).rejects.toThrow('Installation ID is required')
    })

    it('throws on GitHub API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => '{"message":"Bad credentials"}',
      })

      await expect(
        createInstallationToken({ appId: '12345', installationId: '67890', privateKey: TEST_PEM })
      ).rejects.toThrow('GitHub API error 401')
    })

    it('reads appId and installationId from env vars', async () => {
      process.env.GITHUB_APP_ID = '11111'
      process.env.GITHUB_INSTALLATION_ID = '22222'

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'ghs_env', expires_at: '2099-01-01T00:00:00Z' }),
      })

      const result = await createInstallationToken({ privateKey: TEST_PEM })
      expect(result.token).toBe('ghs_env')

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('/22222/')
    })

    it('passes permissions and repositories to GitHub API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'ghs_scoped', expires_at: '2099-01-01T00:00:00Z' }),
      })

      await createInstallationToken({
        appId: '12345',
        installationId: '67890',
        privateKey: TEST_PEM,
        permissions: { contents: 'write', pull_requests: 'write' },
        repositories: ['my-repo'],
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.permissions).toEqual({ contents: 'write', pull_requests: 'write' })
      expect(body.repositories).toEqual(['my-repo'])
    })
  })

  describe('getInstallationToken (cache)', () => {
    it('caches tokens and returns cached on second call', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'ghs_cached', expires_at: '2099-01-01T00:00:00Z' }),
      })

      const first = await getInstallationToken({
        appId: '12345',
        installationId: '67890',
        privateKey: TEST_PEM,
      })
      const second = await getInstallationToken({
        appId: '12345',
        installationId: '67890',
        privateKey: TEST_PEM,
      })

      expect(first.token).toBe('ghs_cached')
      expect(second.token).toBe('ghs_cached')
      expect(mockFetch).toHaveBeenCalledOnce() // only one API call
    })

    it('refreshes token when cached token is within REFRESH_MARGIN_MS of expiry', async () => {
      // First call: return a token expiring in 4 minutes (inside the 5-min refresh margin)
      const nearExpiry = new Date(Date.now() + 4 * 60 * 1000).toISOString()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'ghs_expiring', expires_at: nearExpiry }),
      })
      // Second call: GitHub returns a fresh long-lived token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'ghs_fresh', expires_at: '2099-01-01T00:00:00Z' }),
      })

      await getInstallationToken({ appId: '12345', installationId: '67890', privateKey: TEST_PEM })
      const second = await getInstallationToken({ appId: '12345', installationId: '67890', privateKey: TEST_PEM })

      // Near-expiry cached token must not be served — a fresh fetch must occur
      expect(second.token).toBe('ghs_fresh')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('caches tokens independently per installationId', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: 'ghs_install_1', expires_at: '2099-01-01T00:00:00Z' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: 'ghs_install_2', expires_at: '2099-01-01T00:00:00Z' }),
        })

      const t1 = await getInstallationToken({ appId: '12345', installationId: '11111', privateKey: TEST_PEM })
      const t2 = await getInstallationToken({ appId: '12345', installationId: '22222', privateKey: TEST_PEM })

      expect(t1.token).toBe('ghs_install_1')
      expect(t2.token).toBe('ghs_install_2')
      expect(mockFetch).toHaveBeenCalledTimes(2)

      // Subsequent calls for each installation ID hit their own cache entries
      const t1Again = await getInstallationToken({ appId: '12345', installationId: '11111', privateKey: TEST_PEM })
      const t2Again = await getInstallationToken({ appId: '12345', installationId: '22222', privateKey: TEST_PEM })

      expect(t1Again.token).toBe('ghs_install_1')
      expect(t2Again.token).toBe('ghs_install_2')
      expect(mockFetch).toHaveBeenCalledTimes(2) // no additional API calls
    })
  })

  describe('clearTokenCache', () => {
    it('evicts all cached tokens so the next call fetches fresh', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'ghs_v1', expires_at: '2099-01-01T00:00:00Z' }),
      })

      await getInstallationToken({ appId: '12345', installationId: '67890', privateKey: TEST_PEM })
      expect(mockFetch).toHaveBeenCalledOnce()

      clearTokenCache()

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'ghs_v2', expires_at: '2099-01-01T00:00:00Z' }),
      })

      const after = await getInstallationToken({ appId: '12345', installationId: '67890', privateKey: TEST_PEM })
      expect(after.token).toBe('ghs_v2')
      expect(mockFetch).toHaveBeenCalledTimes(2) // cache was cleared — forced a second API call
    })
  })

  describe('resolveGitHubToken', () => {
    it('returns null when no github config and no env var', async () => {
      const token = await resolveGitHubToken({})
      expect(token).toBeNull()
    })

    it('falls back to GITHUB_TOKEN env var when no github config', async () => {
      process.env.GITHUB_TOKEN = 'ghp_pat_fallback'
      const token = await resolveGitHubToken({})
      expect(token).toBe('ghp_pat_fallback')
    })

    it('uses GitHub App when config has github section', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'ghs_app_token', expires_at: '2099-01-01T00:00:00Z' }),
      })

      const token = await resolveGitHubToken({
        github: {
          appId: '12345',
          installationId: '67890',
          privateKey: TEST_PEM,
        },
      })

      expect(token).toBe('ghs_app_token')
    })
  })
})
