import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, normalize } from 'node:path'
import { existsSync } from 'node:fs'

const HOME = process.env.HOME ?? '/Users/ryanstern'

// ── list_projects ────────────────────────────────────────────────────────────
// Scans home directory for project directories with .planning/STATE.md
// Provides cross-project awareness (D-02)

const listProjects = tool(
  'list_projects',
  'List all active projects with their GSD state, git status, and recent activity. Scans home directory for projects containing .planning/STATE.md.',
  { filter: z.enum(['active', 'stale', 'all']).default('active') },
  async (args) => {
    const projects: Array<{
      name: string
      path: string
      status: string
      phase: string
      lastActivity: string
    }> = []

    try {
      const entries = readdirSync(HOME, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        // Skip hidden directories and node_modules
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue

        const projectPath = join(HOME, entry.name)
        const statePath = join(projectPath, '.planning', 'STATE.md')

        if (!existsSync(statePath)) continue

        try {
          const stateContent = readFileSync(statePath, 'utf-8')

          // Extract status, phase, and last activity from STATE.md
          const statusMatch = stateContent.match(/Status:\s*(.+)/i)
          const phaseMatch = stateContent.match(/Current Phase:\s*(.+)/i)
          const activityMatch = stateContent.match(/Last session:\s*(.+)/i)

          const status = statusMatch?.[1]?.trim() ?? 'unknown'
          const phase = phaseMatch?.[1]?.trim() ?? 'unknown'
          const lastActivity = activityMatch?.[1]?.trim() ?? 'unknown'

          // Apply filter
          if (args.filter === 'active' && status.toLowerCase().includes('completed')) continue
          if (args.filter === 'stale' && !status.toLowerCase().includes('stale')) continue

          const stat = statSync(statePath)
          projects.push({
            name: entry.name,
            path: projectPath,
            status,
            phase,
            lastActivity: lastActivity !== 'unknown' ? lastActivity : stat.mtime.toISOString(),
          })
        } catch {
          // Skip projects where STATE.md can't be read
        }
      }
    } catch {
      // Home directory not readable
    }

    return {
      content: [{
        type: 'text' as const,
        text: projects.length > 0
          ? JSON.stringify(projects, null, 2)
          : 'No projects found with GSD planning state.',
      }],
    }
  },
  { annotations: { readOnlyHint: true } }
)

// ── read_gsd_state ──────────────────────────────────────────────────────────
// Read GSD planning state for a specific project (D-02)

const readGsdState = tool(
  'read_gsd_state',
  'Read the GSD planning state for a specific project including STATE.md, ROADMAP.md, and current phase context.',
  { projectPath: z.string().describe('Absolute path to project root') },
  async (args) => {
    const parts: string[] = []

    const planningDir = join(args.projectPath, '.planning')
    if (!existsSync(planningDir)) {
      return {
        content: [{
          type: 'text' as const,
          text: `No .planning directory found at ${args.projectPath}`,
        }],
      }
    }

    // Read STATE.md
    const statePath = join(planningDir, 'STATE.md')
    if (existsSync(statePath)) {
      parts.push('## STATE.md\n' + readFileSync(statePath, 'utf-8'))
    }

    // Read ROADMAP.md
    const roadmapPath = join(planningDir, 'ROADMAP.md')
    if (existsSync(roadmapPath)) {
      parts.push('## ROADMAP.md\n' + readFileSync(roadmapPath, 'utf-8'))
    }

    // Identify current phase from STATE.md and read its CONTEXT.md
    const stateContent = existsSync(statePath) ? readFileSync(statePath, 'utf-8') : ''
    const phaseMatch = stateContent.match(/Current Phase:\s*(\S+)/i)
    if (phaseMatch) {
      const phasesDir = join(planningDir, 'phases')
      if (existsSync(phasesDir)) {
        try {
          const phaseDirs = readdirSync(phasesDir, { withFileTypes: true })
          for (const dir of phaseDirs) {
            if (dir.isDirectory() && dir.name.includes(phaseMatch[1])) {
              const contextPath = join(phasesDir, dir.name, `${dir.name.split('-')[0]}-CONTEXT.md`)
              if (existsSync(contextPath)) {
                parts.push('## Current Phase Context\n' + readFileSync(contextPath, 'utf-8'))
              }
              break
            }
          }
        } catch {
          // Skip if phases dir can't be read
        }
      }
    }

    return {
      content: [{
        type: 'text' as const,
        text: parts.length > 0
          ? parts.join('\n\n---\n\n')
          : `No GSD state files found at ${args.projectPath}`,
      }],
    }
  },
  { annotations: { readOnlyHint: true } }
)

// ── read_design_doc ─────────────────────────────────────────────────────────
// Read design documents from ideation pipeline (D-03)
// T-12-03: Path traversal mitigation - verify resolved path stays under HOME

const readDesignDoc = tool(
  'read_design_doc',
  'Read a design document from the ideation pipeline or ~/.gstack/projects/. Supports both relative paths (resolved under ~/.gstack/projects/) and absolute paths.',
  { docPath: z.string().describe('Path to design document, relative to ~/.gstack/projects/ or absolute') },
  async (args) => {
    // Resolve path
    let resolvedPath: string
    if (args.docPath.startsWith('/')) {
      resolvedPath = normalize(resolve(args.docPath))
    } else {
      resolvedPath = normalize(resolve(join(HOME, '.gstack', 'projects', args.docPath)))
    }

    // T-12-03: Verify path stays under HOME directory to prevent traversal
    if (!resolvedPath.startsWith(HOME)) {
      return {
        content: [{
          type: 'text' as const,
          text: `Access denied: path must be under ${HOME}`,
        }],
        isError: true,
      }
    }

    if (!existsSync(resolvedPath)) {
      return {
        content: [{
          type: 'text' as const,
          text: `Document not found: ${resolvedPath}`,
        }],
        isError: true,
      }
    }

    try {
      const content = readFileSync(resolvedPath, 'utf-8')
      return {
        content: [{
          type: 'text' as const,
          text: content,
        }],
      }
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: `Error reading document: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      }
    }
  },
  { annotations: { readOnlyHint: true } }
)

// ── Export MCP Server ────────────────────────────────────────────────────────

export const gstackToolServer = createSdkMcpServer({
  name: 'gstack',
  version: '1.0.0',
  tools: [listProjects, readGsdState, readDesignDoc],
})
