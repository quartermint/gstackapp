import { eq, sql } from "drizzle-orm";
import type { DrizzleDb } from "../index.js";
import { clientVisits } from "../schema.js";

/**
 * Get the last visit record for a given client.
 * Returns null when no row exists for the clientId.
 */
export function getLastVisit(
  db: DrizzleDb,
  clientId: string
): {
  clientId: string;
  lastVisitAt: string;
  previousVisitAt: string | null;
} | null {
  const row = db
    .select({
      clientId: clientVisits.clientId,
      lastVisitAt: clientVisits.lastVisitAt,
      previousVisitAt: clientVisits.previousVisitAt,
    })
    .from(clientVisits)
    .where(eq(clientVisits.clientId, clientId))
    .get();

  return row ?? null;
}

/**
 * Record a client visit. On first visit, inserts a new row.
 * On subsequent visits, rotates lastVisitAt into previousVisitAt
 * and sets lastVisitAt to now.
 */
export function recordVisit(
  db: DrizzleDb,
  clientId: string
): { clientId: string; lastVisitAt: string } {
  const now = new Date().toISOString();

  db.insert(clientVisits)
    .values({
      clientId,
      lastVisitAt: now,
      previousVisitAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: clientVisits.clientId,
      set: {
        previousVisitAt: sql`${clientVisits.lastVisitAt}`,
        lastVisitAt: now,
        updatedAt: now,
      },
    })
    .run();

  return { clientId, lastVisitAt: now };
}
