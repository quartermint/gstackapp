import { eq, and, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { DrizzleDb } from "../index.js";
import { discoveries } from "../schema.js";
import { notFound } from "../../lib/errors.js";
import { normalizeRemoteUrl } from "../../services/git-health.js";

export interface UpsertDiscoveryData {
  path: string;
  host: "local" | "mac-mini" | "github";
  remoteUrl: string | null;
  name: string | null;
  lastCommitAt: Date | null;
}

/**
 * Insert a new discovery or update metadata if path+host already exists.
 * Does NOT overwrite status -- so dismissed repos stay dismissed.
 */
export function upsertDiscovery(db: DrizzleDb, data: UpsertDiscoveryData) {
  const now = new Date();
  const id = nanoid();

  db.insert(discoveries)
    .values({
      id,
      path: data.path,
      host: data.host,
      status: "found",
      remoteUrl: data.remoteUrl,
      name: data.name,
      lastCommitAt: data.lastCommitAt,
      discoveredAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [discoveries.path, discoveries.host],
      set: {
        remoteUrl: data.remoteUrl,
        name: data.name,
        lastCommitAt: data.lastCommitAt,
        updatedAt: now,
      },
    })
    .run();
}

/**
 * List discoveries with optional filters for status and host.
 * Returns ordered by discoveredAt descending (newest first).
 */
export function listDiscoveries(
  db: DrizzleDb,
  query?: {
    status?: "found" | "tracked" | "dismissed";
    host?: "local" | "mac-mini" | "github";
    limit?: number;
    offset?: number;
  }
) {
  const conditions = [];
  if (query?.status) {
    conditions.push(eq(discoveries.status, query.status));
  }
  if (query?.host) {
    conditions.push(eq(discoveries.host, query.host));
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select()
    .from(discoveries)
    .where(whereClause)
    .orderBy(desc(discoveries.discoveredAt))
    .limit(query?.limit ?? 100)
    .offset(query?.offset ?? 0)
    .all();
}

/**
 * Get a single discovery by ID.
 * Throws NOT_FOUND if the discovery doesn't exist.
 */
export function getDiscovery(db: DrizzleDb, id: string) {
  const result = db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, id))
    .get();

  if (!result) {
    throw notFound(`Discovery '${id}' not found`);
  }

  return result;
}

/**
 * Update discovery status (tracked or dismissed).
 * Returns the updated discovery.
 */
export function updateDiscoveryStatus(
  db: DrizzleDb,
  id: string,
  status: "tracked" | "dismissed"
) {
  // Validate existence (throws NOT_FOUND if missing)
  getDiscovery(db, id);

  db.update(discoveries)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(discoveries.id, id))
    .run();

  return getDiscovery(db, id);
}

/**
 * Get all dismissed paths for a given host.
 * Used by scanner to filter out dismissed repos.
 */
export function getDismissedPaths(
  db: DrizzleDb,
  host: "local" | "mac-mini" | "github"
): Set<string> {
  const rows = db
    .select({ path: discoveries.path })
    .from(discoveries)
    .where(
      and(
        eq(discoveries.status, "dismissed"),
        eq(discoveries.host, host)
      )
    )
    .all();

  return new Set(rows.map((r) => r.path));
}

/**
 * Get a discovery by path and host (for checking if already exists).
 */
export function getDiscoveryByPath(
  db: DrizzleDb,
  path: string,
  host: "local" | "mac-mini" | "github"
) {
  return db
    .select()
    .from(discoveries)
    .where(
      and(eq(discoveries.path, path), eq(discoveries.host, host))
    )
    .get();
}

/**
 * Find existing discoveries that share a normalized remote URL.
 * Used for cross-host dedup: same repo on MacBook + Mac Mini + GitHub = one entry.
 *
 * Filters in JS by normalizing each discovery's remoteUrl -- avoids needing
 * a normalized_remote_url column. Discovery count is small (hundreds), so
 * this is efficient enough.
 */
export function getDiscoveriesByNormalizedUrl(
  db: DrizzleDb,
  normalizedUrl: string
): Array<{
  id: string;
  path: string;
  host: string;
  status: string;
  remoteUrl: string | null;
}> {
  const all = db
    .select({
      id: discoveries.id,
      path: discoveries.path,
      host: discoveries.host,
      status: discoveries.status,
      remoteUrl: discoveries.remoteUrl,
    })
    .from(discoveries)
    .where(eq(discoveries.status, "found"))
    .all();

  return all.filter((d) => {
    if (!d.remoteUrl) return false;
    return normalizeRemoteUrl(d.remoteUrl) === normalizedUrl;
  });
}
