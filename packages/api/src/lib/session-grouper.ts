/**
 * Groups a chronologically-sorted list of commits into push sessions.
 *
 * A new session starts when:
 * - Author changes
 * - Gap between consecutive commits exceeds 30 minutes
 *
 * Commits MUST be sorted chronologically (oldest first).
 */

const SESSION_GAP_MS = 30 * 60 * 1000 // 30 minutes

export interface CommitEntry {
  sha: string
  message: string
  authorLogin: string
  date: string // ISO 8601
  parentSha?: string
  additions?: number
  deletions?: number
}

export interface PushSession {
  baseSha: string       // parent of first commit (for diff base)
  headSha: string       // last commit SHA
  authorLogin: string
  title: string         // first commit message, with (+N more) if multiple
  commitCount: number
  additions: number
  deletions: number
  firstCommitDate: string
  lastCommitDate: string
}

export function groupCommitsIntoSessions(commits: CommitEntry[]): PushSession[] {
  if (commits.length === 0) return []

  const sessions: PushSession[] = []
  let currentSession: {
    commits: CommitEntry[]
    baseSha: string
    authorLogin: string
  } = {
    commits: [commits[0]],
    baseSha: commits[0].parentSha ?? commits[0].sha,
    authorLogin: commits[0].authorLogin,
  }

  for (let i = 1; i < commits.length; i++) {
    const prev = commits[i - 1]
    const curr = commits[i]

    const gapMs = new Date(curr.date).getTime() - new Date(prev.date).getTime()
    const authorChanged = curr.authorLogin !== currentSession.authorLogin
    const gapExceeded = gapMs > SESSION_GAP_MS

    if (authorChanged || gapExceeded) {
      sessions.push(finalizeSession(currentSession.commits, currentSession.baseSha))
      currentSession = {
        commits: [curr],
        baseSha: curr.parentSha ?? curr.sha,
        authorLogin: curr.authorLogin,
      }
    } else {
      currentSession.commits.push(curr)
    }
  }

  sessions.push(finalizeSession(currentSession.commits, currentSession.baseSha))
  return sessions
}

function finalizeSession(commits: CommitEntry[], baseSha: string): PushSession {
  const firstLine = commits[0].message.split('\n')[0]
  const title = commits.length === 1
    ? firstLine
    : `${firstLine} (+${commits.length - 1} more)`

  return {
    baseSha,
    headSha: commits[commits.length - 1].sha,
    authorLogin: commits[0].authorLogin,
    title,
    commitCount: commits.length,
    additions: commits.reduce((sum, c) => sum + (c.additions ?? 0), 0),
    deletions: commits.reduce((sum, c) => sum + (c.deletions ?? 0), 0),
    firstCommitDate: commits[0].date,
    lastCommitDate: commits[commits.length - 1].date,
  }
}
