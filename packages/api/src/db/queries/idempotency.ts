import { eq, lt } from "drizzle-orm";
import type { DrizzleDb } from "../index.js";
import { idempotencyKeys } from "../schema.js";

export function checkIdempotencyKey(
  db: DrizzleDb,
  key: string
): { captureId: string } | undefined {
  return db
    .select({ captureId: idempotencyKeys.captureId })
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.key, key))
    .get();
}

export function storeIdempotencyKey(
  db: DrizzleDb,
  key: string,
  captureId: string
): void {
  db.insert(idempotencyKeys)
    .values({ key, captureId, createdAt: new Date() })
    .run();
}

export function purgeExpiredKeys(
  db: DrizzleDb,
  ttlMs: number = 86_400_000
): void {
  const cutoff = new Date(Date.now() - ttlMs);
  db.delete(idempotencyKeys)
    .where(lt(idempotencyKeys.createdAt, cutoff))
    .run();
}
