import { eq, and, sql } from "drizzle-orm";
import type { DrizzleDb } from "../db/index.js";
import {
  portAllocations,
  portScans,
  portRanges,
  machines,
} from "../db/schema.js";
import { validationError, notFound } from "../lib/errors.js";
import { nanoid } from "nanoid";

export interface PortMapEntry {
  port: number;
  protocol: string;
  machineId: string;
  machineHostname: string;
  allocationId: string | null;
  serviceName: string | null;
  projectSlug: string | null;
  allocationStatus: string | null;
  processName: string | null;
  pid: number | null;
  lastScanAt: string | null;
  liveStatus: "green" | "yellow" | "red";
}

export interface ConflictEntry {
  type: "unregistered" | "down" | "duplicate";
  port: number;
  protocol: string;
  machineId: string;
  machineHostname: string;
  details: string;
}

/**
 * Build a merged port map: allocations + scans with three-way status.
 * - Green: allocation exists AND scan matches
 * - Yellow: scan exists but no allocation (unregistered)
 * - Red: allocation exists but no scan (service down)
 */
export function getMergedPortMap(db: DrizzleDb): PortMapEntry[] {
  // Get all machines for hostname lookup
  const allMachines = db.select().from(machines).all();
  const machineMap = new Map(allMachines.map((m) => [m.id, m]));

  // Get all active allocations
  const allAllocations = db
    .select()
    .from(portAllocations)
    .where(eq(portAllocations.status, "active"))
    .all();

  // Get all scans
  const allScans = db.select().from(portScans).all();

  // Build a composite key map
  const key = (machineId: string, port: number, proto: string) =>
    `${machineId}:${port}:${proto}`;

  const allocMap = new Map(
    allAllocations.map((a) => [key(a.machineId, a.port, a.protocol), a])
  );
  const scanMap = new Map(
    allScans.map((s) => [key(s.machineId, s.port, s.protocol), s])
  );

  const allKeys = new Set([...allocMap.keys(), ...scanMap.keys()]);
  const entries: PortMapEntry[] = [];

  for (const k of allKeys) {
    const alloc = allocMap.get(k);
    const scan = scanMap.get(k);
    const machineId = alloc?.machineId ?? scan!.machineId;
    const machine = machineMap.get(machineId);

    let liveStatus: "green" | "yellow" | "red";
    if (alloc && scan) {
      liveStatus = "green";
    } else if (scan && !alloc) {
      liveStatus = "yellow";
    } else {
      liveStatus = "red";
    }

    entries.push({
      port: alloc?.port ?? scan!.port,
      protocol: alloc?.protocol ?? scan!.protocol,
      machineId,
      machineHostname: machine?.hostname ?? "unknown",
      allocationId: alloc?.id ?? null,
      serviceName: alloc?.serviceName ?? null,
      projectSlug: alloc?.projectSlug ?? null,
      allocationStatus: alloc?.status ?? null,
      processName: scan?.processName ?? null,
      pid: scan?.pid ?? null,
      lastScanAt: scan?.scanTimestamp?.toISOString() ?? null,
      liveStatus,
    });
  }

  // Sort by machine, then port
  entries.sort((a, b) => {
    if (a.machineHostname !== b.machineHostname) {
      return a.machineHostname.localeCompare(b.machineHostname);
    }
    return a.port - b.port;
  });

  return entries;
}

/**
 * Detect port conflicts across the network.
 */
export function detectConflicts(db: DrizzleDb): ConflictEntry[] {
  const portMap = getMergedPortMap(db);
  const conflicts: ConflictEntry[] = [];

  for (const entry of portMap) {
    if (entry.liveStatus === "yellow") {
      conflicts.push({
        type: "unregistered",
        port: entry.port,
        protocol: entry.protocol,
        machineId: entry.machineId,
        machineHostname: entry.machineHostname,
        details: `Process '${entry.processName ?? "unknown"}' (PID ${entry.pid ?? "?"}) listening on port ${entry.port} but no allocation registered`,
      });
    } else if (entry.liveStatus === "red") {
      conflicts.push({
        type: "down",
        port: entry.port,
        protocol: entry.protocol,
        machineId: entry.machineId,
        machineHostname: entry.machineHostname,
        details: `Service '${entry.serviceName}' allocated on port ${entry.port} but not detected in scan`,
      });
    }
  }

  // Check for duplicate port allocations across machines
  // (same port number on different machines isn't a conflict — same port on same machine is caught by UNIQUE constraint)

  return conflicts;
}

/**
 * Auto-allocate the next available port in a named range.
 */
export function autoAllocate(
  db: DrizzleDb,
  machineId: string,
  rangeName: string,
  serviceName: string,
  projectSlug?: string
) {
  // Find the range
  const range = db
    .select()
    .from(portRanges)
    .where(eq(portRanges.name, rangeName))
    .get();

  if (!range) {
    throw notFound(`Port range '${rangeName}' not found`);
  }

  // Get all allocations in this range for this machine
  const existing = db
    .select({ port: portAllocations.port })
    .from(portAllocations)
    .where(
      and(
        eq(portAllocations.machineId, machineId),
        sql`${portAllocations.port} >= ${range.startPort}`,
        sql`${portAllocations.port} <= ${range.endPort}`
      )
    )
    .all();

  const usedPorts = new Set(existing.map((e) => e.port));

  // Find first available
  for (let port = range.startPort; port <= range.endPort; port++) {
    if (!usedPorts.has(port)) {
      // Allocate it
      const now = new Date();
      const id = nanoid();

      db.insert(portAllocations)
        .values({
          id,
          port,
          protocol: "tcp",
          machineId,
          serviceName,
          projectSlug: projectSlug ?? null,
          status: "active",
          createdAt: now,
          updatedAt: now,
        })
        .run();

      return db
        .select()
        .from(portAllocations)
        .where(eq(portAllocations.id, id))
        .get()!;
    }
  }

  throw validationError(
    `No available ports in range '${rangeName}' (${range.startPort}-${range.endPort}) on machine '${machineId}'`
  );
}
