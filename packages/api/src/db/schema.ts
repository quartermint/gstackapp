import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

// ── GitHub Installations ──────────────────────────────────────────────────────

export const githubInstallations = sqliteTable('github_installations', {
  id: integer('id').primaryKey(), // GitHub installation ID
  accountLogin: text('account_login').notNull(),
  accountType: text('account_type').notNull(), // 'User' | 'Organization'
  appId: integer('app_id').notNull(),
  status: text('status').notNull().default('active'), // active | suspended | deleted
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})

// ── Repositories ──────────────────────────────────────────────────────────────

export const repositories = sqliteTable('repositories', {
  id: integer('id').primaryKey(), // GitHub repo ID
  installationId: integer('installation_id')
    .notNull()
    .references(() => githubInstallations.id),
  fullName: text('full_name').notNull(), // owner/repo
  defaultBranch: text('default_branch').notNull().default('main'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index('repo_installation_idx').on(table.installationId),
])

// ── Pull Requests ─────────────────────────────────────────────────────────────

export const pullRequests = sqliteTable('pull_requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  repoId: integer('repo_id')
    .notNull()
    .references(() => repositories.id),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  authorLogin: text('author_login').notNull(),
  headSha: text('head_sha').notNull(),
  baseBranch: text('base_branch').notNull(),
  state: text('state').notNull().default('open'), // open | closed | merged
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('pr_repo_number_idx').on(table.repoId, table.number),
])

// ── Review Units (generalizes PRs + Pushes) ──────────────────────────────────

export const reviewUnits = sqliteTable('review_units', {
  id: integer('id').primaryKey({ autoIncrement: true }),
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
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('review_unit_dedup_idx').on(table.repoId, table.type, table.headSha),
])

// ── Pipeline Runs ─────────────────────────────────────────────────────────────

export const pipelineRuns = sqliteTable('pipeline_runs', {
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
  startedAt: integer('started_at', { mode: 'timestamp_ms' }),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('delivery_id_idx').on(table.deliveryId),
  index('pipeline_pr_idx').on(table.prId),
  index('pipeline_status_idx').on(table.status),
  index('pipeline_review_unit_idx').on(table.reviewUnitId),
])

// ── Stage Results ─────────────────────────────────────────────────────────────

export const stageResults = sqliteTable('stage_results', {
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
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
}, (table) => [
  index('stage_pipeline_idx').on(table.pipelineRunId),
  uniqueIndex('stage_run_stage_idx').on(table.pipelineRunId, table.stage),
])

// ── Findings ──────────────────────────────────────────────────────────────────

export const findings = sqliteTable('findings', {
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
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  // Feedback columns (D-14: stored for future prompt improvement, not auto-applied in v1)
  feedbackVote: text('feedback_vote'), // 'up' | 'down' | null
  feedbackNote: text('feedback_note'), // optional context from dashboard
  feedbackSource: text('feedback_source'), // 'github_reaction' | 'dashboard'
  feedbackAt: integer('feedback_at', { mode: 'timestamp_ms' }), // when feedback was given
  ghReviewCommentId: integer('gh_review_comment_id'), // GitHub review comment ID for reaction polling
}, (table) => [
  index('finding_stage_idx').on(table.stageResultId),
  index('finding_pipeline_idx').on(table.pipelineRunId),
  index('finding_severity_idx').on(table.severity),
])
