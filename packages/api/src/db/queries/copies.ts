import { eq } from "drizzle-orm";
import type { DrizzleDb } from "../index.js";
import { projectCopies } from "../schema.js";

/** Input for creating/upserting a project copy record. */
export interface CopyInput {
  projectSlug: string;
  host: string;
  path: string;
  remoteUrl?: string | null;
  headCommit?: string | null;
  branch?: string | null;
  isPublic?: boolean | null;
}

/**
 * Insert or update a project copy record.
 *
 * Upserts by the unique (projectSlug, host) constraint, updating
 * path, remoteUrl, headCommit, branch, isPublic, and lastCheckedAt
 * on conflict.
 */
export function upsertCopy(db: DrizzleDb, data: CopyInput): void {
  const now = new Date().toISOString();

  db.insert(projectCopies)
    .values({
      projectSlug: data.projectSlug,
      host: data.host,
      path: data.path,
      remoteUrl: data.remoteUrl ?? null,
      headCommit: data.headCommit ?? null,
      branch: data.branch ?? null,
      isPublic: data.isPublic ?? null,
      lastCheckedAt: now,
    })
    .onConflictDoUpdate({
      target: [projectCopies.projectSlug, projectCopies.host],
      set: {
        path: data.path,
        remoteUrl: data.remoteUrl ?? null,
        headCommit: data.headCommit ?? null,
        branch: data.branch ?? null,
        isPublic: data.isPublic ?? null,
        lastCheckedAt: now,
      },
    })
    .run();
}

/**
 * Get all project copy records.
 */
export function getAllCopies(db: DrizzleDb) {
  return db.select().from(projectCopies).all();
}

/**
 * Get all copies for a project slug.
 */
export function getCopiesByProject(db: DrizzleDb, projectSlug: string) {
  return db
    .select()
    .from(projectCopies)
    .where(eq(projectCopies.projectSlug, projectSlug))
    .all();
}

/**
 * Get all copies that share a remote URL.
 * Used for multi-host copy discovery (e.g., finding both the MacBook
 * and Mac Mini clones of the same repo).
 */
export function getCopiesByRemoteUrl(db: DrizzleDb, remoteUrl: string) {
  return db
    .select()
    .from(projectCopies)
    .where(eq(projectCopies.remoteUrl, remoteUrl))
    .all();
}
