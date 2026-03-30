import type { Stage } from '@gstackapp/shared'

/**
 * Represents a file changed in a pull request.
 */
export interface PrFile {
  filename: string
  status: string
  additions: number
  deletions: number
}

/**
 * Determine whether a pipeline stage should run for a given set of PR files.
 *
 * - eng, qa, security: ALWAYS run regardless of PR content
 * - ceo: runs for new files, architecture/dependency changes, or large PRs
 * - design: runs when UI-related files are touched (CSS, TSX/JSX, components)
 *
 * @param stage - The pipeline stage to evaluate
 * @param files - List of files changed in the PR
 * @returns true if the stage should run
 */
export function shouldRunStage(stage: Stage, files: PrFile[]): boolean {
  switch (stage) {
    // Always fire regardless of PR content
    case 'eng':
    case 'qa':
    case 'security':
      return true

    case 'ceo': {
      // New files added
      if (files.some((f) => f.status === 'added')) return true

      // Architecture changes
      if (
        files.some(
          (f) =>
            f.filename.includes('architect') ||
            f.filename.includes('config') ||
            /^(docker|\.github|\.ci)/i.test(f.filename)
        )
      )
        return true

      // Dependency file changes
      if (
        files.some((f) =>
          /package\.json|requirements\.txt|go\.mod|Cargo\.toml|Gemfile/i.test(
            f.filename
          )
        )
      )
        return true

      // Large PR (>10 files or >500 lines total)
      const totalLines = files.reduce(
        (sum, f) => sum + f.additions + f.deletions,
        0
      )
      if (files.length > 10 || totalLines > 500) return true

      return false
    }

    case 'design': {
      return files.some(
        (f) =>
          /\.(css|scss|less|styled|tsx|jsx)$/i.test(f.filename) ||
          /component|style|theme|layout|ui|design/i.test(f.filename)
      )
    }

    default:
      return true
  }
}
