// ── Autonomous Execution SSE Event Types ────────────────────────────────────
// Typed event definitions for the autonomous execution SSE stream.
// Covers full phase lifecycle: discovery, start, complete, fail, commit,
// agent spawn, gate creation/resolution, completion, and errors.

export type AutonomousSSEEvent =
  | { type: 'autonomous:phases:discovered'; phases: Array<{ number: number; name: string; status: string }> }
  | { type: 'autonomous:phase:start'; phase: number; name: string }
  | { type: 'autonomous:phase:complete'; phase: number; commits: number }
  | { type: 'autonomous:phase:failed'; phase: number; error: string }
  | { type: 'autonomous:commit'; phase: number; hash: string; message: string; timestamp: string }
  | { type: 'autonomous:agent:spawn'; phase: number; agentId: string; role: string }
  | { type: 'autonomous:gate:created'; gateId: string; title: string; description: string; options: Array<{ id: string; label: string }>; blocking: boolean }
  | { type: 'autonomous:gate:resolved'; gateId: string; response: string }
  | { type: 'autonomous:complete'; totalPhases: number; totalCommits: number; elapsedMs: number }
  | { type: 'autonomous:error'; message: string }
