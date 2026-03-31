interface StepSelectReposProps {
  repoCount: number
  githubAppUrl: string
}

/**
 * Onboarding Step 2: Select Repositories.
 *
 * The GitHub App installation webhook has fired (step 1 complete).
 * Now waiting for the user to select repos in GitHub's UI.
 * Auto-advances when repoCount > 0 (detected by polling).
 */
export function StepSelectRepos({ repoCount, githubAppUrl }: StepSelectReposProps) {
  // Build the settings URL for repo configuration
  const settingsUrl = githubAppUrl.includes('/apps/')
    ? `${githubAppUrl}/installations/new`
    : githubAppUrl

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
            d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
          />
        </svg>
      </div>

      <h2 className="font-display text-2xl font-semibold text-text-primary tracking-[-0.02em] mb-3">
        Select Repositories
      </h2>

      <p className="font-body text-text-muted text-[15px] leading-relaxed mb-8">
        Choose which repositories should get cognitive code reviews.
      </p>

      {repoCount > 0 ? (
        <div className="flex items-center gap-3 px-5 py-3 rounded-[--radius-md] bg-[rgba(46,219,135,0.08)] border border-[rgba(46,219,135,0.2)]">
          <svg
            className="w-5 h-5 text-[#2EDB87]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="font-body text-[#2EDB87] text-[15px] font-medium">
            {repoCount} {repoCount === 1 ? 'repository' : 'repositories'} connected
          </span>
        </div>
      ) : (
        <>
          <a
            href={settingsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-[--radius-md] bg-accent text-background font-body font-medium text-[15px] hover:bg-accent-hover transition-colors duration-150"
          >
            Configure Repositories
          </a>

          <p className="font-body text-text-muted text-sm mt-6 mb-4">
            Select at least one repository to enable cognitive reviews.
          </p>

          {/* Waiting indicator with subtle pulse */}
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            Waiting for repository selection...
          </div>
        </>
      )}
    </div>
  )
}
