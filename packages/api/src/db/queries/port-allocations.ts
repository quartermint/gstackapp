import { eq, and, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { DrizzleDb } from "../index.js";
import { portAllocations } from "../schema.js";
import { notFound, validationError } from "../../lib/errors.js";

export interface CreateAllocationData {
  port: number;
  protocol?: "tcp" | "udp";
  machineId: string;
  serviceName: string;
  projectSlug?: string | null;
  status?: "active" | "deprecated" | "reserved";
}

export interface UpdateAllocationData {
  port?: number;
  protocol?: "tcp" | "udp";
  serviceName?: string;
  projectSlug?: string | null;
  status?: "active" | "deprecated" | "reserved";
}

export interface ListAllocationsQuery {
  machineId?: string;
  projectSlug?: string;
  status?: "active" | "deprecated" | "reserved";
  limit?: number;
  offset?: number;
}

export function createAllocation(db: DrizzleDb, data: CreateAllocationData) {
  const now = new Date();
  const id = nanoid();
  const protocol = data.protocol ?? "tcp";

  // Check for duplicate
  const existing = db
    .select()
    .from(portAllocations)
    .where(
      and(
        eq(portAllocations.port, data.port),
        eq(portAllocations.machineId, data.machineId),
        eq(portAllocations.protocol, protocol)
      )
    )
    .get();

  if (existing) {
    throw validationError(
      `Port ${data.port}/${protocol} is already allocated on machine '${data.machineId}' to '${existing.serviceName}'`
    );
  }

  db.insert(portAllocations)
    .values({
      id,
      port: data.port,
      protocol,
      machineId: data.machineId,
      serviceName: data.serviceName,
      projectSlug: data.projectSlug ?? null,
      status: data.status ?? "active",
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return getAllocation(db, id);
}

export function getAllocation(db: DrizzleDb, id: string) {
  const result = db
    .select()
    .from(portAllocations)
    .where(eq(portAllocations.id, id))
    .get();

  if (!result) {
    throw notFound(`Port allocation '${id}' not found`);
  }

  return result;
}

export function listAllocations(db: DrizzleDb, query: ListAllocationsQuery) {
  const conditions = [];
  if (query.machineId) {
    conditions.push(eq(portAllocations.machineId, query.machineId));
  }
  if (query.projectSlug) {
    conditions.push(eq(portAllocations.projectSlug, query.projectSlug));
  }
  if (query.status) {
    conditions.push(eq(portAllocations.status, query.status));
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  const results = db
    .select()
    .from(portAllocations)
    .where(whereClause)
    .limit(query.limit ?? 100)
    .offset(query.offset ?? 0)
    .orderBy(sql`${portAllocations.port} ASC`)
    .all();

  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(portAllocations)
    .where(whereClause)
    .get();

  return {
    allocations: results,
    total: countResult?.count ?? 0,
  };
}

export function updateAllocation(
  db: DrizzleDb,
  id: string,
  data: UpdateAllocationData
) {
  getAllocation(db, id); // Verify exists
  const now = new Date();

  db.update(portAllocations)
    .set({ ...data, updatedAt: now })
    .where(eq(portAllocations.id, id))
    .run();

  return getAllocation(db, id);
}

export function deleteAllocation(db: DrizzleDb, id: string) {
  getAllocation(db, id); // Verify exists
  db.delete(portAllocations)
    .where(eq(portAllocations.id, id))
    .run();
}
