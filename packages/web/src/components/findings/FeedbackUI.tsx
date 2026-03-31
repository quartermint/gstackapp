import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../api/client'
import { cn } from '../../lib/cn'

interface FeedbackUIProps {
  findingId: string
  currentVote: 'up' | 'down' | null
}

/**
 * Thumbs up/down feedback on individual findings.
 * Per D-13: enables signal quality improvement.
 * Posts to /api/feedback via fetch, invalidates pipeline detail cache on success.
 */
export function FeedbackUI({ findingId, currentVote }: FeedbackUIProps) {
  const queryClient = useQueryClient()
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [note, setNote] = useState('')

  const mutation = useMutation({
    mutationFn: async (vote: 'up' | 'down') => {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingId, vote, ...(note ? { note } : {}) }),
      })
      if (!res.ok) throw new Error('Failed to submit feedback')
      return res.json()
    },
    onSuccess: () => {
      // Invalidate pipeline detail queries so the UI refreshes with the new vote
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.all })
      setShowNoteInput(false)
      setNote('')
    },
  })

  const handleVote = (vote: 'up' | 'down') => {
    setShowNoteInput(true)
    // Submit immediately with the vote, note can be added after
    mutation.mutate(vote)
  }

  const handleNoteSubmit = () => {
    if (note.trim() && currentVote) {
      mutation.mutate(currentVote)
    }
    setShowNoteInput(false)
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => handleVote('up')}
        disabled={mutation.isPending}
        className={cn(
          'inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors duration-150 text-sm',
          currentVote === 'up'
            ? 'bg-accent-muted text-accent'
            : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
        )}
        aria-label="Helpful finding"
      >
        <ThumbsUpIcon />
      </button>
      <button
        type="button"
        onClick={() => handleVote('down')}
        disabled={mutation.isPending}
        className={cn(
          'inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors duration-150 text-sm',
          currentVote === 'down'
            ? 'bg-[rgba(255,90,103,0.08)] text-[#FF5A67]'
            : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
        )}
        aria-label="Unhelpful finding"
      >
        <ThumbsDownIcon />
      </button>

      {showNoteInput && (
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={handleNoteSubmit}
          onKeyDown={(e) => e.key === 'Enter' && handleNoteSubmit()}
          placeholder="Add context (optional)"
          className="flex-1 h-7 px-2 rounded-md bg-background border border-border text-text-primary text-[12px] font-body placeholder:text-text-muted focus:border-border-focus focus:outline-none"
          autoFocus
        />
      )}
    </div>
  )
}

function ThumbsUpIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  )
}

function ThumbsDownIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  )
}
