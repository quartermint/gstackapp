/**
 * Orchestrator Service
 *
 * Handles multi-agent task orchestration for complex requests.
 * Coordinates with Claude CLI for planning and result aggregation,
 * and dispatches tasks to compute nodes via Convex.
 *
 * Flow:
 * 1. Detect if request needs orchestration
 * 2. Have Claude decompose request into task plan
 * 3. Store tasks in Convex with dependencies
 * 4. Execute tasks via workflow executor
 * 5. Aggregate results and generate summary
 */

import { getLogger } from './logger.js';
import { getConvexClient, isConvexConfigured, api } from './convex.js';
import { executeClaudeCliWithFallback, ClaudeClientOptions } from './claude-client.js';
import { executeWorkflow } from './workflow-executor.js';
import {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowContext,
  WorkflowResult,
  StepExecutionResult,
} from './workflow.js';
import {
  TaskDecompositionPlan,
  TaskDecompositionPlanSchema,
  OrchestrationTaskResult,
  OrchestrationStatus,
  detectsOrchestrationIntent,
  buildCommand,
} from '@mission-control/shared';

/**
 * Orchestration options
 */
export interface OrchestrationOptions {
  /** Request ID for audit trail */
  requestId: string;
  /** Conversation ID for context */
  conversationId?: string;
  /** Force orchestration mode */
  forceOrchestration?: boolean;
  /** Maximum parallel tasks */
  maxParallelTasks?: number;
  /** Default task timeout */
  defaultTimeout?: number;
  /** Progress callback */
  onProgress?: (status: OrchestrationStatus) => void;
}

/**
 * Orchestration result
 */
export interface OrchestrationResult {
  /** Whether orchestration was successful */
  success: boolean;
  /** Final response/summary */
  response: string;
  /** Whether orchestration was used */
  orchestrated: boolean;
  /** Workflow ID if orchestrated */
  workflowId?: string;
  /** Individual task results */
  taskResults?: OrchestrationTaskResult[];
  /** Total execution time */
  totalExecutionTimeMs?: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Planning system prompt for task decomposition
 */
const PLANNING_SYSTEM_PROMPT = `You are a task planning assistant for Mission Control, an AI orchestration system.

When given a complex request, analyze it and output a JSON task decomposition plan.

Available task actions:
- git-status, git-diff, git-log, git-pull, git-push, git-checkout, git-merge, git-rebase
- gh-pr-list, gh-pr-view, gh-pr-create, gh-pr-merge, gh-issue-list, gh-issue-view
- ssh-check, ssh-exec
- analyze, summarize, review-code, review-pr
- build, test, lint
- custom (with command field)

For each task, specify:
- id: unique identifier (e.g., "t1", "t2")
- action: one of the available actions
- description: what this task does
- target: { path, repo, branch, host, prNumber, issueNumber } as needed
- depends: array of task IDs that must complete first
- continueOnFailure: whether to continue if this task fails

Known paths:
- /Users/root1/mission-control - Main repository
- /Users/root1/mission-control-macos - macOS worktree
- /Users/root1/mission-control-ios - iOS worktree
- /Users/root1/mission-control-watchos - watchOS worktree

Known infrastructure:
- Hetzner Hub: 100.96.194.75 (SSH as root or mission user)
- Repository: vanboompow/mission-control

Output ONLY valid JSON matching this schema:
{
  "workflow": "workflow-name",
  "description": "what this workflow does",
  "tasks": [
    {
      "id": "t1",
      "action": "git-status",
      "description": "Check git status",
      "target": { "path": "/path/to/repo" },
      "depends": [],
      "continueOnFailure": false
    }
  ],
  "originalRequest": "the user's original request",
  "complexity": 1-10,
  "aggregationContext": "context for summarizing results"
}`;

/**
 * Aggregation system prompt for summarizing results
 */
const AGGREGATION_SYSTEM_PROMPT = `You are a results aggregator for Mission Control.

Given a task execution plan and its results, provide a clear, actionable summary.

Structure your response as:
1. Overview - What was requested and accomplished
2. Status - For each major component/path
3. Issues - Any failures or concerns
4. Recommendations - Suggested next steps

Be concise but thorough. Use markdown formatting.`;

/**
 * Check if a message requires orchestration
 */
export function requiresOrchestration(
  message: string,
  options: OrchestrationOptions
): boolean {
  if (options.forceOrchestration) {
    return true;
  }

  return detectsOrchestrationIntent(message);
}

/**
 * Parse task decomposition plan from Claude's response
 */
function parsePlan(response: string): TaskDecompositionPlan | null {
  const logger = getLogger();

  try {
    // Extract JSON from response (may be wrapped in markdown code blocks)
    let jsonStr = response;

    // Try to extract from code block
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // Try to find JSON object
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr) as unknown;
    const validated = TaskDecompositionPlanSchema.parse(parsed);

    logger.debug({ taskCount: validated.tasks.length }, 'Parsed task decomposition plan');
    return validated;
  } catch (error) {
    logger.warn({ error, response: response.slice(0, 500) }, 'Failed to parse task plan');
    return null;
  }
}

/**
 * Convert decomposed tasks to workflow definition
 */
function createWorkflowDefinition(
  plan: TaskDecompositionPlan,
  options: OrchestrationOptions
): WorkflowDefinition {
  const steps: WorkflowStep[] = plan.tasks.map((task) => ({
    id: task.id,
    name: task.description || task.action,
    command: buildCommand(task),
    dependsOn: task.depends,
    timeout: task.timeout || options.defaultTimeout || 60000,
    continueOnFailure: task.continueOnFailure,
  }));

  return {
    id: `workflow-${options.requestId}`,
    name: plan.workflow,
    description: plan.description,
    steps,
    defaultTimeout: options.defaultTimeout || 60000,
    metadata: {
      originalRequest: plan.originalRequest,
      aggregationContext: plan.aggregationContext,
    },
  };
}

/**
 * Execute a workflow step by dispatching to compute or executing locally
 */
async function executeStep(
  stepId: string,
  command: string,
  options: OrchestrationOptions
): Promise<StepExecutionResult> {
  const logger = getLogger();
  const startTime = Date.now();

  logger.info({ stepId, command }, 'Executing workflow step');

  // For now, execute commands via Claude CLI for analysis tasks
  // or directly via child_process for system commands
  if (command.startsWith('echo "')) {
    // Analysis task - use Claude
    try {
      const response = await executeClaudeCliWithFallback(
        `Execute this task: ${command}`,
        { timeout: options.defaultTimeout || 60000 }
      );

      return {
        success: true,
        output: response.content,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  // For system commands, we would dispatch to compute nodes
  // For now, store in Convex for compute node pickup
  if (isConvexConfigured()) {
    try {
      const client = getConvexClient();
      await client.mutation(api.tasks.create, {
        requestId: options.requestId,
        command,
        priority: 1,
      });

      // In a real implementation, we would wait for the compute node
      // to pick up and complete the task. For now, return pending status.
      return {
        success: true,
        output: `Task dispatched to compute node: ${command}`,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error({ error, stepId }, 'Failed to dispatch task to Convex');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to dispatch task',
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  // Fallback: log that we would execute
  return {
    success: true,
    output: `[Would execute]: ${command}`,
    executionTimeMs: Date.now() - startTime,
  };
}

/**
 * Aggregate task results into a summary response
 */
async function aggregateResults(
  plan: TaskDecompositionPlan,
  workflowResult: WorkflowResult
): Promise<string> {
  const logger = getLogger();

  // Build context for aggregation
  const resultsContext = Object.entries(workflowResult.stepResults)
    .map(([stepId, status]) => {
      const task = plan.tasks.find(t => t.id === stepId);
      return `## Task: ${task?.description || stepId}
Status: ${status.status}
${status.result ? `Output:\n${status.result}` : ''}
${status.error ? `Error: ${status.error}` : ''}`;
    })
    .join('\n\n');

  const prompt = `Original request: ${plan.originalRequest}

Workflow: ${plan.workflow}
Context: ${plan.aggregationContext || 'N/A'}

Total tasks: ${plan.tasks.length}
Completed: ${workflowResult.completedSteps}
Failed: ${workflowResult.failedSteps}
Skipped: ${workflowResult.skippedSteps}
Duration: ${workflowResult.totalExecutionTimeMs}ms

Task Results:
${resultsContext}

Please provide a summary of what was accomplished and any recommendations.`;

  try {
    const claudeOptions: ClaudeClientOptions = {
      systemPrompt: AGGREGATION_SYSTEM_PROMPT,
      timeout: 60000,
    };

    const response = await executeClaudeCliWithFallback(prompt, claudeOptions);
    return response.content;
  } catch (error) {
    logger.error({ error }, 'Failed to aggregate results with Claude');

    // Fallback summary
    return `## Orchestration Summary

**Workflow:** ${plan.workflow}

**Results:**
- Completed: ${workflowResult.completedSteps}/${plan.tasks.length}
- Failed: ${workflowResult.failedSteps}
- Duration: ${workflowResult.totalExecutionTimeMs}ms

${workflowResult.error ? `**Error:** ${workflowResult.error}` : ''}

**Task Details:**
${resultsContext}`;
  }
}

/**
 * Store conversation history and messages to Convex
 */
async function storeToConvex(
  conversationId: string | undefined,
  userMessage: string,
  assistantResponse: string,
  trustLevel: 'internal' | 'authenticated' | 'untrusted' = 'internal',
  agentProfile: 'chat-readonly' | 'code-assistant' | 'task-orchestrator' = 'task-orchestrator'
): Promise<string> {
  if (!isConvexConfigured()) {
    return conversationId || crypto.randomUUID();
  }

  const logger = getLogger();
  const client = getConvexClient();

  try {
    // Create conversation if needed
    let convId = conversationId;
    if (!convId) {
      convId = await client.mutation(api.conversations.create, {
        trustLevel,
        agentProfile,
        title: userMessage.slice(0, 100),
      });
    }

    // Store user message
    await client.mutation(api.messages.create, {
      conversationId: convId as unknown as string,
      role: 'user',
      content: userMessage,
    });

    // Store assistant response
    await client.mutation(api.messages.create, {
      conversationId: convId as unknown as string,
      role: 'assistant',
      content: assistantResponse,
    });

    return convId;
  } catch (error) {
    logger.error({ error }, 'Failed to store messages to Convex');
    return conversationId || crypto.randomUUID();
  }
}

/**
 * Fetch conversation history from Convex
 */
async function fetchConversationHistory(
  conversationId: string
): Promise<Array<{ role: 'user' | 'assistant' | 'system'; content: string }>> {
  if (!isConvexConfigured()) {
    return [];
  }

  const logger = getLogger();
  const client = getConvexClient();

  try {
    const result = await client.query(api.messages.listByConversation, {
      conversationId: conversationId as unknown as string,
      limit: 20,
    });

    // Handle the actual return type from Convex
    const messages = Array.isArray(result) ? result : [];

    return messages.map((msg: unknown) => {
      const m = msg as { role: string; content: string };
      return {
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      };
    });
  } catch (error) {
    logger.warn({ error, conversationId }, 'Failed to fetch conversation history');
    return [];
  }
}

/**
 * Build prompt with conversation history
 */
function buildPromptWithHistory(
  message: string,
  history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
): string {
  if (history.length === 0) {
    return message;
  }

  const historyText = history
    .slice(-10) // Last 10 messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  return `Previous conversation:
${historyText}

Current request:
${message}`;
}

/**
 * Main orchestration function
 *
 * Takes a user message and orchestrates complex requests through
 * task decomposition, parallel execution, and result aggregation.
 */
export async function orchestrate(
  message: string,
  options: OrchestrationOptions
): Promise<OrchestrationResult> {
  const logger = getLogger();
  const startTime = Date.now();

  logger.info({
    requestId: options.requestId,
    messageLength: message.length,
    forceOrchestration: options.forceOrchestration,
  }, 'Starting orchestration');

  // Check if orchestration is needed
  const needsOrchestration = requiresOrchestration(message, options);

  if (!needsOrchestration) {
    // Simple request - just use Claude directly with conversation context
    const history = options.conversationId
      ? await fetchConversationHistory(options.conversationId)
      : [];

    const promptWithHistory = buildPromptWithHistory(message, history);

    try {
      const response = await executeClaudeCliWithFallback(promptWithHistory, {
        conversationId: options.conversationId,
        timeout: options.defaultTimeout || 120000,
      });

      // Store to Convex
      await storeToConvex(
        options.conversationId,
        message,
        response.content
      );

      return {
        success: true,
        response: response.content,
        orchestrated: false,
        totalExecutionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error({ error }, 'Claude execution failed');
      return {
        success: false,
        response: '',
        orchestrated: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        totalExecutionTimeMs: Date.now() - startTime,
      };
    }
  }

  // Complex request - orchestrate
  logger.info({ requestId: options.requestId }, 'Request requires orchestration');

  // Report planning status
  if (options.onProgress) {
    options.onProgress({
      workflowId: `workflow-${options.requestId}`,
      status: 'planning',
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      progress: 5,
      elapsedTimeMs: Date.now() - startTime,
    });
  }

  // Step 1: Get conversation history
  const history = options.conversationId
    ? await fetchConversationHistory(options.conversationId)
    : [];

  // Step 2: Have Claude decompose the request
  const planningPrompt = buildPromptWithHistory(
    `Please analyze this request and create a task decomposition plan:\n\n${message}`,
    history
  );

  let plan: TaskDecompositionPlan | null = null;

  try {
    const planResponse = await executeClaudeCliWithFallback(planningPrompt, {
      systemPrompt: PLANNING_SYSTEM_PROMPT,
      timeout: 60000,
    });

    plan = parsePlan(planResponse.content);
  } catch (error) {
    logger.error({ error }, 'Failed to get task decomposition from Claude');
  }

  if (!plan) {
    // Fallback to direct execution
    logger.warn('Could not parse task plan, falling back to direct execution');

    try {
      const response = await executeClaudeCliWithFallback(message, {
        conversationId: options.conversationId,
        timeout: options.defaultTimeout || 120000,
      });

      return {
        success: true,
        response: response.content,
        orchestrated: false,
        totalExecutionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        response: '',
        orchestrated: false,
        error: error instanceof Error ? error.message : 'Failed to process request',
        totalExecutionTimeMs: Date.now() - startTime,
      };
    }
  }

  // Report executing status
  if (options.onProgress) {
    options.onProgress({
      workflowId: `workflow-${options.requestId}`,
      status: 'executing',
      totalTasks: plan.tasks.length,
      completedTasks: 0,
      failedTasks: 0,
      progress: 15,
      elapsedTimeMs: Date.now() - startTime,
    });
  }

  // Step 3: Convert to workflow and execute
  const workflowDef = createWorkflowDefinition(plan, options);

  const workflowContext: WorkflowContext = {
    requestId: options.requestId,
    onStepExecute: async (stepId, command) => {
      return executeStep(stepId, command, options);
    },
    onStepStatusChange: (stepId, status) => {
      logger.debug({ stepId, status: status.status }, 'Step status changed');
    },
  };

  let workflowResult: WorkflowResult;

  try {
    workflowResult = await executeWorkflow(workflowDef, workflowContext);
  } catch (error) {
    logger.error({ error }, 'Workflow execution failed');
    return {
      success: false,
      response: '',
      orchestrated: true,
      workflowId: workflowDef.id,
      error: error instanceof Error ? error.message : 'Workflow execution failed',
      totalExecutionTimeMs: Date.now() - startTime,
    };
  }

  // Report aggregating status
  if (options.onProgress) {
    options.onProgress({
      workflowId: workflowDef.id,
      status: 'aggregating',
      totalTasks: plan.tasks.length,
      completedTasks: workflowResult.completedSteps,
      failedTasks: workflowResult.failedSteps,
      progress: 90,
      elapsedTimeMs: Date.now() - startTime,
    });
  }

  // Step 4: Aggregate results
  const summary = await aggregateResults(plan, workflowResult);

  // Store to Convex
  await storeToConvex(
    options.conversationId,
    message,
    summary
  );

  // Build task results
  const taskResults: OrchestrationTaskResult[] = plan.tasks.map(task => {
    const stepStatus = workflowResult.stepResults[task.id];
    return {
      taskId: task.id,
      success: stepStatus?.status === 'completed',
      output: stepStatus?.result,
      error: stepStatus?.error,
    };
  });

  // Report completed status
  if (options.onProgress) {
    options.onProgress({
      workflowId: workflowDef.id,
      status: 'completed',
      totalTasks: plan.tasks.length,
      completedTasks: workflowResult.completedSteps,
      failedTasks: workflowResult.failedSteps,
      progress: 100,
      elapsedTimeMs: Date.now() - startTime,
    });
  }

  return {
    success: workflowResult.status === 'completed',
    response: summary,
    orchestrated: true,
    workflowId: workflowDef.id,
    taskResults,
    totalExecutionTimeMs: Date.now() - startTime,
  };
}

/**
 * Export for testing
 */
export const __testing = {
  parsePlan,
  createWorkflowDefinition,
  buildPromptWithHistory,
  PLANNING_SYSTEM_PROMPT,
  AGGREGATION_SYSTEM_PROMPT,
};
