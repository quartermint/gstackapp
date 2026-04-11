/**
 * Tailscale LocalAPI whois client.
 *
 * Queries the Tailscale daemon's LocalAPI over Unix socket to identify
 * users by their Tailscale IP address (100.x.x.x CGNAT range).
 */

import { request as httpRequest } from 'node:http'

const TAILSCALE_SOCKET = '/var/run/tailscaled.socket'
const TIMEOUT_MS = 2000

export interface TailscaleWhoisResult {
  userId: string
  loginName: string   // e.g., "sternryan@github"
  displayName: string
  nodeName: string
}

/**
 * Look up a Tailscale user by their IP address.
 *
 * Only calls the LocalAPI if the address is in the Tailscale CGNAT range (100.x.x.x).
 * Returns null for non-Tailscale IPs, on error, or on timeout.
 *
 * @param addr - IP address to look up
 * @param baseUrl - Override for testing (use http://host:port instead of Unix socket)
 */
export async function whoisByAddr(
  addr: string,
  baseUrl?: string
): Promise<TailscaleWhoisResult | null> {
  // Only check Tailscale IPs (100.64.0.0/10 CGNAT range)
  if (!addr.startsWith('100.')) return null

  return new Promise((resolve) => {
    const path = `/localapi/v0/whois?addr=${addr}:0`

    const opts: Record<string, unknown> = {
      method: 'GET',
      path,
    }
    if (baseUrl) {
      const url = new URL(baseUrl)
      opts.hostname = url.hostname
      opts.port = Number(url.port)
    } else {
      opts.socketPath = TAILSCALE_SOCKET
    }

    const req = httpRequest(opts as any, (res) => {
      if (res.statusCode !== 200) {
        resolve(null)
        return
      }
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve({
            userId: String(json.UserProfile.ID),
            loginName: json.UserProfile.LoginName,
            displayName: json.UserProfile.DisplayName,
            nodeName: json.Node.ComputedName,
          })
        } catch {
          resolve(null)
        }
      })
    })

    req.on('error', () => resolve(null))
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy()
      resolve(null)
    })
    req.end()
  })
}
