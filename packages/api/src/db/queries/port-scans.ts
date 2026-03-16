import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { DrizzleDb } from "../index.js";
import { portScans } from "../schema.js";

export interface ScanEntry {
  port: number;
  protocol?: "tcp" | "udp";
  processName?: string | null;
  pid?: number | null;
}

/**
 * Ingest a batch of scan results from a portwatch agent.
 * Uses upsert on (machine_id, port, protocol) — each machine/port combo
 * keeps only the latest scan.
 */
export function ingestScans(
  db: DrizzleDb,
  machineId: string,
  scans: ScanEntry[]
) {
  const now = new Date();

  // Delete all existing scans for this machine, then insert fresh batch.
  // This ensures ports that are no longer listening get removed.
  db.delete(portScans)
    .where(eq(portScans.machineId, machineId))
    .run();

  for (const scan of scans) {
    const protocol = scan.protocol ?? "tcp";
    db.insert(portScans)
      .values({
        id: nanoid(),
        machineId,
        port: scan.port,
        protocol,
        processName: scan.processName ?? null,
        pid: scan.pid ?? null,
        scanTimestamp: now,
      })
      .run();
  }

  return { ingested: scans.length, machineId, timestamp: now.toISOString() };
}

/**
 * Get the latest scan results for a specific machine.
 */
export function getLatestScans(db: DrizzleDb, machineId: string) {
  return db
    .select()
    .from(portScans)
    .where(eq(portScans.machineId, machineId))
    .orderBy(sql`${portScans.port} ASC`)
    .all();
}

/**
 * Get all scans across all machines.
 */
export function getAllScans(db: DrizzleDb) {
  return db
    .select()
    .from(portScans)
    .orderBy(sql`${portScans.machineId} ASC, ${portScans.port} ASC`)
    .all();
}

/**
 * Prune scans older than the given age (in milliseconds).
 */
export function pruneOldScans(db: DrizzleDb, maxAgeMs: number) {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const result = db
    .delete(portScans)
    .where(sql`${portScans.scanTimestamp} < ${cutoff.getTime() / 1000}`)
    .run();

  return { pruned: result.changes };
}
