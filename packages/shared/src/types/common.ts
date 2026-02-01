// TaskStatus and NodeStatus are exported from schemas/task.ts and schemas/node.ts

/**
 * Conversation role
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Base interface for timestamped entities
 */
export interface Timestamped {
  createdAt: number;
  updatedAt: number;
}

/**
 * Base interface for identifiable entities
 */
export interface Identifiable {
  id: string;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  cursor?: string;
  limit?: number;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
}

/**
 * Audit log action types
 */
export type AuditAction =
  | 'request_received'
  | 'request_validated'
  | 'request_rejected'
  | 'trust_classified'
  | 'agent_selected'
  | 'task_dispatched'
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'command_executed'
  | 'sandbox_violation'
  | 'rate_limit_hit';

/**
 * Audit log entry
 */
export interface AuditLogEntry extends Identifiable, Timestamped {
  requestId: string;
  action: AuditAction;
  details: Record<string, unknown>;
  sourceIp?: string;
  userId?: string;
}
