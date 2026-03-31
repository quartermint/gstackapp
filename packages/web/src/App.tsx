import { useState } from 'react'
import { Shell } from './components/layout/Shell'
import { PipelineHero } from './components/pipeline/PipelineHero'
import { useSSEQuerySync } from './hooks/useSSEQuerySync'
import { PRFeed } from './components/feed/PRFeed'
import { PRDetail } from './components/feed/PRDetail'

export function App() {
  useSSEQuerySync()
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null)

  return (
    <Shell>
      <PipelineHero />

      {/* Feed + Detail split view */}
      <div className="flex flex-1 overflow-hidden">
        {/* PR Feed — fixed width when detail is open, full width otherwise */}
        <div
          className={
            selectedPipelineId
              ? 'w-[360px] shrink-0 border-r border-border overflow-y-auto'
              : 'flex-1 overflow-y-auto'
          }
        >
          <PRFeed
            selectedId={selectedPipelineId}
            onSelect={setSelectedPipelineId}
          />
        </div>

        {/* PR Detail — appears when a card is selected */}
        {selectedPipelineId && (
          <PRDetail
            pipelineId={selectedPipelineId}
            onClose={() => setSelectedPipelineId(null)}
          />
        )}
      </div>
    </Shell>
  )
}
