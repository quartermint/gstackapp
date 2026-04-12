import { useState, type FormEvent, type KeyboardEvent } from 'react'

interface GbrainSearchInputProps {
  onSearch: (query: string) => void
  isLoading: boolean
}

export function GbrainSearchInput({ onSearch, isLoading }: GbrainSearchInputProps) {
  const [value, setValue] = useState('')

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = value.trim()
    if (trimmed.length > 0) {
      onSearch(trimmed)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-3">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search knowledge..."
        className="w-full bg-surface-hover border border-border rounded-md px-4 py-2 font-mono text-[15px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus transition-colors"
      />
      <button
        type="submit"
        disabled={isLoading || value.trim().length === 0}
        className="bg-accent text-background rounded-md px-6 py-2 font-display font-semibold text-[13px] whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent-hover transition-colors"
      >
        {isLoading ? 'Searching...' : 'Search Knowledge'}
      </button>
    </form>
  )
}
