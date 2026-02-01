import { z } from 'zod';
import { LIMITS } from '../constants.js';

/**
 * Task status schema
 */
export const TaskStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * Task dispatch request schema (Hub -> Compute)
 */
export const TaskDispatchSchema = z.object({
  /** Unique task ID */
  taskId: z.string().uuid(),
  /** Request ID for audit trail */
  requestId: z.string(),
  /** Command to execute */
  command: z.string().min(1).max(LIMITS.MAX_INPUT_LENGTH),
  /** Working directory (within sandbox) */
  workingDir: z.string().optional(),
  /** Environment variables */
  env: z.record(z.string()).optional(),
  /** Timeout in milliseconds */
  timeoutMs: z
    .number()
    .min(1000)
    .max(LIMITS.MAX_TASK_TIMEOUT_MS)
    .default(LIMITS.DEFAULT_TASK_TIMEOUT_MS),
  /** Priority (higher = more urgent) */
  priority: z.number().min(0).max(100).default(50),
  /** Required capabilities (tags) for node selection */
  requiredCapabilities: z.array(z.string()).optional(),
});

export type TaskDispatch = z.infer<typeof TaskDispatchSchema>;

/**
 * Task result schema (Compute -> Hub)
 */
export const TaskResultSchema = z.object({
  /** Task ID */
  taskId: z.string().uuid(),
  /** Request ID */
  requestId: z.string(),
  /** Final status */
  status: TaskStatusSchema,
  /** Exit code (if completed) */
  exitCode: z.number().optional(),
  /** Standard output */
  stdout: z.string().max(LIMITS.MAX_OUTPUT_LENGTH).optional(),
  /** Standard error */
  stderr: z.string().max(LIMITS.MAX_OUTPUT_LENGTH).optional(),
  /** Error message (if failed) */
  errorMessage: z.string().optional(),
  /** Execution time in milliseconds */
  executionTimeMs: z.number().optional(),
  /** Node that executed the task */
  nodeId: z.string(),
});

export type TaskResult = z.infer<typeof TaskResultSchema>;

/**
 * Task query parameters
 */
export const TaskQuerySchema = z.object({
  status: TaskStatusSchema.optional(),
  nodeId: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export type TaskQuery = z.infer<typeof TaskQuerySchema>;
