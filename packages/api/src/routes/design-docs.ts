import { Hono } from 'hono'
import { readFileSync, readdirSync, existsSync, realpathSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { homedir } from 'node:os'
import type { DesignDoc } from '@gstackapp/shared'

// Mounted by Plan 03 in packages/api/src/index.ts

const designDocsApp = new Hono()

/** Extract project name from directory (strip org prefix like "quartermint-") */
function extractProjectName(dirName: string): string {
  // Pattern: "org-project" -> "project", or just "project" -> "project"
  const dashIdx = dirName.indexOf('-')
  return dashIdx > 0 ? dirName.slice(dashIdx + 1) : dirName
}

/** Extract doc title from markdown content (first # heading) or filename */
function extractTitle(content: string, filename: string): string {
  const match = content.match(/^#\s+(.+)$/m)
  if (match) return match[1].trim()
  // Fallback to filename without extension
  return filename.replace(/\.md$/, '')
}

/** Verify path is safely under allowed base directory */
function isPathSafe(filePath: string, baseDir: string): boolean {
  try {
    const resolved = realpathSync(filePath)
    return resolved.startsWith(baseDir)
  } catch {
    return false
  }
}

// ── GET / — List design documents from ~/.gstack/projects/ ──────────────────

designDocsApp.get('/', (c) => {
  const home = homedir()
  const projectsDir = resolve(home, '.gstack', 'projects')

  if (!existsSync(projectsDir)) {
    return c.json([])
  }

  const docs: DesignDoc[] = []

  try {
    const projectDirs = readdirSync(projectsDir)

    for (const dirName of projectDirs) {
      const designsPath = join(projectsDir, dirName, 'designs')

      // Check stat to ensure it's a directory
      try {
        const dirStat = statSync(join(projectsDir, dirName))
        if (!dirStat.isDirectory()) continue
      } catch {
        continue
      }

      if (!existsSync(designsPath)) continue

      // Path safety: verify under ~/.gstack/
      const gstackBase = resolve(home, '.gstack')
      if (!isPathSafe(designsPath, gstackBase)) continue

      const files = readdirSync(designsPath)
      const projectName = extractProjectName(dirName)

      for (const file of files) {
        if (!file.endsWith('.md')) continue

        const filePath = join(designsPath, file)
        if (!isPathSafe(filePath, gstackBase)) continue

        try {
          const content = readFileSync(filePath, 'utf-8')
          const stat = statSync(filePath)
          const title = extractTitle(content, file)

          docs.push({
            projectName,
            docTitle: title,
            filePath: filePath,
            content,
            createdAt: stat.birthtime ? stat.birthtime.toISOString() : null,
            modifiedAt: stat.mtime.toISOString(),
          })
        } catch {
          // Skip files we can't read
          continue
        }
      }
    }
  } catch {
    // If we can't read the projects dir at all, return empty
    return c.json([])
  }

  // Sort by modifiedAt descending (most recent first)
  docs.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())

  return c.json(docs)
})

export default designDocsApp
