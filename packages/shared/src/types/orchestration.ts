/**
 * Orchestration Types
 *
 * Defines types for multi-agent task orchestration and decomposition.
 * Used by the Hub to break complex requests into parallel/sequential tasks
 * that can be dispatched to compute nodes.
 */

import { z } from 'zod';

/**
 * Available task action types for orchestration
 */
export const TaskActionValues = [
  // Git operations
  'git-status',
  'git-diff',
  'git-log',
  'git-pull',
  'git-push',
  'git-checkout',
  'git-merge',
  'git-rebase',
  // GitHub operations
  'gh-pr-list',
  'gh-pr-view',
  'gh-pr-create',
  'gh-pr-merge',
  'gh-issue-list',
  'gh-issue-view',
  // SSH operations
  'ssh-check',
  'ssh-exec',
  // Analysis operations
  'analyze',
  'summarize',
  'review-code',
  'review-pr',
  // Build operations
  'build',
  'test',
  'lint',
  // Custom command
  'custom',
] as const;

export type TaskAction = (typeof TaskActionValues)[number];

/**
 * Task target type
 */
export const TaskTargetSchema = z.object({
  /** Path to local directory */
  path: z.string().optional(),
  /** Repository owner/name */
  repo: z.string().optional(),
  /** Branch name */
  branch: z.string().optional(),
  /** SSH host */
  host: z.string().optional(),
  /** PR number */
  prNumber: z.number().optional(),
  /** Issue number */
  issueNumber: z.number().optional(),
});

export type TaskTarget = z.infer<typeof TaskTargetSchema>;

/**
 * Decomposed task schema
 */
export const DecomposedTaskSchema = z.object({
  /** Unique task identifier within the workflow */
  id: z.string().min(1),
  /** Task action type */
  action: z.enum(TaskActionValues),
  /** Human-readable task description */
  description: z.string().optional(),
  /** Task target (path, repo, host, etc.) */
  target: TaskTargetSchema.optional(),
  /** Task IDs that must complete before this task */
  depends: z.array(z.string()).optional(),
  /** Custom command (when action is 'custom') */
  command: z.string().optional(),
  /** Priority (higher = more urgent) */
  priority: z.number().default(0),
  /** Timeout in milliseconds */
  timeout: z.number().optional(),
  /** Whether to continue workflow if this task fails */
  continueOnFailure: z.boolean().default(false),
});

export type DecomposedTask = z.infer<typeof DecomposedTaskSchema>;

/**
 * Task decomposition plan schema
 */
export const TaskDecompositionPlanSchema = z.object({
  /** Workflow name/type */
  workflow: z.string().min(1),
  /** Human-readable description of the plan */
  description: z.string().optional(),
  /** List of decomposed tasks */
  tasks: z.array(DecomposedTaskSchema).min(1),
  /** Original user request */
  originalRequest: z.string(),
  /** Estimated complexity (1-10) */
  complexity: z.number().min(1).max(10).optional(),
  /** Context needed for result aggregation */
  aggregationContext: z.string().optional(),
});

export type TaskDecompositionPlan = z.infer<typeof TaskDecompositionPlanSchema>;

/**
 * Task execution result
 */
export const OrchestrationTaskResultSchema = z.object({
  /** Task ID */
  taskId: z.string(),
  /** Whether the task succeeded */
  success: z.boolean(),
  /** Task output */
  output: z.string().optional(),
  /** Error message if failed */
  error: z.string().optional(),
  /** Execution time in milliseconds */
  executionTimeMs: z.number().optional(),
  /** Node that executed the task */
  nodeId: z.string().optional(),
  /** Exit code if applicable */
  exitCode: z.number().optional(),
});

export type OrchestrationTaskResult = z.infer<typeof OrchestrationTaskResultSchema>;

/**
 * Orchestration request - sent from client to Hub
 */
export const OrchestrationRequestSchema = z.object({
  /** User's message/request */
  message: z.string().min(1).max(50000),
  /** Conversation ID for context */
  conversationId: z.string().optional(),
  /** Agent profile override */
  agentProfile: z.enum(['chat-readonly', 'code-assistant', 'task-orchestrator']).optional(),
  /** Force orchestration mode */
  forceOrchestration: z.boolean().optional(),
});

export type OrchestrationRequest = z.infer<typeof OrchestrationRequestSchema>;

/**
 * Orchestration response - returned from Hub to client
 */
export const OrchestrationResponseSchema = z.object({
  /** Whether the request was successful */
  success: z.boolean(),
  /** The final response/summary */
  response: z.string(),
  /** Conversation ID */
  conversationId: z.string(),
  /** Request ID for audit trail */
  requestId: z.string(),
  /** Whether orchestration was used */
  orchestrated: z.boolean(),
  /** Workflow ID if orchestrated */
  workflowId: z.string().optional(),
  /** Task results if orchestrated */
  taskResults: z.array(OrchestrationTaskResultSchema).optional(),
  /** Execution time in milliseconds */
  totalExecutionTimeMs: z.number().optional(),
});

export type OrchestrationResponse = z.infer<typeof OrchestrationResponseSchema>;

/**
 * Orchestration status for progress tracking
 */
export const OrchestrationStatusSchema = z.object({
  /** Workflow ID */
  workflowId: z.string(),
  /** Current status */
  status: z.enum(['planning', 'executing', 'aggregating', 'completed', 'failed']),
  /** Total tasks */
  totalTasks: z.number(),
  /** Completed tasks */
  completedTasks: z.number(),
  /** Failed tasks */
  failedTasks: z.number(),
  /** Current task being executed (if any) */
  currentTask: z.string().optional(),
  /** Progress percentage (0-100) */
  progress: z.number(),
  /** Elapsed time in milliseconds */
  elapsedTimeMs: z.number(),
});

export type OrchestrationStatus = z.infer<typeof OrchestrationStatusSchema>;

/**
 * Check if a request likely requires orchestration
 * based on keywords and patterns
 */
export function detectsOrchestrationIntent(message: string): boolean {
  const orchestrationPatterns = [
    // Multi-target patterns
    /(?:all|multiple|each|every)\s+(?:repo|repositor|branch|worktree|node|server)/i,
    // Complex action patterns
    /(?:deploy|orchestrat|coordinat|synchroniz|analyz|evaluat|review|audit)\s+(?:agents?|tasks?|all|multiple)/i,
    // Workflow patterns
    /(?:first|then|after|before|finally|next)\s+/i,
    // Parallel patterns
    /(?:in parallel|concurrently|simultaneously|at the same time)/i,
    // Multi-step patterns
    /(?:and then|followed by|once .+ is done)/i,
    // Infrastructure patterns
    /(?:mac mini|hetzner|compute node|all servers|worktrees?)/i,
  ];

  return orchestrationPatterns.some(pattern => pattern.test(message));
}

/**
 * Map task action to executable command template
 */
export function getCommandTemplate(action: TaskAction): string {
  const templates: Record<TaskAction, string> = {
    'git-status': 'git -C {path} status',
    'git-diff': 'git -C {path} diff',
    'git-log': 'git -C {path} log --oneline -10',
    'git-pull': 'git -C {path} pull',
    'git-push': 'git -C {path} push',
    'git-checkout': 'git -C {path} checkout {branch}',
    'git-merge': 'git -C {path} merge {branch}',
    'git-rebase': 'git -C {path} rebase {branch}',
    'gh-pr-list': 'gh pr list --repo {repo}',
    'gh-pr-view': 'gh pr view {prNumber} --repo {repo}',
    'gh-pr-create': 'gh pr create --repo {repo}',
    'gh-pr-merge': 'gh pr merge {prNumber} --repo {repo}',
    'gh-issue-list': 'gh issue list --repo {repo}',
    'gh-issue-view': 'gh issue view {issueNumber} --repo {repo}',
    'ssh-check': 'ssh -o ConnectTimeout=5 -o BatchMode=yes {host} "uptime"',
    'ssh-exec': 'ssh {host} "{command}"',
    'analyze': 'echo "Analysis task - handled by Claude"',
    'summarize': 'echo "Summarization task - handled by Claude"',
    'review-code': 'echo "Code review task - handled by Claude"',
    'review-pr': 'gh pr view {prNumber} --repo {repo} --comments',
    'build': 'cd {path} && pnpm build',
    'test': 'cd {path} && pnpm test',
    'lint': 'cd {path} && pnpm lint',
    'custom': '{command}',
  };

  return templates[action];
}

/**
 * Build command from task action and target
 */
export function buildCommand(task: DecomposedTask): string {
  let template = getCommandTemplate(task.action);
  const target = task.target || {};

  // Replace template variables
  template = template.replace('{path}', target.path || '.');
  template = template.replace('{repo}', target.repo || '');
  template = template.replace('{branch}', target.branch || 'main');
  template = template.replace('{host}', target.host || '');
  template = template.replace('{prNumber}', String(target.prNumber || ''));
  template = template.replace('{issueNumber}', String(target.issueNumber || ''));
  template = template.replace('{command}', task.command || '');

  return template;
}
