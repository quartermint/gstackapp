import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock child_process
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

import { execFile } from 'node:child_process'

// ── queryMacMini tests ───────────────────────────────────────────────────────

describe('queryMacMini', () => {
  let queryMacMini: typeof import('../routes/infra').queryMacMini

  beforeEach(async () => {
    vi.resetModules()
    vi.mocked(execFile).mockReset()
    const mod = await import('../routes/infra')
    queryMacMini = mod.queryMacMini
  })

  it('returns structured InfraStatus when Mac Mini is reachable', async () => {
    // Mock successful SSH - service list output
    vi.mocked(execFile).mockImplementation((_cmd: any, args: any, opts: any, cb: any) => {
      const callback = typeof opts === 'function' ? opts : cb
      if (typeof args === 'object' && args.some?.((a: string) => a.includes('launchctl'))) {
        callback(null, 'com.apple.tailscaled\ncom.vaulttrain.daemon\ncom.pixvault.daemon\ncom.foundry.daemon\n', '')
      } else if (typeof args === 'object' && args.some?.((a: string) => a.includes('funnel'))) {
        callback(null, 'https://ryans-mac-mini.tail12345.ts.net\n  |-- /foundry proxy http://127.0.0.1:8787\n', '')
      } else {
        callback(null, '', '')
      }
      return {} as any
    })

    const result = await queryMacMini()
    expect(result.reachable).toBe(true)
    expect(result.lastChecked).toBeTruthy()
    expect(Array.isArray(result.services)).toBe(true)
    // Should have found some known services
    expect(result.services.length).toBeGreaterThan(0)
  })

  it('returns reachable=false when SSH times out', async () => {
    vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb
      const err = new Error('Command timed out') as any
      err.killed = true
      callback(err, '', '')
      return {} as any
    })

    const result = await queryMacMini()
    expect(result.reachable).toBe(false)
    expect(result.services).toEqual([])
    expect(result.lastChecked).toBeTruthy()
  })

  it('returns reachable=false when SSH connection refused', async () => {
    vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb
      callback(new Error('Connection refused'), '', '')
      return {} as any
    })

    const result = await queryMacMini()
    expect(result.reachable).toBe(false)
    expect(result.services).toEqual([])
  })

  it('never throws — always returns valid InfraStatus', async () => {
    vi.mocked(execFile).mockImplementation(() => {
      throw new Error('Unexpected error')
    })

    const result = await queryMacMini()
    expect(result).toHaveProperty('reachable')
    expect(result).toHaveProperty('services')
    expect(result).toHaveProperty('lastChecked')
    expect(result.reachable).toBe(false)
  })

  it('passes timeout option to execFile', async () => {
    vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, opts: any, cb: any) => {
      const callback = typeof opts === 'function' ? opts : cb
      // Verify timeout is set
      if (typeof opts === 'object') {
        expect(opts.timeout).toBeDefined()
        expect(opts.timeout).toBeLessThanOrEqual(5000)
      }
      callback(null, '', '')
      return {} as any
    })

    await queryMacMini()
    expect(execFile).toHaveBeenCalled()
  })
})

// ── GET /api/infra/status integration test ───────────────────────────────────

describe('GET /status (infra endpoint)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(execFile).mockReset()
  })

  it('returns InfraStatus JSON', async () => {
    vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb
      callback(null, 'com.apple.tailscaled\n', '')
      return {} as any
    })

    const { default: infraApp } = await import('../routes/infra')
    const res = await infraApp.request('/status')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('reachable')
    expect(body).toHaveProperty('services')
    expect(body).toHaveProperty('lastChecked')
  })

  it('returns reachable=false when Mac Mini unreachable', async () => {
    vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb
      callback(new Error('Connection timed out'), '', '')
      return {} as any
    })

    const { default: infraApp } = await import('../routes/infra')
    const res = await infraApp.request('/status')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.reachable).toBe(false)
    expect(body.services).toEqual([])
  })
})
