import { cn } from '../../lib/cn'

interface ArtifactContent {
  type: 'code' | 'markdown' | 'gsd'
  title: string
  body: string
}

interface ArtifactPanelProps {
  isOpen: boolean
  onClose: () => void
  content?: ArtifactContent
}

/**
 * Side panel for artifacts (code, docs, GSD state).
 * Per UI spec: 480px fixed width, right side, slide-in from right.
 */
export function ArtifactPanel({ isOpen, onClose, content }: ArtifactPanelProps) {
  return (
    <div
      className={cn(
        'w-[480px] shrink-0 bg-surface border-l border-border h-full overflow-hidden transition-transform duration-[250ms] ease-out',
        isOpen ? 'translate-x-0' : 'translate-x-full'
      )}
      style={{ display: isOpen ? undefined : 'none' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-body text-[18px] font-medium leading-[1.4] text-text-primary truncate">
          {content?.title || 'Artifact'}
        </h3>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors duration-150 rounded-md hover:bg-surface-hover"
          aria-label="Close artifact panel"
        >
          X
        </button>
      </div>

      {/* Content */}
      <div className="overflow-y-auto h-[calc(100%-49px)] p-4">
        {content && renderArtifact(content)}
      </div>
    </div>
  )
}

function renderArtifact(content: ArtifactContent) {
  switch (content.type) {
    case 'code':
      return (
        <pre className="font-mono text-[14px] leading-[1.7] text-text-primary whitespace-pre overflow-x-auto">
          {content.body}
        </pre>
      )

    case 'markdown':
      return (
        <div className="font-body text-[15px] leading-[1.6] text-text-primary whitespace-pre-wrap">
          {content.body}
        </div>
      )

    case 'gsd':
      return (
        <pre className="font-mono text-[14px] leading-[1.7] text-text-primary whitespace-pre overflow-x-auto">
          {content.body}
        </pre>
      )
  }
}
