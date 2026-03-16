import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { DrizzleDb } from "../index.js";
import { machines } from "../schema.js";
import { notFound } from "../../lib/errors.js";

export interface UpsertMachineData {
  hostname: string;
  tailnetIp?: string | null;
  os?: string | null;
  arch?: string | null;
}

export function createMachine(db: DrizzleDb, data: UpsertMachineData) {
  const now = new Date();
  const id = nanoid();

  db.insert(machines)
    .values({
      id,
      hostname: data.hostname,
      tailnetIp: data.tailnetIp ?? null,
      os: data.os ?? null,
      arch: data.arch ?? null,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return getMachine(db, id);
}

export function upsertMachine(db: DrizzleDb, data: UpsertMachineData) {
  const now = new Date();
  const id = nanoid();

  db.insert(machines)
    .values({
      id,
      hostname: data.hostname,
      tailnetIp: data.tailnetIp ?? null,
      os: data.os ?? null,
      arch: data.arch ?? null,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: machines.hostname,
      set: {
        tailnetIp: data.tailnetIp ?? null,
        os: data.os ?? null,
        arch: data.arch ?? null,
        lastSeenAt: now,
        updatedAt: now,
      },
    })
    .run();

  return getMachineByHostname(db, data.hostname);
}

export function getMachine(db: DrizzleDb, id: string) {
  const result = db
    .select()
    .from(machines)
    .where(eq(machines.id, id))
    .get();

  if (!result) {
    throw notFound(`Machine '${id}' not found`);
  }

  return result;
}

export function getMachineByHostname(db: DrizzleDb, hostname: string) {
  const result = db
    .select()
    .from(machines)
    .where(eq(machines.hostname, hostname))
    .get();

  if (!result) {
    throw notFound(`Machine '${hostname}' not found`);
  }

  return result;
}

export function listMachines(db: DrizzleDb) {
  return db
    .select()
    .from(machines)
    .orderBy(sql`${machines.hostname} ASC`)
    .all();
}
