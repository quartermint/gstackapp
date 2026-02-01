/**
 * Workflow Executor
 *
 * Implements DAG-based workflow execution with:
 * - Topological sort for execution order
 * - Parallel execution of independent steps
 * - Retry logic with configurable attempts
 * - Workflow cancellation support
 * - Step failure handling (skip dependent steps or fail workflow)
 */

import {
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowContext,
  WorkflowResult,
  ValidationResult,
  ValidationError,
  StepStatus,
  WorkflowStep,
  WorkflowStatusValue,
  createWorkflowInstance,
  areDependenciesComplete,
  hasDependencyFailed,
  hasDependencySkipped,
  getStepTimeout,
  getStepRetryCount,
} from './workflow.js';

/**
 * Active workflow instances (for cancellation support)
 */
const activeWorkflows = new Map<string, { cancelled: boolean }>();

/**
 * Validate a workflow definition
 *
 * Checks for:
 * - At least one step
 * - Unique step IDs
 * - Valid dependency references
 * - No circular dependencies
 * - No self-dependencies
 */
export function validateWorkflow(def: WorkflowDefinition): ValidationResult {
  const errors: ValidationError[] = [];

  // Check for empty workflow
  if (!def.steps || def.steps.length === 0) {
    errors.push({
      code: 'EMPTY_WORKFLOW',
      message: 'Workflow must have at least one step',
    });
    return { valid: false, errors };
  }

  // Build step ID set and check for duplicates
  const stepIds = new Set<string>();
  for (const step of def.steps) {
    if (stepIds.has(step.id)) {
      errors.push({
        code: 'DUPLICATE_STEP_ID',
        message: `Duplicate step ID: ${step.id}`,
        stepId: step.id,
      });
    }
    stepIds.add(step.id);
  }

  // Check dependencies
  for (const step of def.steps) {
    if (!step.dependsOn) continue;

    for (const depId of step.dependsOn) {
      // Check for self-dependency
      if (depId === step.id) {
        errors.push({
          code: 'SELF_DEPENDENCY',
          message: `Step ${step.id} depends on itself`,
          stepId: step.id,
        });
      }

      // Check for missing dependency
      if (!stepIds.has(depId)) {
        errors.push({
          code: 'MISSING_DEPENDENCY',
          message: `Step ${step.id} depends on unknown step: ${depId}`,
          stepId: step.id,
        });
      }
    }
  }

  // Check for circular dependencies using DFS
  const cycleError = detectCircularDependencies(def);
  if (cycleError) {
    errors.push(cycleError);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Detect circular dependencies in a workflow using DFS
 */
function detectCircularDependencies(
  def: WorkflowDefinition
): ValidationError | null {
  const stepMap = new Map<string, WorkflowStep>();
  for (const step of def.steps) {
    stepMap.set(step.id, step);
  }

  // Track visited nodes in current path (for cycle detection)
  // and globally visited (to avoid redundant checks)
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(stepId: string, path: string[]): string[] | null {
    if (visiting.has(stepId)) {
      // Found a cycle
      const cycleStart = path.indexOf(stepId);
      return path.slice(cycleStart);
    }

    if (visited.has(stepId)) {
      return null; // Already processed, no cycle through this node
    }

    const step = stepMap.get(stepId);
    if (!step) return null;

    visiting.add(stepId);
    path.push(stepId);

    if (step.dependsOn) {
      for (const depId of step.dependsOn) {
        const cycle = dfs(depId, [...path]);
        if (cycle) return cycle;
      }
    }

    visiting.delete(stepId);
    visited.add(stepId);
    return null;
  }

  for (const step of def.steps) {
    if (!visited.has(step.id)) {
      const cycle = dfs(step.id, []);
      if (cycle) {
        return {
          code: 'CIRCULAR_DEPENDENCY',
          message: `Circular dependency detected: ${cycle.join(' -> ')} -> ${cycle[0]}`,
          stepId: cycle[0],
        };
      }
    }
  }

  return null;
}

/**
 * Perform topological sort on workflow steps
 *
 * Returns steps in execution order where dependencies come before
 * the steps that depend on them.
 */
export function topologicalSort(def: WorkflowDefinition): WorkflowStep[] {
  const stepMap = new Map<string, WorkflowStep>();
  for (const step of def.steps) {
    stepMap.set(step.id, step);
  }

  const sorted: WorkflowStep[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(stepId: string): void {
    if (visited.has(stepId)) return;
    if (visiting.has(stepId)) {
      throw new Error(`Circular dependency detected at step: ${stepId}`);
    }

    visiting.add(stepId);

    const step = stepMap.get(stepId);
    if (step?.dependsOn) {
      for (const depId of step.dependsOn) {
        visit(depId);
      }
    }

    visiting.delete(stepId);
    visited.add(stepId);
    if (step) {
      sorted.push(step);
    }
  }

  for (const step of def.steps) {
    visit(step.id);
  }

  return sorted;
}

/**
 * Get steps that are ready to execute (all dependencies satisfied)
 */
export function getReadySteps(
  def: WorkflowDefinition,
  instance: WorkflowInstance
): string[] {
  const ready: string[] = [];

  for (const step of def.steps) {
    const status = instance.stepStatuses[step.id];
    if (!status) continue;

    // Skip if not pending
    if (status.status !== 'pending') continue;

    // Check if dependencies are met
    if (areDependenciesComplete(instance, step)) {
      ready.push(step.id);
    }
  }

  return ready;
}

/**
 * Execute a workflow
 *
 * @param definition - The workflow definition to execute
 * @param context - Execution context with callbacks
 * @returns Promise resolving to workflow result
 */
export async function executeWorkflow(
  definition: WorkflowDefinition,
  context: WorkflowContext
): Promise<WorkflowResult> {
  const startTime = Date.now();

  // Validate the workflow
  const validation = validateWorkflow(definition);
  if (!validation.valid) {
    return {
      instanceId: '',
      status: 'failed',
      stepResults: {},
      totalExecutionTimeMs: 0,
      completedSteps: 0,
      failedSteps: 0,
      skippedSteps: 0,
      error: `Invalid workflow: ${validation.errors.map((e) => e.message).join('; ')}`,
    };
  }

  // Create workflow instance
  const instance = createWorkflowInstance(
    definition,
    context.requestId
  );

  // Store initial context data
  if (context.initialData) {
    instance.context = { ...context.initialData };
  }

  // Register for cancellation support
  activeWorkflows.set(instance.id, { cancelled: false });

  try {
    // Update status to running
    updateWorkflowStatus(instance, 'running', context);
    instance.startedAt = Date.now();

    // Get topologically sorted steps for reference
    const sortedSteps = topologicalSort(definition);
    const stepMap = new Map<string, WorkflowStep>();
    for (const step of sortedSteps) {
      stepMap.set(step.id, step);
    }

    // Process workflow until complete
    while (!isWorkflowComplete(instance)) {
      // Check for cancellation
      const workflowState = activeWorkflows.get(instance.id);
      if (workflowState?.cancelled) {
        updateWorkflowStatus(instance, 'cancelled', context);
        break;
      }

      // Get steps ready to execute
      const readyStepIds = getReadySteps(definition, instance);

      // Mark steps with failed dependencies as skipped
      for (const step of definition.steps) {
        const status = instance.stepStatuses[step.id];
        if (status?.status === 'pending') {
          if (hasDependencyFailed(instance, step) || hasDependencySkipped(instance, step)) {
            // Check if continue on failure allows us to proceed
            const canContinue = step.dependsOn?.every((depId) => {
              const depStep = stepMap.get(depId);
              const depStatus = instance.stepStatuses[depId];
              return (
                depStatus?.status === 'completed' ||
                (depStatus?.status === 'failed' && depStep?.continueOnFailure)
              );
            });

            if (!canContinue) {
              updateStepStatus(instance, step.id, { status: 'skipped' }, context);
            }
          }
        }
      }

      if (readyStepIds.length === 0) {
        // No more steps can be executed
        // Check if there are pending steps (indicates a problem)
        const hasPending = Object.values(instance.stepStatuses).some(
          (s) => s.status === 'pending'
        );
        if (hasPending) {
          // This shouldn't happen with valid DAG, but handle gracefully
          updateWorkflowStatus(instance, 'failed', context);
          instance.error = 'Workflow stuck: steps pending but none ready';
          break;
        }
        break;
      }

      // Execute ready steps in parallel
      await Promise.all(
        readyStepIds.map((stepId) =>
          executeStep(stepId, stepMap.get(stepId)!, definition, instance, context)
        )
      );
    }

    // Determine final status
    if (instance.status !== 'cancelled') {
      const hasFailures = Object.values(instance.stepStatuses).some(
        (s) => s.status === 'failed'
      );

      // Check if all critical steps completed
      const allNonFailableCompleted = definition.steps
        .filter((s) => !s.continueOnFailure)
        .every((s) => instance.stepStatuses[s.id]?.status === 'completed');

      if (hasFailures && !allNonFailableCompleted) {
        updateWorkflowStatus(instance, 'failed', context);
      } else {
        updateWorkflowStatus(instance, 'completed', context);
      }
    }

    instance.completedAt = Date.now();

    // Calculate results
    const stepResults: Record<string, StepStatus> = { ...instance.stepStatuses };
    let completedSteps = 0;
    let failedSteps = 0;
    let skippedSteps = 0;

    for (const status of Object.values(stepResults)) {
      switch (status.status) {
        case 'completed':
          completedSteps++;
          break;
        case 'failed':
          failedSteps++;
          break;
        case 'skipped':
          skippedSteps++;
          break;
      }
    }

    return {
      instanceId: instance.id,
      status: instance.status,
      stepResults,
      totalExecutionTimeMs: Date.now() - startTime,
      completedSteps,
      failedSteps,
      skippedSteps,
      error: instance.error,
    };
  } finally {
    // Clean up
    activeWorkflows.delete(instance.id);
  }
}

/**
 * Execute a single step with retry logic
 */
async function executeStep(
  stepId: string,
  step: WorkflowStep,
  definition: WorkflowDefinition,
  instance: WorkflowInstance,
  context: WorkflowContext
): Promise<void> {
  const maxRetries = getStepRetryCount(step, definition);
  const timeout = getStepTimeout(step, definition);
  let lastError: string | undefined;

  // Update status to running
  updateStepStatus(
    instance,
    stepId,
    {
      status: 'running',
      startedAt: Date.now(),
    },
    context
  );

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check for workflow cancellation
    const workflowState = activeWorkflows.get(instance.id);
    if (workflowState?.cancelled) {
      updateStepStatus(
        instance,
        stepId,
        {
          status: 'skipped',
          completedAt: Date.now(),
        },
        context
      );
      return;
    }

    try {
      // Execute the step
      let result: { success: boolean; output?: string; error?: string };

      if (context.onStepExecute) {
        // Use provided executor
        const execPromise = context.onStepExecute(stepId, step.command);

        // Apply timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Step timeout after ${timeout}ms`)), timeout);
        });

        result = await Promise.race([execPromise, timeoutPromise]);
      } else {
        // Default mock execution (for testing)
        result = { success: true, output: `Executed: ${step.command}` };
      }

      if (result.success) {
        updateStepStatus(
          instance,
          stepId,
          {
            status: 'completed',
            completedAt: Date.now(),
            result: result.output,
            retryAttempts: attempt,
          },
          context
        );
        return;
      }

      lastError = result.error || 'Step execution failed';
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Unknown error';
    }

    // Update retry count
    const currentStatus = instance.stepStatuses[stepId];
    if (currentStatus) {
      currentStatus.retryAttempts = attempt + 1;
    }

    // Wait before retry (exponential backoff)
    if (attempt < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await sleep(delay);
    }
  }

  // All retries exhausted, mark as failed
  updateStepStatus(
    instance,
    stepId,
    {
      status: 'failed',
      completedAt: Date.now(),
      error: lastError,
      retryAttempts: maxRetries,
    },
    context
  );
}

/**
 * Update step status and trigger callback
 */
function updateStepStatus(
  instance: WorkflowInstance,
  stepId: string,
  updates: Partial<StepStatus>,
  context: WorkflowContext
): void {
  const current = instance.stepStatuses[stepId] || { status: 'pending', retryAttempts: 0 };
  const newStatus: StepStatus = { ...current, ...updates };
  instance.stepStatuses[stepId] = newStatus;
  instance.updatedAt = Date.now();

  if (context.onStepStatusChange) {
    context.onStepStatusChange(stepId, newStatus);
  }
}

/**
 * Update workflow status and trigger callback
 */
function updateWorkflowStatus(
  instance: WorkflowInstance,
  status: WorkflowStatusValue,
  context: WorkflowContext
): void {
  instance.status = status;
  instance.updatedAt = Date.now();

  if (context.onWorkflowStatusChange) {
    context.onWorkflowStatusChange(status);
  }
}

/**
 * Check if workflow execution is complete
 */
function isWorkflowComplete(instance: WorkflowInstance): boolean {
  // Check if workflow is in terminal state
  if (['completed', 'failed', 'cancelled'].includes(instance.status)) {
    return true;
  }

  // Check if all steps are in terminal state
  for (const status of Object.values(instance.stepStatuses)) {
    if (!['completed', 'failed', 'skipped'].includes(status.status)) {
      return false;
    }
  }

  return true;
}

/**
 * Cancel a running workflow
 */
export function cancelWorkflow(instanceId: string): boolean {
  const workflowState = activeWorkflows.get(instanceId);
  if (!workflowState) {
    return false;
  }

  workflowState.cancelled = true;
  return true;
}

/**
 * Get the status of an active workflow
 */
export function getActiveWorkflowStatus(instanceId: string): { active: boolean; cancelled: boolean } | null {
  const state = activeWorkflows.get(instanceId);
  if (!state) {
    return null;
  }
  return { active: true, cancelled: state.cancelled };
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
