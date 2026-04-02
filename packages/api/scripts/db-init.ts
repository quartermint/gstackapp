/**
 * Initialize the gstackapp database with all tables.
 *
 * drizzle-kit push fails because sqlite-vec's vec0 module isn't loaded
 * during drizzle-kit's introspection step. This script loads the extension
 * first, then creates all tables via raw SQL matching the Drizzle schema.
 *
 * Usage: npx tsx scripts/db-init.ts
 */

import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { config } from '../src/lib/config'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// Ensure data directory exists
mkdirSync(dirname(config.databasePath), { recursive: true })

const db = new Database(config.databasePath)

// Set pragmas
db.pragma('journal_mode = WAL')
db.pragma('busy_timeout = 5000')
db.pragma('synchronous = normal')
db.pragma('foreign_keys = ON')

// Load sqlite-vec extension
sqliteVec.load(db)

console.log(`Initializing database: ${config.databasePath}`)

// ── Regular tables ──────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS github_installations (
    id INTEGER PRIMARY KEY,
    account_login TEXT NOT NULL,
    account_type TEXT NOT NULL,
    app_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS repositories (
    id INTEGER PRIMARY KEY,
    installation_id INTEGER NOT NULL REFERENCES github_installations(id),
    full_name TEXT NOT NULL,
    default_branch TEXT NOT NULL DEFAULT 'main',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
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
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
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
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS review_unit_dedup_idx ON review_units(repo_id, type, head_sha);

  CREATE TABLE IF NOT EXISTS pipeline_runs (
    id TEXT PRIMARY KEY,
    delivery_id TEXT NOT NULL,
    pr_id INTEGER NOT NULL REFERENCES pull_requests(id),
    review_unit_id INTEGER REFERENCES review_units(id),
    installation_id INTEGER NOT NULL,
    head_sha TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    comment_id INTEGER,
    started_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL
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
    created_at INTEGER NOT NULL,
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
    created_at INTEGER NOT NULL,
    feedback_vote TEXT,
    feedback_note TEXT,
    feedback_source TEXT,
    feedback_at INTEGER,
    gh_review_comment_id INTEGER
  );
  CREATE INDEX IF NOT EXISTS finding_stage_idx ON findings(stage_result_id);
  CREATE INDEX IF NOT EXISTS finding_pipeline_idx ON findings(pipeline_run_id);
  CREATE INDEX IF NOT EXISTS finding_severity_idx ON findings(severity);
`)

// ── vec0 virtual table (requires sqlite-vec extension) ──────────────────────

db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS vec_findings USING vec0(
    finding_id TEXT PRIMARY KEY,
    embedding float[1024] distance_metric=cosine,
    repo_full_name TEXT,
    stage TEXT,
    severity TEXT,
    +title TEXT,
    +description TEXT,
    +file_path TEXT
  );
`)

// Verify
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]
console.log(`Created ${tables.length} tables:`, tables.map(t => t.name).join(', '))

db.close()
console.log('Database initialized successfully.')
