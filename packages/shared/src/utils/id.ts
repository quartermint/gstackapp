import { randomUUID } from 'crypto';

/**
 * Generate a unique request ID with timestamp prefix
 * Format: req_{timestamp}_{uuid}
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const uuid = randomUUID().replace(/-/g, '').slice(0, 12);
  return `req_${timestamp}_${uuid}`;
}

/**
 * Generate a unique task ID
 * Standard UUID v4
 */
export function generateTaskId(): string {
  return randomUUID();
}

/**
 * Generate a unique conversation ID
 * Standard UUID v4
 */
export function generateConversationId(): string {
  return randomUUID();
}

/**
 * Generate a unique node ID based on hostname
 * Format: node_{hostname}_{short-uuid}
 */
export function generateNodeId(hostname: string): string {
  const sanitizedHostname = hostname.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const uuid = randomUUID().replace(/-/g, '').slice(0, 8);
  return `node_${sanitizedHostname}_${uuid}`;
}

/**
 * Extract timestamp from a request ID
 * Returns null if not a valid request ID format
 */
export function extractTimestampFromRequestId(requestId: string): number | null {
  const match = requestId.match(/^req_([a-z0-9]+)_/);
  if (!match || !match[1]) return null;
  const timestamp = parseInt(match[1], 36);
  return isNaN(timestamp) ? null : timestamp;
}
