import { Hono } from 'hono'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import type { CarryoverItem, Staleness } from '@gstackapp/shared'

// Mounted by Plan 03 in packages/api/src/index.ts

const worklogApp = new Hono()

/** Compute staleness based on days since logged date */
export function computeStaleness(loggedDate: string): Staleness {
  const logged = new Date(loggedDate + 'T00:00:00')
  const now = new Date()
  // Zero out time for day comparison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const logDay = new Date(logged.getFullYear(), logged.getMonth(), logged.getDate())
  const diffMs = today.getTime() - logDay.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 3) return 'recent'
  if (diffDays <= 7) return 'aging'
  return 'stale'
}

/** Parse worklog content and extract carryover items */
export function parseWorklogCarryover(content: string): CarryoverItem[] {
  if (!content) return []

  const items: CarryoverItem[] = []

  // Match session headers: **Session YYYY-MM-DD -- project: description**
  const sessionPattern = /\*\*Session\s+(\d{4}-\d{2}-\d{2})\s*--\s*([\w][\w-]*):/g
  const sessions: Array<{ date: string; project: string; startIdx: number }> = []

  let match: RegExpExecArray | null
  while ((match = sessionPattern.exec(content)) !== null) {
    sessions.push({
      date: match[1],
      project: match[2],
      startIdx: match.index,
    })
  }

  // For each session, find the Carryover section and extract items
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i]
    const nextStart = i + 1 < sessions.length ? sessions[i + 1].startIdx : content.length
    const sessionBlock = content.slice(session.startIdx, nextStart)

    // Find ### Carryover section
    const carryoverIdx = sessionBlock.indexOf('### Carryover')
    if (carryoverIdx === -1) continue

    // Extract text after ### Carryover until next ### or end of session block
    const afterCarryover = sessionBlock.slice(carryoverIdx + '### Carryover'.length)
    const nextSectionIdx = afterCarryover.search(/^###\s/m)
    const carryoverText = nextSectionIdx >= 0
      ? afterCarryover.slice(0, nextSectionIdx)
      : afterCarryover

    // Extract bullet items (- or *)
    const bulletPattern = /^[-*]\s+(.+)$/gm
    let bulletMatch: RegExpExecArray | null
    while ((bulletMatch = bulletPattern.exec(carryoverText)) !== null) {
      items.push({
        projectName: session.project,
        text: bulletMatch[1].trim(),
        loggedDate: session.date,
        staleness: computeStaleness(session.date),
      })
    }
  }

  // Sort by date descending
  items.sort((a, b) => b.loggedDate.localeCompare(a.loggedDate))

  return items
}

// ── GET /carryover — Parse worklog.md carryover sections ─────────────────────

worklogApp.get('/carryover', (c) => {
  const home = homedir()
  const worklogPath = resolve(home, '.claude', 'logs', 'worklog.md')

  if (!existsSync(worklogPath)) {
    return c.json([])
  }

  try {
    const content = readFileSync(worklogPath, 'utf-8')
    const items = parseWorklogCarryover(content)
    return c.json(items)
  } catch {
    return c.json([])
  }
})

export default worklogApp
