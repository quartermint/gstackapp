import type { DrizzleDb } from "../db/index.js";
import {
  upsertCacheEntry,
  getCacheEntry,
  purgeExpiredEntries,
} from "../db/queries/intelligence-cache.js";

type GenerationType = "narrative" | "digest" | "routing_suggestion" | "weekly_pattern";

/**
 * Default TTLs per generation type (in milliseconds).
 * - narrative: 1 hour (per D-05)
 * - digest: 12 hours (per D-07)
 * - routing_suggestion: 30 minutes
 * - weekly_pattern: 24 hours
 */
export const TTLS: Record<GenerationType, number> = {
  narrative: 60 * 60_000,
  digest: 12 * 60 * 60_000,
  routing_suggestion: 30 * 60_000,
  weekly_pattern: 24 * 60 * 60_000,
};

/**
 * In-memory generation lock to prevent duplicate concurrent LLM calls.
 * Keyed by `${slug}:${type}`.
 */
const generationLocks = new Map<string, number>(); // key -> acquired timestamp

/** Auto-release timeout: 60 seconds to prevent permanent locks on crash. */
const LOCK_TIMEOUT_MS = 60_000;

function lockKey(slug: string | null, type: string): string {
  return `${slug ?? "__global__"}:${type}`;
}

/**
 * Read from cache, returning parsed JSON content or null if expired/missing.
 */
export function getFromCache<T>(
  db: DrizzleDb,
  slug: string | null,
  type: GenerationType
): T | null {
  const entry = getCacheEntry(db, slug, type);
  if (!entry) return null;

  try {
    return JSON.parse(entry.content) as T;
  } catch {
    return null;
  }
}

/**
 * Write content to cache with automatic TTL based on generation type.
 */
export function writeToCache(
  db: DrizzleDb,
  slug: string | null,
  type: GenerationType,
  content: unknown,
  inputHash: string,
  modelId?: string
): void {
  const now = new Date();
  const ttl = TTLS[type];
  const expiresAt = new Date(now.getTime() + ttl);

  upsertCacheEntry(db, {
    projectSlug: slug,
    generationType: type,
    inputHash,
    content: JSON.stringify(content),
    modelId: modelId ?? null,
    generatedAt: now,
    expiresAt,
  });
}

/**
 * Acquire a generation lock for a given slug + type combination.
 * Returns true if lock acquired, false if already locked.
 * Auto-releases after LOCK_TIMEOUT_MS to prevent permanent locks.
 */
export function acquireGenerationLock(
  slug: string | null,
  type: GenerationType
): boolean {
  const key = lockKey(slug, type);
  const existing = generationLocks.get(key);

  if (existing !== undefined) {
    // Check if lock has expired (auto-release on timeout)
    if (Date.now() - existing < LOCK_TIMEOUT_MS) {
      return false;
    }
    // Lock timed out, allow re-acquisition
  }

  generationLocks.set(key, Date.now());
  return true;
}

/**
 * Release a generation lock for a given slug + type combination.
 */
export function releaseGenerationLock(
  slug: string | null,
  type: GenerationType
): void {
  const key = lockKey(slug, type);
  generationLocks.delete(key);
}

/**
 * Purge expired cache entries from the database.
 * Wrapper for use in scheduled cleanup.
 */
export function purgeExpiredCache(db: DrizzleDb): number {
  return purgeExpiredEntries(db);
}
