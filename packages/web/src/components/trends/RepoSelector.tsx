import type { Repo } from '../../hooks/useRepos'

interface RepoSelectorProps {
  repos: Repo[]
  selectedId: number | null
  onSelect: (id: number) => void
}

/**
 * Dropdown for selecting which repo's trends to view.
 * Styled per DESIGN.md: bg-surface, border-border, text-text-primary, font-body.
 */
export function RepoSelector({ repos, selectedId, onSelect }: RepoSelectorProps) {
  return (
    <select
      value={selectedId ?? ''}
      onChange={(e) => onSelect(Number(e.target.value))}
      className="bg-surface border border-border text-text-primary font-body text-sm rounded-md px-3 py-1.5 outline-none focus:border-border-focus transition-colors duration-150"
    >
      {repos.map((repo) => (
        <option key={repo.id} value={repo.id}>
          {repo.fullName}
        </option>
      ))}
    </select>
  )
}
