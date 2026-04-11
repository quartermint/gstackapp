import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'

/**
 * Login page for non-tailnet users per D-01.
 * Email input + "Send Magic Link" button.
 * Clean, centered, dark mode. Posts to /api/auth/magic-link.
 */
export function LoginPage() {
  const [email, setEmail] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.status === 403) {
        throw new Error('This email is not authorized.')
      }
      if (!res.ok) {
        throw new Error('Failed to send magic link.')
      }
      return res.json()
    },
  })

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-md">
      <div className="w-full max-w-[400px]">
        {/* Branding */}
        <div className="text-center mb-xl">
          <h1 className="font-display text-[32px] leading-[1.2] font-semibold text-accent tracking-[-0.02em]">
            gstackapp
          </h1>
          <p className="font-body text-[15px] text-text-muted mt-xs">
            Sign in to continue
          </p>
        </div>

        {/* Form */}
        {mutation.isSuccess ? (
          <div className="bg-[rgba(46,219,135,0.08)] border border-[rgba(46,219,135,0.2)] rounded-md px-md py-md text-center">
            <p className="font-body text-[15px] text-pass">
              Check your email for a sign-in link.
            </p>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (email.trim()) mutation.mutate()
            }}
            className="space-y-md"
          >
            <div>
              <label
                htmlFor="email"
                className="block font-body text-sm font-medium text-text-primary mb-xs"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full bg-surface border border-border rounded-md px-sm py-xs font-body text-[15px] text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus"
              />
            </div>

            <button
              type="submit"
              disabled={!email.trim() || mutation.isPending}
              className="w-full px-lg py-xs bg-accent text-background font-body text-[15px] font-medium rounded-md hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
            >
              {mutation.isPending ? 'Sending...' : 'Send Magic Link'}
            </button>

            {mutation.isError && (
              <div className="bg-[rgba(255,90,103,0.08)] border border-[rgba(255,90,103,0.2)] rounded-md px-md py-sm">
                <p className="font-body text-sm text-block">
                  {mutation.error.message}
                </p>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
