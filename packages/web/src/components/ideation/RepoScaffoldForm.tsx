import { useState, useCallback, useEffect } from 'react'
import { StackSelector } from './StackSelector'
import { cn } from '../../lib/cn'

// ── Types ────────────────────────────────────────────────────────────────────

interface IdeationContext {
  name?: string
  description?: string
  stack?: string
  excerpt?: string
  sessionId?: string
}

interface ScaffoldResult {
  path: string
  filesCreated: string[]
}

interface RepoScaffoldFormProps {
  ideationContext?: IdeationContext
  onScaffold: (result: ScaffoldResult) => void
  onClose: () => void
}

// ── Validation ───────────────────────────────────────────────────────────────

const NAME_PATTERN = /^[a-z0-9-]+$/

function validateName(name: string): string | null {
  if (!name.trim()) return 'Project name is required'
  if (!NAME_PATTERN.test(name)) return 'Use lowercase letters, numbers, and hyphens only'
  if (name.length > 100) return 'Name must be 100 characters or fewer'
  return null
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Modal form for creating a new repo from ideation output.
 * Per D-18, D-19, D-20: centered modal, pre-populated from ideation context.
 * Per T-15-17: client-side regex validation on project name.
 */
export function RepoScaffoldForm({
  ideationContext,
  onScaffold,
  onClose,
}: RepoScaffoldFormProps) {
  const [name, setName] = useState(ideationContext?.name ?? '')
  const [description, setDescription] = useState(
    ideationContext?.description ?? ''
  )
  const [stack, setStack] = useState(ideationContext?.stack ?? 'react')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [loading, onClose])

  const handleNameChange = useCallback((value: string) => {
    setName(value)
    setNameError(null)
    setError(null)
  }, [])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const nameErr = validateName(name)
      if (nameErr) {
        setNameError(nameErr)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const res = await fetch('/api/scaffold/scaffold', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            stack,
            description,
            ideationSessionId: ideationContext?.sessionId,
          }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(
            data.message ?? `Server error (${res.status})`
          )
        }

        const result: ScaffoldResult = await res.json()
        onScaffold(result)
        onClose()
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Unknown error'
        setError(`Repository creation failed -- ${msg}. Check the name and try again.`)
      } finally {
        setLoading(false)
      }
    },
    [name, stack, description, ideationContext?.sessionId, onScaffold, onClose]
  )

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose()
      }}
    >
      <div className="absolute inset-0 bg-black/50" />

      {/* Modal */}
      <form
        onSubmit={handleSubmit}
        className={cn(
          'relative z-10 w-full max-w-[560px] mx-4',
          'bg-surface border border-border rounded-xl p-6',
          'animate-in zoom-in-95 duration-200 ease-out',
          'flex flex-col gap-5'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            Scaffold Repository
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4L12 12M12 4L4 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label className="font-body text-sm text-text-muted">
            Project Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="my-project"
            disabled={loading}
            className={cn(
              'px-3 py-2 rounded-lg border bg-background font-body text-sm text-text-primary',
              'placeholder:text-text-muted/50 focus:outline-none focus:border-border-focus',
              'transition-colors duration-150',
              nameError ? 'border-[#FF5A67]' : 'border-border'
            )}
          />
          {nameError && (
            <span className="font-body text-xs text-[#FF5A67]">
              {nameError}
            </span>
          )}
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1.5">
          <label className="font-body text-sm text-text-muted">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) =>
              setDescription(e.target.value.slice(0, 2000))
            }
            rows={3}
            disabled={loading}
            className={cn(
              'px-3 py-2 rounded-lg border border-border bg-background font-body text-sm text-text-primary',
              'placeholder:text-text-muted/50 focus:outline-none focus:border-border-focus',
              'transition-colors duration-150 resize-none'
            )}
          />
          <span className="font-body text-xs text-text-muted text-right">
            {description.length}/2000
          </span>
        </div>

        {/* Stack */}
        <div className="flex flex-col gap-1.5">
          <label className="font-body text-sm text-text-muted">
            Tech Stack
          </label>
          <StackSelector value={stack} onChange={setStack} />
        </div>

        {/* Error */}
        {error && (
          <div className="px-3 py-2 rounded-lg bg-[rgba(255,90,103,0.08)] border border-[rgba(255,90,103,0.2)]">
            <span className="font-body text-sm text-[#FF5A67]">
              {error}
            </span>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !name.trim()}
          className={cn(
            'w-full py-2.5 rounded-lg font-body text-sm font-medium transition-colors duration-150',
            'bg-accent text-background hover:bg-accent-hover',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'flex items-center justify-center gap-2'
          )}
        >
          {loading && (
            <svg
              className="animate-spin w-4 h-4"
              viewBox="0 0 16 16"
              fill="none"
            >
              <circle
                cx="8"
                cy="8"
                r="6"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="28"
                strokeDashoffset="8"
                strokeLinecap="round"
              />
            </svg>
          )}
          {loading ? 'Scaffolding...' : 'Scaffold Repository'}
        </button>
      </form>
    </div>
  )
}
