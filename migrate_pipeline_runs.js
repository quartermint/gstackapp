// DEPRECATED: This migration was for the SQLite stack (pre-Postgres migration c1fc394).
// DO NOT RUN — the project now uses Neon Postgres managed by drizzle-kit.
throw new Error('This migration is deprecated. See packages/api/src/db/schema.ts for the current schema.')

const Database = require("better-sqlite3");
require("dotenv").config({ path: "/Users/ryanstern/gstackapp/.env" });
const db = new Database(process.env.DATABASE_PATH || "/Users/ryanstern/gstackapp/data/gstackapp.db");

db.pragma("foreign_keys = OFF");

db.exec(`DROP TABLE IF EXISTS pipeline_runs_old`);
db.exec(`ALTER TABLE pipeline_runs RENAME TO pipeline_runs_old`);

db.exec(`
  CREATE TABLE pipeline_runs (
    id TEXT PRIMARY KEY,
    delivery_id TEXT NOT NULL,
    pr_id INTEGER REFERENCES pull_requests(id),
    review_unit_id INTEGER REFERENCES review_units(id),
    installation_id INTEGER NOT NULL,
    head_sha TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT "PENDING",
    comment_id INTEGER,
    started_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL
  )
`);

db.exec(`CREATE UNIQUE INDEX delivery_id_idx ON pipeline_runs(delivery_id)`);
db.exec(`CREATE INDEX pipeline_pr_idx ON pipeline_runs(pr_id)`);
db.exec(`CREATE INDEX pipeline_status_idx ON pipeline_runs(status)`);
db.exec(`CREATE INDEX pipeline_review_unit_idx ON pipeline_runs(review_unit_id)`);
db.exec(`INSERT INTO pipeline_runs SELECT * FROM pipeline_runs_old`);
db.exec(`DROP TABLE pipeline_runs_old`);

db.pragma("foreign_keys = ON");

const info = db.prepare("PRAGMA table_info(pipeline_runs)").all();
const prCol = info.find(c => c.name === "pr_id");
console.log("pr_id notnull:", prCol.notnull, "(should be 0)");
const count = db.prepare("SELECT COUNT(*) as c FROM pipeline_runs").get();
console.log("Row count after migration:", count.c);
console.log("Migration complete.");
