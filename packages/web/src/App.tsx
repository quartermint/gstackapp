import { Shell } from './components/layout/Shell'
import { PipelineHero } from './components/pipeline/PipelineHero'
import { useSSEQuerySync } from './hooks/useSSEQuerySync'

export function App() {
  useSSEQuerySync()

  return (
    <Shell>
      <PipelineHero />
    </Shell>
  )
}
