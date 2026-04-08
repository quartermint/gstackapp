import { Hono } from 'hono'
import { execFile as execFileCb } from 'node:child_process'
import type { InfraStatus, ServiceHealth } from '@gstackapp/shared'

// Mounted by Plan 03 in packages/api/src/index.ts

const infraApp = new Hono()

/** Known services to check for in Mac Mini output */
const KNOWN_SERVICES = ['tailscale-funnel', 'vaulttrain', 'pixvault', 'foundry'] as const

/** Service name patterns to match in launchctl/systemctl output */
const SERVICE_PATTERNS: Record<string, RegExp> = {
  'tailscale-funnel': /tailscale/i,
  vaulttrain: /vaulttrain/i,
  pixvault: /pixvault/i,
  foundry: /foundry/i,
}

/** Run a command via SSH with timeout, returns stdout or null on failure */
function sshExec(command: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFileCb(
        'ssh',
        [
          '-o', 'ConnectTimeout=3',
          '-o', 'StrictHostKeyChecking=no',
          '-o', 'BatchMode=yes',
          'ryans-mac-mini',
          command,
        ],
        { timeout: 5000 },
        (err, stdout) => {
          if (err) {
            resolve(null)
          } else {
            resolve(typeof stdout === 'string' ? stdout : String(stdout))
          }
        },
      )
    } catch {
      resolve(null)
    }
  })
}

/** Parse service list output to identify known services */
function parseServices(serviceOutput: string, funnelOutput: string | null): ServiceHealth[] {
  const services: ServiceHealth[] = []

  for (const name of KNOWN_SERVICES) {
    const pattern = SERVICE_PATTERNS[name]
    if (pattern.test(serviceOutput)) {
      const service: ServiceHealth = { name, status: 'healthy' }

      // Check if funnel output has an endpoint for this service
      if (name === 'tailscale-funnel' && funnelOutput) {
        const endpointMatch = funnelOutput.match(/(https:\/\/[^\s]+)/)
        if (endpointMatch) {
          service.endpoint = endpointMatch[1]
        }
      }

      services.push(service)
    }
  }

  return services
}

/** Query Mac Mini health via SSH with timeout. Never throws. */
export async function queryMacMini(): Promise<InfraStatus> {
  try {
    // Query service list
    const serviceOutput = await sshExec(
      'systemctl list-units --type=service --state=running --no-pager --plain 2>/dev/null || launchctl list 2>/dev/null | head -30',
    )

    if (serviceOutput === null) {
      return {
        reachable: false,
        services: [],
        lastChecked: new Date().toISOString(),
      }
    }

    // Query Tailscale Funnel endpoints
    const funnelOutput = await sshExec('tailscale funnel status 2>/dev/null')

    const services = parseServices(serviceOutput, funnelOutput)

    return {
      reachable: true,
      services,
      lastChecked: new Date().toISOString(),
    }
  } catch {
    // Never throw — always return valid InfraStatus
    return {
      reachable: false,
      services: [],
      lastChecked: new Date().toISOString(),
    }
  }
}

// ── GET /status — Mac Mini infrastructure health ─────────────────────────────

infraApp.get('/status', async (c) => {
  const status = await queryMacMini()
  return c.json(status)
})

export default infraApp
