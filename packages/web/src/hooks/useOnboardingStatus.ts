import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../api/client'
import type { OnboardingStatus } from '@gstackapp/shared'

export type { OnboardingStatus }

/**
 * Polls GET /api/onboarding/status every 5 seconds to detect
 * when the user completes each onboarding step (install app,
 * select repos, trigger first review). Stops polling once
 * step reaches 'complete'.
 */
export function useOnboardingStatus() {
  return useQuery({
    queryKey: queryKeys.onboarding.status,
    queryFn: async (): Promise<OnboardingStatus> => {
      const res = await fetch('/api/onboarding/status')
      if (!res.ok) throw new Error(`Onboarding status fetch failed: ${res.status}`)
      return res.json()
    },
    refetchInterval: (query) =>
      query.state.data?.step === 'complete' ? false : 5000,
  })
}
