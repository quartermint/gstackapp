/**
 * Test database helper — in-memory SQLite for fast, isolated tests.
 *
 * This file is loaded as a Vitest setupFile. It:
 * 1. Sets required env vars before any module imports
 * 2. Creates an in-memory better-sqlite3 database with all schema tables
 * 3. Mocks the db/client module so all production code uses the test DB
 * 4. Mocks the github/auth module to avoid real GitHub API calls
 * 5. Provides getTestDb() and resetTestDb() utilities
 */

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { sql } from 'drizzle-orm'
import { vi, beforeEach } from 'vitest'
import * as sqliteVec from 'sqlite-vec'
import * as schema from '../../db/schema'

// ── 1. Set env vars BEFORE anything imports config ──────────────────────────

// Dummy RSA key for tests (only needs to parse, not be valid for GitHub)
const TEST_PEM = [
  '-----BEGIN RSA PRIVATE KEY-----',
  'MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy0AHB7MhgHcTz6sE2I2yPB',
  'aNlRpCRAgSWPqFOmEbUL+1MbEtse/gGpOWjmaEELeNQXBZ6RQFIE7xr5KMNN3MrM',
  'hXGMDvM3RpjQ6I0M6FAjMmA5I+YsDdYfMPJRIJoij1R+1gQH1ERAMlL/+mqTGWdR',
  'oXOxK7P6NlnGUuKPBxOcJKfLxfLQrUQ0Xnz1yrTnJ3vAIHXR2cL+5M3q1/vGCR3U',
  'YUq7s5U4v0F+h0QM5qH+IG3RhJSt+lKLJ7EXTM2Z0VJ9hGSAqPx1GVOp0a9FN/qT',
  'e02RXy6sFIJ5MGfNLUDDlYVbmRDPJPN5rR+8cQIDAQABAoIBAF5hVFTH3S8GJGQF',
  '-----END RSA PRIVATE KEY-----',
].join('\n')

process.env.GITHUB_APP_ID = '12345'
process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret'
process.env.GITHUB_PRIVATE_KEY = TEST_PEM
process.env.DATABASE_PATH = ':memory:'
process.env.NODE_ENV = 'test'
process.env.PORT = '0'

// ── 2. Create in-memory database ────────────────────────────────────────────

const sqlite = new Database(':memory:')
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('busy_timeout = 5000')
sqlite.pragma('synchronous = normal')
sqlite.pragma('foreign_keys = ON')

// Load sqlite-vec extension for vector operations (XREP-01)
sqliteVec.load(sqlite)

const testDb = drizzle(sqlite, { schema })

// ── 3. Create tables from schema DDL ────────────────────────────────────────

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS github_installations (
    id INTEGER PRIMARY KEY,
    account_login TEXT NOT NULL,
    account_type TEXT NOT NULL,
    app_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );

  CREATE TABLE IF NOT EXISTS repositories (
    id INTEGER PRIMARY KEY,
    installation_id INTEGER NOT NULL REFERENCES github_installations(id),
    full_name TEXT NOT NULL,
    default_branch TEXT NOT NULL DEFAULT 'main',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  CREATE INDEX IF NOT EXISTS repo_installation_idx ON repositories(installation_id);

  CREATE TABLE IF NOT EXISTS pull_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id INTEGER NOT NULL REFERENCES repositories(id),
    number INTEGER NOT NULL,
    title TEXT NOT NULL,
    author_login TEXT NOT NULL,
    head_sha TEXT NOT NULL,
    base_branch TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS pr_repo_number_idx ON pull_requests(repo_id, number);

  CREATE TABLE IF NOT EXISTS review_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id INTEGER NOT NULL REFERENCES repositories(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    author_login TEXT NOT NULL,
    head_sha TEXT NOT NULL,
    base_sha TEXT,
    ref TEXT,
    pr_number INTEGER,
    state TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS review_unit_dedup_idx ON review_units(repo_id, type, head_sha);

  CREATE TABLE IF NOT EXISTS pipeline_runs (
    id TEXT PRIMARY KEY,
    delivery_id TEXT NOT NULL,
    pr_id INTEGER REFERENCES pull_requests(id),
    review_unit_id INTEGER REFERENCES review_units(id),
    installation_id INTEGER NOT NULL,
    head_sha TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    comment_id INTEGER,
    started_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS delivery_id_idx ON pipeline_runs(delivery_id);
  CREATE INDEX IF NOT EXISTS pipeline_pr_idx ON pipeline_runs(pr_id);
  CREATE INDEX IF NOT EXISTS pipeline_status_idx ON pipeline_runs(status);
  CREATE INDEX IF NOT EXISTS pipeline_review_unit_idx ON pipeline_runs(review_unit_id);

  CREATE TABLE IF NOT EXISTS stage_results (
    id TEXT PRIMARY KEY,
    pipeline_run_id TEXT NOT NULL REFERENCES pipeline_runs(id),
    stage TEXT NOT NULL,
    verdict TEXT NOT NULL DEFAULT 'PENDING',
    summary TEXT,
    token_usage INTEGER,
    duration_ms INTEGER,
    error TEXT,
    provider_model TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    completed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS stage_pipeline_idx ON stage_results(pipeline_run_id);
  CREATE UNIQUE INDEX IF NOT EXISTS stage_run_stage_idx ON stage_results(pipeline_run_id, stage);

  CREATE TABLE IF NOT EXISTS findings (
    id TEXT PRIMARY KEY,
    stage_result_id TEXT NOT NULL REFERENCES stage_results(id),
    pipeline_run_id TEXT NOT NULL REFERENCES pipeline_runs(id),
    severity TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    file_path TEXT,
    line_start INTEGER,
    line_end INTEGER,
    suggestion TEXT,
    code_snippet TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    feedback_vote TEXT,
    feedback_note TEXT,
    feedback_source TEXT,
    feedback_at INTEGER,
    gh_review_comment_id INTEGER
  );
  CREATE INDEX IF NOT EXISTS finding_stage_idx ON findings(stage_result_id);
  CREATE INDEX IF NOT EXISTS finding_pipeline_idx ON findings(pipeline_run_id);
  CREATE INDEX IF NOT EXISTS finding_severity_idx ON findings(severity);

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    sdk_session_id TEXT,
    title TEXT,
    project_path TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    message_count INTEGER DEFAULT 0,
    token_usage INTEGER DEFAULT 0,
    cost_usd TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    last_message_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    has_tool_calls INTEGER DEFAULT 0,
    token_count INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  CREATE INDEX IF NOT EXISTS msg_session_idx ON messages(session_id);

  CREATE TABLE IF NOT EXISTS tool_calls (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id),
    session_id TEXT NOT NULL REFERENCES sessions(id),
    tool_name TEXT NOT NULL,
    input TEXT,
    output TEXT,
    is_error INTEGER DEFAULT 0,
    duration_ms INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  CREATE INDEX IF NOT EXISTS tc_session_idx ON tool_calls(session_id);
  CREATE INDEX IF NOT EXISTS tc_message_idx ON tool_calls(message_id);

  CREATE TABLE IF NOT EXISTS ideation_sessions (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id),
    user_idea TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    current_stage TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );

  CREATE TABLE IF NOT EXISTS ideation_artifacts (
    id TEXT PRIMARY KEY,
    ideation_session_id TEXT NOT NULL REFERENCES ideation_sessions(id),
    stage TEXT NOT NULL,
    artifact_path TEXT NOT NULL,
    content TEXT,
    title TEXT,
    excerpt TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  CREATE INDEX IF NOT EXISTS artifact_ideation_session_idx ON ideation_artifacts(ideation_session_id);

  CREATE TABLE IF NOT EXISTS autonomous_runs (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    ideation_session_id TEXT,
    project_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    total_phases INTEGER NOT NULL DEFAULT 0,
    completed_phases INTEGER NOT NULL DEFAULT 0,
    total_commits INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  CREATE INDEX IF NOT EXISTS autonomous_status_idx ON autonomous_runs(status);

  CREATE TABLE IF NOT EXISTS decision_gates (
    id TEXT PRIMARY KEY,
    autonomous_run_id TEXT NOT NULL REFERENCES autonomous_runs(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    options TEXT NOT NULL,
    blocking INTEGER NOT NULL DEFAULT 1,
    response TEXT,
    responded_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  CREATE INDEX IF NOT EXISTS gate_run_idx ON decision_gates(autonomous_run_id);
`)

// ── 4. Mock modules ─────────────────────────────────────────────────────────

// Mock db/client to use in-memory test DB
vi.mock('../../db/client', () => ({
  db: testDb,
  rawDb: sqlite,
}))

// Mock github/auth to avoid real GitHub API calls
vi.mock('../../github/auth', () => ({
  getInstallationOctokit: vi.fn(() => ({
    apps: {
      listReposAccessibleToInstallation: vi.fn().mockResolvedValue({
        data: { repositories: [] },
      }),
    },
  })),
  clearInstallationClient: vi.fn(),
}))

// Mock db/reconcile to prevent startup reconciliation during tests
vi.mock('../../db/reconcile', () => ({
  reconcileStaleRuns: vi.fn(),
}))

// Mock voyageai to avoid ESM directory import issues in tests
vi.mock('voyageai', () => ({
  VoyageAIClient: vi.fn().mockImplementation(() => ({
    embed: vi.fn().mockResolvedValue({ data: [] }),
  })),
}))

// ── 5. Exports ──────────────────────────────────────────────────────────────

export function getTestDb() {
  return { db: testDb, sqlite }
}

export function resetTestDb() {
  // Drop and recreate vec_findings to reset vector data (vec0 tables don't support DELETE FROM)
  sqlite.exec('DROP TABLE IF EXISTS vec_findings')
  // Delete in reverse FK order
  sqlite.exec('DELETE FROM decision_gates')
  sqlite.exec('DELETE FROM autonomous_runs')
  sqlite.exec('DELETE FROM ideation_artifacts')
  sqlite.exec('DELETE FROM ideation_sessions')
  sqlite.exec('DELETE FROM tool_calls')
  sqlite.exec('DELETE FROM messages')
  sqlite.exec('DELETE FROM sessions')
  sqlite.exec('DELETE FROM findings')
  sqlite.exec('DELETE FROM stage_results')
  sqlite.exec('DELETE FROM pipeline_runs')
  sqlite.exec('DELETE FROM review_units')
  sqlite.exec('DELETE FROM pull_requests')
  sqlite.exec('DELETE FROM repositories')
  sqlite.exec('DELETE FROM github_installations')
}

// Reset DB between each test
beforeEach(() => {
  resetTestDb()
})
