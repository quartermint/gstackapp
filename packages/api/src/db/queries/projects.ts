import { eq, and, sql } from "drizzle-orm";
import type { DrizzleDb } from "../index.js";
import { projects } from "../schema.js";
import { notFound } from "../../lib/errors.js";

export interface UpsertProjectData {
  slug: string;
  name: string;
  tagline: string | null;
  path: string;
  host: "local" | "mac-mini";
  lastScannedAt: Date | null;
}

/**
 * Insert or update a project record.
 * On conflict (slug), updates name, tagline, path, host, lastScannedAt, and updatedAt.
 */
export function upsertProject(db: DrizzleDb, data: UpsertProjectData) {
  const now = new Date();

  db.insert(projects)
    .values({
      slug: data.slug,
      name: data.name,
      tagline: data.tagline,
      path: data.path,
      host: data.host,
      lastScannedAt: data.lastScannedAt,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: projects.slug,
      set: {
        name: data.name,
        tagline: data.tagline,
        path: data.path,
        host: data.host,
        lastScannedAt: data.lastScannedAt,
        updatedAt: now,
      },
    })
    .run();

  return getProject(db, data.slug);
}

/**
 * List all projects, optionally filtered by host.
 */
export function listProjects(
  db: DrizzleDb,
  query?: { host?: "local" | "mac-mini" }
) {
  const conditions = [];
  if (query?.host) {
    conditions.push(eq(projects.host, query.host));
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select()
    .from(projects)
    .where(whereClause)
    .orderBy(sql`${projects.name} ASC`)
    .all();
}

/**
 * Get a single project by slug.
 * Throws NOT_FOUND if the project doesn't exist.
 */
export function getProject(db: DrizzleDb, slug: string) {
  const result = db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .get();

  if (!result) {
    throw notFound(`Project '${slug}' not found`);
  }

  return result;
}
