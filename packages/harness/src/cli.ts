import { readFileSync } from 'node:fs'
import { loadHarnessConfig } from './config'
import { getProvider, resolveModel, PROFILES } from './registry'
import { getAdapter } from './adapters'
import { SkillManifestSchema } from './skills/manifest'
import { runSkill } from './skills/runner'

function printUsage(): void {
  console.log(`@gstackapp/harness - Multi-provider LLM abstraction

Usage:
  harness [command]

Commands:
  providers         List configured providers and active profile
  test <provider>   Send a test completion to a provider
  run-skill <path>  Execute a skill from a .skill.json manifest
  sync [push|pull]  Sync memory and planning state over Tailscale

Options:
  --adapter=<name>  Tool adapter (claude-code|opencode|codex, default: claude-code)
  --dry-run         Preview sync changes without applying
  --target=<host>   Sync target hostname (default: ryans-mac-mini)
  --help, -h        Show this help message
`)
}

async function listProviders(): Promise<void> {
  const cfg = loadHarnessConfig()
  console.log(`Profile: ${cfg.pipelineProfile}\n`)
  console.log('Providers:')
  console.log(`  anthropic  ${cfg.anthropicApiKey ? '[ok]' : '[--]'}  ${cfg.anthropicApiKey ? 'API key set' : 'ANTHROPIC_API_KEY not set'}`)
  console.log(`  gemini     ${cfg.geminiApiKey ? '[ok]' : '[--]'}  ${cfg.geminiApiKey ? 'API key set' : 'GEMINI_API_KEY not set'}`)
  console.log(`  openai     ${cfg.openaiApiKey ? '[ok]' : '[--]'}  ${cfg.openaiApiKey ? 'API key set' : 'OPENAI_API_KEY not set'}`)
  console.log(`  local      ${cfg.localApiUrl ? '[ok]' : '[--]'}  ${cfg.localApiUrl ? cfg.localApiUrl : 'LOCAL_API_URL not set'}`)
}

async function testProvider(providerName: string): Promise<void> {
  const cfg = loadHarnessConfig()
  const profile = PROFILES[cfg.pipelineProfile] ?? PROFILES.balanced
  const profileValue = profile.default
  const [defaultProviderName, defaultModel] = profileValue.split(':')

  // Use the requested provider's default model from the profile, or fallback
  let model = defaultModel
  if (providerName !== defaultProviderName) {
    // Find a model for this provider in any profile
    for (const [, p] of Object.entries(PROFILES)) {
      for (const [, v] of Object.entries(p)) {
        if (v.startsWith(`${providerName}:`)) {
          model = v.split(':')[1]
          break
        }
      }
      if (model !== defaultModel) break
    }
  }

  try {
    const provider = getProvider(providerName)
    console.log(`Testing ${providerName} with model ${model}...`)
    const result = await provider.createCompletion({
      model,
      system: 'Say hello.',
      messages: [{ role: 'user', content: 'Hello' }],
      tools: [],
      maxTokens: 50,
    })

    const text = result.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('')

    console.log(`Response: ${text}`)
    console.log(`Usage: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`)
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}

async function runSkillCommand(manifestPath: string, flags: string[]): Promise<void> {
  // Parse --adapter flag
  const adapterFlag = flags.find((f) => f.startsWith('--adapter='))
  const adapterName = adapterFlag ? adapterFlag.split('=')[1] : 'claude-code'

  // Load and validate manifest
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  } catch (err) {
    console.error(`Error reading manifest: ${(err as Error).message}`)
    process.exit(1)
  }

  const manifest = SkillManifestSchema.parse(raw)
  const adapter = getAdapter(adapterName)

  // Resolve provider + model
  const { provider, model } = resolveModel('default')

  // Basic executeTool that logs and returns placeholder
  const executeTool = async (name: string, input: Record<string, unknown>): Promise<string> => {
    console.log(`[tool] ${name}(${JSON.stringify(input)})`)
    return 'Tool not available in CLI mode'
  }

  console.log(`Running skill: ${manifest.name} (${manifest.id})`)
  console.log(`Adapter: ${adapterName}, Model: ${model}\n`)

  try {
    const result = await runSkill({
      manifest,
      provider,
      adapter,
      model,
      executeTool,
    })
    console.log('\nResult:')
    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`)
    process.exit(1)
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command || command === '--help' || command === '-h') {
    printUsage()
    return
  }

  if (command === 'providers') {
    await listProviders()
    return
  }

  if (command === 'test') {
    const providerName = args[1]
    if (!providerName) {
      console.error('Error: provider name required. Usage: harness test <provider>')
      process.exit(1)
    }
    await testProvider(providerName)
    return
  }

  if (command === 'run-skill') {
    const manifestPath = args[1]
    if (!manifestPath) {
      console.error('Error: manifest path required. Usage: harness run-skill <path> [--adapter=name]')
      process.exit(1)
    }
    await runSkillCommand(manifestPath, args.slice(2))
    return
  }

  if (command === 'sync') {
    const { syncCommand } = await import('./sync/index.js')
    const sub = args[1]
    const direction = (sub === 'push' || sub === 'pull') ? sub : undefined
    const dryRun = args.includes('--dry-run')
    const targetFlag = args.find((f) => f.startsWith('--target='))
    const target = targetFlag?.split('=')[1] ?? process.env.SYNC_TARGET ?? 'ryans-mac-mini'
    await syncCommand({ direction, dryRun, target })
    return
  }

  console.error(`Unknown command: ${command}`)
  printUsage()
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
