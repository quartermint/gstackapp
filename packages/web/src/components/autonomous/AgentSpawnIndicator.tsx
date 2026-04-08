import { cn } from '../../lib/cn'

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentSpawn {
  agentId: string
  role: string
}

interface AgentSpawnIndicatorProps {
  agents: AgentSpawn[]
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Row of small circle avatars showing agent spawns during execution.
 * Each circle shows the first letter of the agent role.
 * Max 5 visible, "+N" for overflow.
 */
export function AgentSpawnIndicator({ agents }: AgentSpawnIndicatorProps) {
  if (agents.length === 0) return null

  const visible = agents.slice(0, 5)
  const overflow = agents.length - 5

  return (
    <div className="flex items-center gap-1">
      {visible.map(agent => (
        <div
          key={agent.agentId}
          className={cn(
            'w-6 h-6 rounded-full bg-surface border border-border',
            'flex items-center justify-center',
            'text-[10px] font-medium text-text-muted',
            'cursor-default',
          )}
          title={agent.role}
        >
          {agent.role.charAt(0).toUpperCase()}
        </div>
      ))}
      {overflow > 0 && (
        <span className="text-[10px] text-text-muted ml-0.5">
          +{overflow}
        </span>
      )}
    </div>
  )
}
