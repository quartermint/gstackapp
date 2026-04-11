import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

// We'll test whoisByAddr by mocking the Unix socket with a local HTTP server
// The module reads TAILSCALE_SOCKET from an internal constant, so we override it via env

describe('tailscale whois', () => {
  let server: http.Server
  let serverPort: number
  let mockResponse: string | null = null
  let mockDelay = 0

  beforeEach(async () => {
    // Create a local HTTP server to simulate the Tailscale LocalAPI
    server = http.createServer((req, res) => {
      if (mockDelay > 0) {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(mockResponse ?? '{}')
        }, mockDelay)
        return
      }
      if (mockResponse === null) {
        res.writeHead(500)
        res.end('error')
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(mockResponse)
    })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve)
    })
    serverPort = (server.address() as AddressInfo).port
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    vi.restoreAllMocks()
    mockResponse = null
    mockDelay = 0
  })

  it('returns user info for a valid 100.x Tailscale IP', async () => {
    mockResponse = JSON.stringify({
      UserProfile: {
        ID: 12345,
        LoginName: 'sternryan@github',
        DisplayName: 'Ryan Stern',
      },
      Node: {
        ComputedName: 'ryans-mac-mini',
      },
    })

    // We need to import whoisByAddr with the socket path overridden
    // Use the testable version that accepts a socket path override
    const { whoisByAddr } = await import('../../auth/tailscale')
    const result = await whoisByAddr('100.64.1.1', `http://127.0.0.1:${serverPort}`)
    expect(result).toEqual({
      userId: '12345',
      loginName: 'sternryan@github',
      displayName: 'Ryan Stern',
      nodeName: 'ryans-mac-mini',
    })
  })

  it('returns null for non-Tailscale IP (skips socket call)', async () => {
    const { whoisByAddr } = await import('../../auth/tailscale')
    const result = await whoisByAddr('192.168.1.1')
    expect(result).toBeNull()
  })

  it('returns null when socket returns invalid JSON', async () => {
    mockResponse = 'not-json'

    const { whoisByAddr } = await import('../../auth/tailscale')
    const result = await whoisByAddr('100.64.1.1', `http://127.0.0.1:${serverPort}`)
    expect(result).toBeNull()
  })

  it('returns null when socket errors', async () => {
    mockResponse = null // triggers 500

    const { whoisByAddr } = await import('../../auth/tailscale')
    const result = await whoisByAddr('100.64.1.1', `http://127.0.0.1:${serverPort}`)
    expect(result).toBeNull()
  })

  it('returns null when socket times out', async () => {
    mockDelay = 5000 // way over the 2s timeout

    const { whoisByAddr } = await import('../../auth/tailscale')
    const result = await whoisByAddr('100.64.1.1', `http://127.0.0.1:${serverPort}`)
    expect(result).toBeNull()
  }, 10000)
})
