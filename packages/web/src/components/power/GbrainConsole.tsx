import { useState } from 'react'
import { useGbrainSearch } from '../../hooks/useGbrain'
import { GbrainSearchInput } from './GbrainSearchInput'
import { GbrainResultCard } from './GbrainResultCard'
import { GbrainEntityDetail } from './GbrainEntityDetail'

export function GbrainConsole() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const { data: searchData, isLoading } = useGbrainSearch(searchQuery)

  return (
    <div className="grid grid-cols-[55%_45%] h-full">
      {/* Left column: search + results */}
      <div className="overflow-y-auto p-8 space-y-4">
        <h1 className="font-display text-[24px] font-semibold text-text-primary leading-[1.2]">
          Knowledge Console
        </h1>

        <GbrainSearchInput onSearch={setSearchQuery} isLoading={isLoading} />

        {/* gbrain unavailable warning */}
        {searchData && !searchData.available && searchQuery.length > 0 && (
          <div className="bg-[rgba(255,176,32,0.08)] border border-[rgba(255,176,32,0.2)] rounded-md p-4">
            <p className="font-body text-[15px] text-[#FFB020] font-semibold mb-1">
              Knowledge base unavailable
            </p>
            <p className="font-body text-[13px] text-[#FFB020]">
              The gbrain MCP server is not responding. Check server status and try again.
            </p>
          </div>
        )}

        {/* Results list */}
        {searchData && searchData.available && searchData.results.length > 0 && (
          <div className="space-y-2">
            {searchData.results.map((result) => (
              <GbrainResultCard
                key={result.slug}
                result={result}
                selected={selectedSlug === result.slug}
                onClick={() => setSelectedSlug(result.slug)}
              />
            ))}
          </div>
        )}

        {/* No results */}
        {searchData && searchData.available && searchData.results.length === 0 && searchQuery.length > 0 && (
          <div className="text-center py-12">
            <h3 className="font-display text-[18px] font-semibold text-text-primary mb-2">
              No results for &apos;{searchQuery}&apos;
            </h3>
            <p className="font-body text-[15px] text-text-muted">
              Try different keywords or a broader search term.
            </p>
          </div>
        )}

        {/* Empty state (no search yet) */}
        {searchQuery.length === 0 && (
          <div className="text-center py-12">
            <h3 className="font-display text-[18px] font-semibold text-text-primary mb-2">
              Query your knowledge base
            </h3>
            <p className="font-body text-[15px] text-text-muted">
              Search across 10,609 pages of compiled project and people context.
            </p>
          </div>
        )}
      </div>

      {/* Right column: entity detail */}
      <div className="overflow-y-auto p-8 border-l border-border">
        {selectedSlug ? (
          <GbrainEntityDetail slug={selectedSlug} onNavigate={setSelectedSlug} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="font-body text-[15px] text-text-muted">
              Select a result to view details
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
