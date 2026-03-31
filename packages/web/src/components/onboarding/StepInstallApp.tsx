interface StepInstallAppProps {
  githubAppUrl: string
}

/**
 * Onboarding Step 1: Install the GitHub App.
 *
 * Shows a CTA to install gstackapp on the user's GitHub account.
 * The onboarding status polling in the parent wizard will auto-advance
 * once the installation webhook fires and creates a DB record.
 */
export function StepInstallApp({ githubAppUrl }: StepInstallAppProps) {
  return (
    <div className="flex flex-col items-center text-center max-w-md mx-auto">
      <div className="w-14 h-14 rounded-[--radius-lg] bg-accent-muted flex items-center justify-center mb-6">
        <svg
          className="w-7 h-7 text-accent"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-2.388a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L4.25 8.257"
          />
        </svg>
      </div>

      <h2 className="font-display text-2xl font-semibold text-text-primary tracking-[-0.02em] mb-3">
        Install the GitHub App
      </h2>

      <p className="font-body text-text-muted text-[15px] leading-relaxed mb-8">
        Connect gstackapp to your GitHub account to start reviewing PRs with
        five specialized AI brains.
      </p>

      <a
        href={githubAppUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-[--radius-md] bg-accent text-background font-body font-medium text-[15px] hover:bg-accent-hover transition-colors duration-150"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
        </svg>
        Install on GitHub
      </a>

      <p className="font-body text-text-muted text-sm mt-6 mb-4">
        After installing, select which repositories to connect.
      </p>

      {/* Waiting indicator with subtle pulse */}
      <div className="flex items-center gap-2 text-text-muted text-sm">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        Waiting for installation...
      </div>
    </div>
  )
}
