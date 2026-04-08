import { useCallback, type KeyboardEvent } from 'react'
import { cn } from '../../lib/cn'

interface IdeationInputProps {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  disabled?: boolean
}

/**
 * Large textarea with idea-first placeholder and accent CTA.
 *
 * Per UI spec copywriting contract:
 * - Placeholder: "What do you want to build? Describe your idea..."
 * - CTA: "Start Ideation"
 * - Submit on button click or Cmd+Enter
 *
 * Per DESIGN.md:
 * - Background: --color-surface
 * - Border: 1px --color-border, focus: --color-border-focus
 * - Font: 15px Geist (body), line-height 1.6
 * - CTA: --color-accent bg, font-display semibold
 *
 * Per T-15-12: Client-side validation (min 1, max 5000 chars).
 */
export function IdeationInput({ value, onChange, onSubmit, disabled }: IdeationInputProps) {
  const canSubmit = value.trim().length > 0 && value.length <= 5000 && !disabled

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSubmit) {
        e.preventDefault()
        onSubmit()
      }
    },
    [canSubmit, onSubmit]
  )

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="What do you want to build? Describe your idea..."
        disabled={disabled}
        maxLength={5000}
        className={cn(
          'w-full min-h-[80px] max-h-[200px] resize-y rounded-lg',
          'bg-surface border border-border px-4 py-3',
          'font-body text-[15px] leading-[1.6] text-text-primary',
          'placeholder:text-text-muted',
          'focus:border-border-focus focus:outline-none',
          'transition-colors duration-150',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      />

      <div className="flex items-center justify-between">
        {/* Character count */}
        <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em]">
          {value.length > 0 ? `${value.length} / 5000` : ''}
        </span>

        {/* Submit button */}
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className={cn(
            'px-5 py-2 rounded-lg font-display font-semibold text-sm',
            'transition-colors duration-150',
            canSubmit
              ? 'bg-accent text-background hover:bg-accent-hover cursor-pointer'
              : 'bg-surface-hover text-text-muted cursor-not-allowed'
          )}
        >
          Start Ideation
        </button>
      </div>
    </div>
  )
}
