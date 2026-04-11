import { pgTable, text, integer, serial, boolean, timestamp, real, index, uniqueIndex, unique } from 'drizzle-orm/pg-core'

// ── GitHub Installations ──────────────────────────────────────────────────────

export const githubInstallations = pgTable('github_installations', {
  id: integer('id').primaryKey(), // GitHub installation ID
  accountLogin: text('account_login').notNull(),
  accountType: text('account_type').notNull(), // 'User' | 'Organization'
  appId: integer('app_id').notNull(),
  status: text('status').notNull().default('active'), // active | suspended | deleted
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
})

// ── Repositories ──────────────────────────────────────────────────────────────

export const repositories = pgTable('repositories', {
  id: integer('id').primaryKey(), // GitHub repo ID
  installationId: integer('installation_id')
    .notNull()
    .references(() => githubInstallations.id),
  fullName: text('full_name').notNull(), // owner/repo
  defaultBranch: text('default_branch').notNull().default('main'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index('repo_installation_idx').on(table.installationId),
])

// ── Pull Requests ─────────────────────────────────────────────────────────────

export const pullRequests = pgTable('pull_requests', {
  id: serial('id').primaryKey(),
  repoId: integer('repo_id')
    .notNull()
    .references(() => repositories.id),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  authorLogin: text('author_login').notNull(),
  headSha: text('head_sha').notNull(),
  baseBranch: text('base_branch').notNull(),
  state: text('state').notNull().default('open'), // open | closed | merged
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('pr_repo_number_idx').on(table.repoId, table.number),
])

// ── Review Units (generalizes PRs + Pushes) ──────────────────────────────────

export const reviewUnits = pgTable('review_units', {
  id: serial('id').primaryKey(),
  repoId: integer('repo_id')
    .notNull()
    .references(() => repositories.id),
  type: text('type').notNull(), // 'pr' | 'push'
  title: text('title').notNull(),
  authorLogin: text('author_login').notNull(),
  headSha: text('head_sha').notNull(),
  baseSha: text('base_sha'),
  ref: text('ref'),
  prNumber: integer('pr_number'),
  state: text('state').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('review_unit_dedup_idx').on(table.repoId, table.type, table.headSha),
])

// ── Pipeline Runs ─────────────────────────────────────────────────────────────

export const pipelineRuns = pgTable('pipeline_runs', {
  id: text('id').primaryKey(), // nanoid
  deliveryId: text('delivery_id').notNull(), // X-GitHub-Delivery
  prId: integer('pr_id')
    .references(() => pullRequests.id),
  reviewUnitId: integer('review_unit_id')
    .references(() => reviewUnits.id),
  installationId: integer('installation_id').notNull(),
  headSha: text('head_sha').notNull(),
  status: text('status').notNull().default('PENDING'),
    // PENDING | RUNNING | COMPLETED | FAILED | CANCELLED | STALE
  commentId: integer('comment_id'), // GitHub comment ID (set after first post)
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('delivery_id_idx').on(table.deliveryId),
  index('pipeline_pr_idx').on(table.prId),
  index('pipeline_status_idx').on(table.status),
  index('pipeline_review_unit_idx').on(table.reviewUnitId),
])

// ── Stage Results ─────────────────────────────────────────────────────────────

export const stageResults = pgTable('stage_results', {
  id: text('id').primaryKey(), // nanoid
  pipelineRunId: text('pipeline_run_id')
    .notNull()
    .references(() => pipelineRuns.id),
  stage: text('stage').notNull(), // ceo | eng | design | qa | security
  verdict: text('verdict').notNull().default('PENDING'),
    // PENDING | RUNNING | PASS | FLAG | BLOCK | SKIP
  summary: text('summary'),
  tokenUsage: integer('token_usage'),
  durationMs: integer('duration_ms'),
  error: text('error'),
  providerModel: text('provider_model'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('stage_pipeline_idx').on(table.pipelineRunId),
  uniqueIndex('stage_run_stage_idx').on(table.pipelineRunId, table.stage),
])

// ── Findings ──────────────────────────────────────────────────────────────────

export const findings = pgTable('findings', {
  id: text('id').primaryKey(), // nanoid
  stageResultId: text('stage_result_id')
    .notNull()
    .references(() => stageResults.id),
  pipelineRunId: text('pipeline_run_id')
    .notNull()
    .references(() => pipelineRuns.id),
  severity: text('severity').notNull(), // critical | notable | minor
  category: text('category').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  filePath: text('file_path'),
  lineStart: integer('line_start'),
  lineEnd: integer('line_end'),
  suggestion: text('suggestion'),
  codeSnippet: text('code_snippet'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  // Feedback columns (D-14: stored for future prompt improvement, not auto-applied in v1)
  feedbackVote: text('feedback_vote'), // 'up' | 'down' | null
  feedbackNote: text('feedback_note'), // optional context from dashboard
  feedbackSource: text('feedback_source'), // 'github_reaction' | 'dashboard'
  feedbackAt: timestamp('feedback_at', { withTimezone: true }), // when feedback was given
  ghReviewCommentId: integer('gh_review_comment_id'), // GitHub review comment ID for reaction polling
}, (table) => [
  index('finding_stage_idx').on(table.stageResultId),
  index('finding_pipeline_idx').on(table.pipelineRunId),
  index('finding_severity_idx').on(table.severity),
])

// ── Agent Sessions ───────────────────────────────────────────────────────────

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),                          // nanoid
  sdkSessionId: text('sdk_session_id'),                 // Claude Agent SDK session ID (set after first loop run)
  title: text('title'),                                 // Auto-generated from first user message
  projectPath: text('project_path'),                    // Associated project directory (nullable for project-less sessions)
  status: text('status').notNull().default('active'),   // active | archived
  messageCount: integer('message_count').default(0),
  tokenUsage: integer('token_usage').default(0),
  costUsd: text('cost_usd'),                            // String for decimal precision
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull().$defaultFn(() => new Date()),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
})

export const messages = pgTable('messages', {
  id: text('id').primaryKey(),                          // nanoid
  sessionId: text('session_id').notNull()
    .references(() => sessions.id),
  role: text('role').notNull(),                         // user | assistant | system
  content: text('content').notNull(),
  hasToolCalls: boolean('has_tool_calls').default(false),
  tokenCount: integer('token_count'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('msg_session_idx').on(table.sessionId),
])

export const toolCalls = pgTable('tool_calls', {
  id: text('id').primaryKey(),                          // nanoid
  messageId: text('message_id').notNull()
    .references(() => messages.id),
  sessionId: text('session_id').notNull()
    .references(() => sessions.id),
  toolName: text('tool_name').notNull(),                // Read, Write, Bash, etc.
  input: text('input'),                                 // JSON stringified args
  output: text('output'),                               // JSON stringified result (truncated)
  isError: boolean('is_error').default(false),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('tc_session_idx').on(table.sessionId),
  index('tc_message_idx').on(table.messageId),
])

// ── Ideation Sessions ───────────────────────────────────────────────────────

export const ideationSessions = pgTable('ideation_sessions', {
  id: text('id').primaryKey(),                            // nanoid
  sessionId: text('session_id')
    .references(() => sessions.id),
  userIdea: text('user_idea').notNull(),
  status: text('status').notNull().default('pending'),    // pending | running | stage_complete | complete | failed
  currentStage: text('current_stage'),                    // nullable -- current skill stage
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull().$defaultFn(() => new Date()),
})

// ── Ideation Artifacts ──────────────────────────────────────────────────────

export const ideationArtifacts = pgTable('ideation_artifacts', {
  id: text('id').primaryKey(),                            // nanoid
  ideationSessionId: text('ideation_session_id').notNull()
    .references(() => ideationSessions.id),
  stage: text('stage').notNull(),                         // office-hours | plan-ceo-review | plan-eng-review | design-consultation
  artifactPath: text('artifact_path').notNull(),          // URI reference (memory://sessionId/stage)
  content: text('content'),                               // nullable -- full stage output text for resume
  title: text('title'),                                   // nullable
  excerpt: text('excerpt'),                               // nullable -- first 500 chars for preview
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('artifact_ideation_session_idx').on(table.ideationSessionId),
])

// ── Autonomous Runs ──────────────────────────────────────────────────────────

export const autonomousRuns = pgTable('autonomous_runs', {
  id: text('id').primaryKey(), // nanoid
  sessionId: text('session_id'),
  ideationSessionId: text('ideation_session_id'),
  projectPath: text('project_path').notNull(),
  status: text('status').notNull().default('pending'), // pending | running | paused | complete | failed
  totalPhases: integer('total_phases').notNull().default(0),
  completedPhases: integer('completed_phases').notNull().default(0),
  totalCommits: integer('total_commits').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index('autonomous_status_idx').on(table.status),
])

// ── Decision Gates ───────────────────────────────────────────────────────────

export const decisionGates = pgTable('decision_gates', {
  id: text('id').primaryKey(), // nanoid
  autonomousRunId: text('autonomous_run_id')
    .notNull()
    .references(() => autonomousRuns.id),
  title: text('title').notNull(),
  description: text('description').notNull(),
  options: text('options').notNull(), // JSON string of options array
  blocking: boolean('blocking').notNull().default(true),
  response: text('response'),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index('gate_run_idx').on(table.autonomousRunId),
])

// ── Users (Auth) ────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: text('id').primaryKey(),             // nanoid
  email: text('email').notNull(),
  displayName: text('display_name'),
  role: text('role').notNull(),            // 'admin' | 'operator'
  source: text('source').notNull(),        // 'tailscale' | 'magic-link'
  tailscaleNodeName: text('tailscale_node_name'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('users_email_idx').on(table.email),
])

// ── Magic Link Tokens ───────────────────────────────────────────────────────

export const magicLinkTokens = pgTable('magic_link_tokens', {
  id: text('id').primaryKey(),             // nanoid
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
})

// ── User Sessions ───────────────────────────────────────────────────────────

export const userSessions = pgTable('user_sessions', {
  id: text('id').primaryKey(),             // nanoid — this IS the cookie value
  userId: text('user_id').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
})

// ── Finding Embeddings (pgvector) ────────────────────────────────────────────

export const findingEmbeddings = pgTable('finding_embeddings', {
  findingId: text('finding_id').primaryKey().references(() => findings.id),
  repoFullName: text('repo_full_name').notNull(),
  stage: text('stage').notNull(),
  severity: text('severity').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  filePath: text('file_path'),
  embedding: text('embedding').notNull(), // stored as pgvector vector type via raw SQL
}, (table) => [
  index('fe_repo_idx').on(table.repoFullName),
])
