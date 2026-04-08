import { Hono } from 'hono'
import { readFileSync, readdirSync, existsSync, realpathSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { homedir } from 'node:os'
import simpleGit from 'simple-git'
import { z } from 'zod'
import type { GsdState, GitStatus, ProjectState } from '@gstackapp/shared'

// ── Config schema for ~/.gstackapp/projects.json ──────────────────────────────

const projectsConfigSchema = z.object({
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  overrides: z.record(z.object({
    displayName: z.string().optional(),
    group: z.string().optional(),
  })).optional(),
})

// ── YAML frontmatter parser (hand-rolled, no external dep) ────────────────────

function parseValue(v: string): string | number | boolean {
  if (v === undefined || v === null) return ''
  const trimmed = v.trim()
  // Strip surrounding quotes
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  // Numbers
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed)
  }
  // Booleans
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  return trimmed
}

export function parseStateMd(content: string): GsdState | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null

  const lines = match[1].split('\n')
  const state: Record<string, unknown> = {}
  let currentKey = ''

  for (const line of lines) {
    if (line.startsWith('  ')) {
      // Nested under currentKey (e.g., progress.*)
      const colonIdx = line.trimStart().indexOf(': ')
      if (colonIdx > 0) {
        const trimmedLine = line.trimStart()
        const k = trimmedLine.slice(0, colonIdx)
        const v = trimmedLine.slice(colonIdx + 2)
        if (!state[currentKey] || typeof state[currentKey] !== 'object') {
          state[currentKey] = {}
        }
        ;(state[currentKey] as Record<string, unknown>)[k] = parseValue(v)
      }
    } else {
      const colonIdx = line.indexOf(': ')
      if (colonIdx > 0) {
        currentKey = line.slice(0, colonIdx)
        const rawValue = line.slice(colonIdx + 2)
        // If value is empty, this key may have nested children
        if (rawValue.trim() === '') {
          state[currentKey] = {}
        } else {
          state[currentKey] = parseValue(rawValue)
        }
      } else if (line.indexOf(':') === line.length - 1) {
        // Key with colon but no value (e.g., "progress:")
        currentKey = line.slice(0, -1)
        state[currentKey] = {}
      }
    }
  }

  // Map to GsdState shape
  const result: GsdState = {
    milestone: state.milestone as string | undefined,
    milestone_name: state.milestone_name as string | undefined,
    status: state.status as string | undefined,
    stopped_at: state.stopped_at as string | undefined,
    last_activity: state.last_activity as string | undefined,
    progress: state.progress && typeof state.progress === 'object'
      ? state.progress as GsdState['progress']
      : undefined,
  }

  return result
}

// ── Staleness algorithm ───────────────────────────────────────────────────────

const STALE_DAYS = 3

export interface StatusInput {
  hasDesignDocs: boolean
  hasPlanning: boolean
  lastActivity: string | null
  uncommitted: number
}

export function computeStatus(input: StatusInput): 'active' | 'stale' | 'ideating' {
  // Ideating: has design docs but no .planning/ directory
  if (input.hasDesignDocs && !input.hasPlanning) {
    return 'ideating'
  }

  // Check last activity age
  if (input.lastActivity) {
    const activityDate = new Date(input.lastActivity)
    const now = new Date()
    const diffMs = now.getTime() - activityDate.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)

    if (diffDays <= STALE_DAYS) {
      return 'active'
    }

    // Older than 3 days AND has uncommitted changes -> stale
    if (input.uncommitted > 0) {
      return 'stale'
    }
  }

  // Default: active
  return 'active'
}

// ── Path safety ───────────────────────────────────────────────────────────────

export function isPathSafe(targetPath: string): boolean {
  const home = homedir()
  try {
    const resolved = realpathSync(resolve(targetPath))
    return resolved.startsWith(home + '/') || resolved === home
  } catch {
    return false
  }
}

// ── Git status helper ─────────────────────────────────────────────────────────

async function getGitStatus(projectPath: string): Promise<GitStatus | null> {
  const git = simpleGit(projectPath)
  try {
    const [status, log] = await Promise.all([
      git.status(),
      git.log({ maxCount: 1 }),
    ])
    return {
      branch: status.current,
      uncommitted: status.files.length,
      ahead: status.ahead,
      behind: status.behind,
      lastCommitDate: log.latest?.date ?? null,
      lastCommitMessage: log.latest?.message ?? null,
    }
  } catch {
    return null
  }
}

// ── Project discovery ─────────────────────────────────────────────────────────

function parseClaudeMdProjects(home: string): Array<{ name: string; description?: string }> {
  const claudeMdPath = join(home, 'CLAUDE.md')
  if (!existsSync(claudeMdPath)) return []

  try {
    const content = readFileSync(claudeMdPath, 'utf-8')
    const projects: Array<{ name: string; description?: string }> = []
    const regex = /^\s*-\s*\*\*(\w[\w-]*)\/?\*\*\s*[-—]\s*(.+)$/gm
    let match: RegExpExecArray | null
    while ((match = regex.exec(content)) !== null) {
      projects.push({
        name: match[1],
        description: match[2].trim(),
      })
    }
    return projects
  } catch {
    return []
  }
}

function loadProjectsConfig(home: string) {
  const configPath = join(home, '.gstackapp', 'projects.json')
  if (!existsSync(configPath)) {
    return { include: [], exclude: [], overrides: {} }
  }
  try {
    const raw = readFileSync(configPath, 'utf-8')
    const parsed = projectsConfigSchema.parse(JSON.parse(raw))
    return {
      include: parsed.include ?? [],
      exclude: parsed.exclude ?? [],
      overrides: parsed.overrides ?? {},
    }
  } catch {
    return { include: [], exclude: [], overrides: {} }
  }
}

function scanForPlanningDirs(home: string): string[] {
  const found: string[] = []
  try {
    const entries = readdirSync(home)
    for (const entry of entries) {
      if (entry.startsWith('.')) continue
      const dirPath = join(home, entry)
      try {
        const stat = statSync(dirPath)
        if (!stat.isDirectory()) continue
        if (existsSync(join(dirPath, '.planning'))) {
          found.push(entry)
        }
      } catch {
        // Skip inaccessible directories
      }
    }
  } catch {
    // Home dir unreadable
  }
  return found
}

function hasDesignDocsForProject(home: string, projectName: string): boolean {
  const designDocPath = join(home, '.gstack', 'projects', projectName)
  try {
    return existsSync(designDocPath)
  } catch {
    return false
  }
}

// ── Bounded parallelism helper ────────────────────────────────────────────────

const CONCURRENCY = 10

async function processInBatches<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

// ── Hono route ────────────────────────────────────────────────────────────────

const projectsApp = new Hono()

projectsApp.get('/', async (c) => {
  const home = homedir()
  const config = loadProjectsConfig(home)
  const claudeProjects = parseClaudeMdProjects(home)
  const planningProjects = scanForPlanningDirs(home)

  // Merge all project sources by name (deduplicate)
  const projectMap = new Map<string, { name: string; description?: string }>()

  // Config includes
  for (const name of config.include) {
    projectMap.set(name, { name })
  }

  // CLAUDE.md projects
  for (const proj of claudeProjects) {
    if (!projectMap.has(proj.name)) {
      projectMap.set(proj.name, proj)
    } else {
      // Merge description if not set
      const existing = projectMap.get(proj.name)!
      if (!existing.description && proj.description) {
        existing.description = proj.description
      }
    }
  }

  // .planning/ directory discoveries
  for (const name of planningProjects) {
    if (!projectMap.has(name)) {
      projectMap.set(name, { name })
    }
  }

  // Remove excluded
  for (const name of config.exclude) {
    projectMap.delete(name)
  }

  // Build project state for each
  const projectEntries = Array.from(projectMap.values())

  const projects: ProjectState[] = await processInBatches(projectEntries, async (entry) => {
    const projectPath = resolve(home, entry.name)

    // Path safety check
    if (!isPathSafe(projectPath)) {
      return {
        name: entry.name,
        path: projectPath,
        description: entry.description,
        gsdState: null,
        gitStatus: null,
        status: 'active' as const,
        hasDesignDocs: false,
      }
    }

    // Check for .planning/STATE.md
    const hasPlanning = existsSync(join(projectPath, '.planning'))
    let gsdState: GsdState | null = null
    if (hasPlanning) {
      const stateMdPath = join(projectPath, '.planning', 'STATE.md')
      if (existsSync(stateMdPath)) {
        try {
          const content = readFileSync(stateMdPath, 'utf-8')
          gsdState = parseStateMd(content)
        } catch {
          // Failed to read STATE.md
        }
      }
    }

    // Git status
    let gitStatus: GitStatus | null = null
    if (existsSync(projectPath)) {
      gitStatus = await getGitStatus(projectPath)
    }

    // Design docs check
    const projectHasDesignDocs = hasDesignDocsForProject(home, entry.name)

    // Determine last activity date from multiple sources
    const lastActivity = gsdState?.last_activity
      ?? (gitStatus?.lastCommitDate ? gitStatus.lastCommitDate.split('T')[0] : null)

    // Compute status
    const status = computeStatus({
      hasDesignDocs: projectHasDesignDocs,
      hasPlanning,
      lastActivity,
      uncommitted: gitStatus?.uncommitted ?? 0,
    })

    // Apply overrides
    const override = config.overrides[entry.name]
    const displayName = override?.displayName ?? entry.name

    return {
      name: displayName,
      path: projectPath,
      description: entry.description,
      gsdState,
      gitStatus,
      status,
      hasDesignDocs: projectHasDesignDocs,
    }
  })

  return c.json(projects)
})

export default projectsApp
