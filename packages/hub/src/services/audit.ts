/**
 * Audit logging service
 *
 * Provides centralized audit logging functionality using Convex.
 * All security-relevant actions should be logged through this service.
 */

import { getConvexClient, isConvexConfigured, api } from './convex.js';

/**
 * Audit event parameters
 */
export interface AuditEvent {
  /** Request ID for forensics tracing */
  requestId: string;
  /** Action being logged (e.g., 'task.created', 'node.registered') */
  action: string;
  /** Optional JSON-encoded details */
  details?: string;
  /** Source IP address */
  sourceIp?: string;
  /** User ID if authenticated */
  userId?: string;
}

/**
 * Log an audit event to Convex
 *
 * This function is non-blocking and will not throw errors.
 * Failed audit logs are logged to the console but do not
 * interrupt the main flow.
 *
 * @param event - The audit event to log
 */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  // Skip if Convex is not configured
  if (!isConvexConfigured()) {
    console.log('[AUDIT]', event.action, event.requestId, event.details || '');
    return;
  }

  try {
    const client = getConvexClient();
    await client.mutation(api.auditLog.log, {
      requestId: event.requestId,
      action: event.action,
      details: event.details,
      sourceIp: event.sourceIp,
      userId: event.userId,
    });
  } catch (error) {
    // Log to console but don't throw - audit logging should never break the main flow
    console.error('[AUDIT ERROR]', {
      event,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Query audit logs by request ID
 *
 * @param requestId - The request ID to query
 * @param limit - Maximum number of logs to return
 */
export async function getAuditLogsByRequestId(
  requestId: string,
  limit?: number
): Promise<unknown[]> {
  if (!isConvexConfigured()) {
    return [];
  }

  const client = getConvexClient();
  return await client.query(api.auditLog.listByRequestId, {
    requestId,
    limit,
  });
}

/**
 * Query audit logs by timestamp range
 *
 * @param options - Query options
 */
export async function getAuditLogsByTimestamp(options: {
  startTime?: number;
  endTime?: number;
  limit?: number;
  cursor?: string;
}): Promise<{ logs: unknown[]; nextCursor: string | null }> {
  if (!isConvexConfigured()) {
    return { logs: [], nextCursor: null };
  }

  const client = getConvexClient();
  return await client.query(api.auditLog.listByTimestamp, options);
}
