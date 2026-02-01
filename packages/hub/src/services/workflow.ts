/**
 * Workflow Definition and Types
 *
 * Provides the core types and schemas for multi-step workflow orchestration
 * with task dependencies and DAG execution support.
 *
 * Workflows are composed of steps that can have dependencies on other steps.
 * The executor uses topological sorting to determine execution order and
 * runs independent steps in parallel.
 */

import { z } from 'zod';

/**
 * Step status values
 */
export const StepStatusValues = [
  'pending',
  'ready',
  'running',
  'completed',
  'failed',
  'skipped',
] as const;

export type StepStatusValue = (typeof StepStatusValues)[number];

/**
 * Workflow status values
 */
export const WorkflowStatusValues = [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const;

export type WorkflowStatusValue = (typeof WorkflowStatusValues)[number];

/**
 * Step status schema
 */
export const StepStatusSchema = z.object({
  /** Current status of the step */
  status: z.enum(StepStatusValues),
  /** When the step started executing */
  startedAt: z.number().optional(),
  /** When the step completed (success or failure) */
  completedAt: z.number().optional(),
  /** Result output from the step */
  result: z.string().optional(),
  /** Error message if the step failed */
  error: z.string().optional(),
  /** Number of retry attempts made */
  retryAttempts: z.number().default(0),
});

export type StepStatus = z.infer<typeof StepStatusSchema>;

/**
 * Workflow step schema
 */
export const WorkflowStepSchema = z.object({
  /** Unique step identifier within the workflow */
  id: z.string().min(1),
  /** Human-readable step name */
  name: z.string().min(1),
  /** Command to execute */
  command: z.string().min(1),
  /** Step IDs this step depends on (must complete before this step runs) */
  dependsOn: z.array(z.string()).optional(),
  /** Timeout in milliseconds for this step */
  timeout: z.number().min(1000).max(600000).optional(),
  /** Number of times to retry on failure */
  retryCount: z.number().min(0).max(5).optional(),
  /** Whether to continue workflow execution if this step fails */
  continueOnFailure: z.boolean().optional(),
  /** Required node capabilities for this step */
  requiredCapabilities: z.array(z.string()).optional(),
  /** Environment variables for this step */
  env: z.record(z.string()).optional(),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

/**
 * Workflow definition schema
 */
export const WorkflowDefinitionSchema = z.object({
  /** Unique workflow identifier */
  id: z.string().min(1),
  /** Human-readable workflow name */
  name: z.string().min(1),
  /** Workflow description */
  description: z.string().optional(),
  /** Ordered list of workflow steps */
  steps: z.array(WorkflowStepSchema).min(1),
  /** Default timeout for steps without explicit timeout */
  defaultTimeout: z.number().min(1000).max(600000).optional(),
  /** Default retry count for steps without explicit retryCount */
  defaultRetryCount: z.number().min(0).max(5).optional(),
  /** Workflow metadata */
  metadata: z.record(z.unknown()).optional(),
});

export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

/**
 * Workflow instance schema (runtime state)
 */
export const WorkflowInstanceSchema = z.object({
  /** Unique instance identifier */
  id: z.string().min(1),
  /** Reference to the workflow definition */
  definitionId: z.string().min(1),
  /** Request ID for audit trail */
  requestId: z.string().min(1),
  /** Current workflow status */
  status: z.enum(WorkflowStatusValues),
  /** Status of each step (keyed by step ID) */
  stepStatuses: z.record(StepStatusSchema),
  /** Workflow creation timestamp */
  createdAt: z.number(),
  /** Last update timestamp */
  updatedAt: z.number(),
  /** When the workflow started executing */
  startedAt: z.number().optional(),
  /** When the workflow completed */
  completedAt: z.number().optional(),
  /** Context data passed between steps */
  context: z.record(z.unknown()).optional(),
  /** Error message if workflow failed */
  error: z.string().optional(),
});

export type WorkflowInstance = z.infer<typeof WorkflowInstanceSchema>;

/**
 * Workflow execution context
 */
export interface WorkflowContext {
  /** Request ID for audit trail */
  requestId: string;
  /** User or service ID that triggered the workflow */
  triggeredBy?: string;
  /** Initial context data */
  initialData?: Record<string, unknown>;
  /** Step execution callback */
  onStepExecute?: (stepId: string, command: string) => Promise<StepExecutionResult>;
  /** Step status change callback */
  onStepStatusChange?: (stepId: string, status: StepStatus) => void;
  /** Workflow status change callback */
  onWorkflowStatusChange?: (status: WorkflowStatusValue) => void;
}

/**
 * Step execution result
 */
export interface StepExecutionResult {
  /** Whether the step succeeded */
  success: boolean;
  /** Output from the step */
  output?: string;
  /** Error message if failed */
  error?: string;
  /** Exit code from command execution */
  exitCode?: number;
  /** Execution time in milliseconds */
  executionTimeMs?: number;
}

/**
 * Workflow execution result
 */
export interface WorkflowResult {
  /** Workflow instance ID */
  instanceId: string;
  /** Final workflow status */
  status: WorkflowStatusValue;
  /** Step results keyed by step ID */
  stepResults: Record<string, StepStatus>;
  /** Total execution time in milliseconds */
  totalExecutionTimeMs: number;
  /** Number of steps completed */
  completedSteps: number;
  /** Number of steps failed */
  failedSteps: number;
  /** Number of steps skipped */
  skippedSteps: number;
  /** Error message if workflow failed */
  error?: string;
}

/**
 * Validation result for workflow definitions
 */
export interface ValidationResult {
  /** Whether the workflow definition is valid */
  valid: boolean;
  /** Validation errors if invalid */
  errors: ValidationError[];
}

/**
 * Validation error details
 */
export interface ValidationError {
  /** Error code */
  code: ValidationErrorCode;
  /** Human-readable error message */
  message: string;
  /** Related step ID if applicable */
  stepId?: string;
}

/**
 * Validation error codes
 */
export type ValidationErrorCode =
  | 'EMPTY_WORKFLOW'
  | 'DUPLICATE_STEP_ID'
  | 'MISSING_DEPENDENCY'
  | 'CIRCULAR_DEPENDENCY'
  | 'SELF_DEPENDENCY'
  | 'INVALID_STEP';

/**
 * Create an initial step status
 */
export function createInitialStepStatus(): StepStatus {
  return {
    status: 'pending',
    retryAttempts: 0,
  };
}

/**
 * Create an initial workflow instance from a definition
 */
export function createWorkflowInstance(
  definition: WorkflowDefinition,
  requestId: string,
  instanceId?: string
): WorkflowInstance {
  const now = Date.now();
  const stepStatuses: Record<string, StepStatus> = {};

  for (const step of definition.steps) {
    stepStatuses[step.id] = createInitialStepStatus();
  }

  return {
    id: instanceId || crypto.randomUUID(),
    definitionId: definition.id,
    requestId,
    status: 'pending',
    stepStatuses,
    createdAt: now,
    updatedAt: now,
    context: {},
  };
}

/**
 * Check if a step's dependencies are all completed
 */
export function areDependenciesComplete(
  instance: WorkflowInstance,
  step: WorkflowStep
): boolean {
  if (!step.dependsOn || step.dependsOn.length === 0) {
    return true;
  }

  for (const depId of step.dependsOn) {
    const depStatus = instance.stepStatuses[depId];
    if (!depStatus || depStatus.status !== 'completed') {
      return false;
    }
  }

  return true;
}

/**
 * Check if any of a step's dependencies have failed
 */
export function hasDependencyFailed(
  instance: WorkflowInstance,
  step: WorkflowStep
): boolean {
  if (!step.dependsOn || step.dependsOn.length === 0) {
    return false;
  }

  for (const depId of step.dependsOn) {
    const depStatus = instance.stepStatuses[depId];
    if (depStatus && depStatus.status === 'failed') {
      return true;
    }
  }

  return false;
}

/**
 * Check if any of a step's dependencies have been skipped
 */
export function hasDependencySkipped(
  instance: WorkflowInstance,
  step: WorkflowStep
): boolean {
  if (!step.dependsOn || step.dependsOn.length === 0) {
    return false;
  }

  for (const depId of step.dependsOn) {
    const depStatus = instance.stepStatuses[depId];
    if (depStatus && depStatus.status === 'skipped') {
      return true;
    }
  }

  return false;
}

/**
 * Get the effective timeout for a step
 */
export function getStepTimeout(
  step: WorkflowStep,
  definition: WorkflowDefinition
): number {
  return step.timeout || definition.defaultTimeout || 30000;
}

/**
 * Get the effective retry count for a step
 */
export function getStepRetryCount(
  step: WorkflowStep,
  definition: WorkflowDefinition
): number {
  return step.retryCount ?? definition.defaultRetryCount ?? 0;
}
