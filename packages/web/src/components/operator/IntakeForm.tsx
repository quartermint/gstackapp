import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

interface IntakeFormProps {
  onSubmitted?: (requestId: string) => void
  disabled?: boolean
}

/**
 * Operator intake form per D-05.
 * Three fields: whatNeeded, whatGood, deadline (optional).
 * Submits to POST /api/operator/request via fetch.
 */
export function IntakeForm({ onSubmitted, disabled }: IntakeFormProps) {
  const queryClient = useQueryClient()
  const [whatNeeded, setWhatNeeded] = useState('')
  const [whatGood, setWhatGood] = useState('')
  const [deadline, setDeadline] = useState('')
  const [success, setSuccess] = useState(false)

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/operator/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whatNeeded,
          whatGood,
          ...(deadline ? { deadline } : {}),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error ?? 'Request failed')
      }
      return res.json()
    },
    onSuccess: (data) => {
      setWhatNeeded('')
      setWhatGood('')
      setDeadline('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      queryClient.invalidateQueries({ queryKey: ['operator', 'history'] })
      onSubmitted?.(data.id)
    },
  })

  const canSubmit = whatNeeded.trim().length > 0 && whatGood.trim().length > 0 && !mutation.isPending && !disabled

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (canSubmit) mutation.mutate()
      }}
      className="space-y-md"
    >
      {/* What do you need? */}
      <div>
        <label
          htmlFor="whatNeeded"
          className="block font-body text-sm font-medium text-text-primary mb-xs"
        >
          What do you need?
        </label>
        <textarea
          id="whatNeeded"
          value={whatNeeded}
          onChange={(e) => setWhatNeeded(e.target.value)}
          placeholder="Describe what you want built, fixed, or investigated..."
          rows={4}
          maxLength={5000}
          disabled={disabled}
          className="w-full bg-surface border border-border rounded-md px-sm py-xs font-body text-[15px] text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus resize-y disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* What does good look like? */}
      <div>
        <label
          htmlFor="whatGood"
          className="block font-body text-sm font-medium text-text-primary mb-xs"
        >
          What does good look like?
        </label>
        <textarea
          id="whatGood"
          value={whatGood}
          onChange={(e) => setWhatGood(e.target.value)}
          placeholder="How will you know it's done right?"
          rows={3}
          maxLength={5000}
          disabled={disabled}
          className="w-full bg-surface border border-border rounded-md px-sm py-xs font-body text-[15px] text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus resize-y disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Deadline (optional) */}
      <div>
        <label
          htmlFor="deadline"
          className="block font-body text-sm font-medium text-text-primary mb-xs"
        >
          Deadline
          <span className="text-text-muted ml-1">(optional)</span>
        </label>
        <input
          id="deadline"
          type="text"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          placeholder="e.g., end of day, Friday, no rush"
          disabled={disabled}
          className="w-full bg-surface border border-border rounded-md px-sm py-xs font-body text-[15px] text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Submit + feedback */}
      <div className="flex items-center gap-sm">
        <button
          type="submit"
          disabled={!canSubmit}
          className="px-lg py-xs bg-accent text-background font-body text-[15px] font-medium rounded-md hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
        >
          {mutation.isPending ? 'Submitting...' : 'Submit Request'}
        </button>

        {success && (
          <span className="font-body text-sm text-pass">
            Request submitted
          </span>
        )}

        {mutation.isError && (
          <span className="font-body text-sm text-block">
            {mutation.error.message}
          </span>
        )}
      </div>
    </form>
  )
}
