import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../api/client'

interface GbrainSearchResponse {
  results: Array<{ slug: string; title: string; type: string; excerpt: string; score?: number }>
  available: boolean
}

interface GbrainEntityResponse {
  entity: { slug: string; title: string; type: string; content: string; excerpt: string } | null
  available: boolean
}

interface GbrainRelatedResponse {
  related: Array<{ slug: string; title: string; type: string; relationship: string }>
  available: boolean
}

export function useGbrainSearch(query: string) {
  return useQuery<GbrainSearchResponse>({
    queryKey: queryKeys.gbrain.search(query),
    queryFn: async () => {
      const res = await fetch(`/api/gbrain/search?q=${encodeURIComponent(query)}&limit=20`)
      if (!res.ok) return { results: [], available: false }
      return res.json()
    },
    enabled: query.length > 0,
    staleTime: 60_000,
  })
}

export function useGbrainEntity(slug: string | null) {
  return useQuery<GbrainEntityResponse>({
    queryKey: queryKeys.gbrain.entity(slug ?? ''),
    queryFn: async () => {
      if (!slug) return { entity: null, available: false }
      const res = await fetch(`/api/gbrain/entity/${encodeURIComponent(slug)}`)
      if (!res.ok) return { entity: null, available: false }
      return res.json()
    },
    enabled: !!slug,
    staleTime: 60_000,
  })
}

export function useGbrainRelated(slug: string | null) {
  return useQuery<GbrainRelatedResponse>({
    queryKey: queryKeys.gbrain.related(slug ?? ''),
    queryFn: async () => {
      if (!slug) return { related: [], available: false }
      const res = await fetch(`/api/gbrain/related/${encodeURIComponent(slug)}`)
      if (!res.ok) return { related: [], available: false }
      return res.json()
    },
    enabled: !!slug,
    staleTime: 60_000,
  })
}
