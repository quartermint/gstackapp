/**
 * Operator request state machine.
 *
 * Validates status transitions for the clarify -> brief -> approve flow.
 * All transitions must pass through canTransition() before DB update.
 */

import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { operatorRequests } from '../db/schema'

export type RequestStatus =
  | 'pending'
  | 'clarifying'
  | 'briefing'
  | 'approved'
  | 'running'
  | 'complete'
  | 'failed'
  | 'timeout'
  | 'escalated'

/**
 * Valid transitions map. Each key maps to an array of valid target statuses.
 * Terminal states (complete, failed, escalated) have no outgoing transitions.
 */
const VALID_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  pending: ['clarifying'],
  clarifying: ['briefing', 'escalated'],
  briefing: ['approved', 'clarifying'],
  approved: ['running'],
  running: ['complete', 'failed', 'timeout'],
  timeout: ['running', 'escalated'],
  complete: [],
  failed: [],
  escalated: [],
}

/**
 * Check if a status transition is valid.
 */
export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  const allowed = VALID_TRANSITIONS[from]
  if (!allowed) return false
  return allowed.includes(to)
}

/**
 * Transition a request to a new status, validating the transition first.
 * Throws if the transition is invalid or the request doesn't exist.
 */
export async function transitionRequest(
  requestId: string,
  to: RequestStatus,
): Promise<void> {
  const [request] = await db
    .select({ status: operatorRequests.status })
    .from(operatorRequests)
    .where(eq(operatorRequests.id, requestId))
    .limit(1)

  if (!request) {
    throw new Error(`Request not found: ${requestId}`)
  }

  const from = request.status as RequestStatus

  if (!canTransition(from, to)) {
    throw new Error(`Invalid transition: ${from} -> ${to}`)
  }

  await db
    .update(operatorRequests)
    .set({ status: to })
    .where(eq(operatorRequests.id, requestId))
}
