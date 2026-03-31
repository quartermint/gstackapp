import { Shell } from './components/layout/Shell'
import { useSSEQuerySync } from './hooks/useSSEQuerySync'

export function App() {
  useSSEQuerySync()

  return (
    <Shell>
      <div className="flex items-center justify-start h-full p-lg">
        <p className="font-display text-text-primary text-lg">
          Pipeline visualization coming soon
        </p>
      </div>
    </Shell>
  )
}
