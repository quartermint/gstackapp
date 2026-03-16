import { z } from "zod";

// ── Enums ──────────────────────────────────────────────────────────

export const machineOsEnum = z.enum(["darwin", "linux"]);
export const machineArchEnum = z.enum(["arm64", "x86_64", "amd64"]);
export const portProtocolEnum = z.enum(["tcp", "udp"]);
export const portAllocationStatusEnum = z.enum([
  "active",
  "deprecated",
  "reserved",
]);

/** Three-way reconciled status: green (matched), yellow (unregistered), red (down) */
export const portLiveStatusEnum = z.enum(["green", "yellow", "red"]);

// ── Machines ───────────────────────────────────────────────────────

export const machineSchema = z.object({
  id: z.string(),
  hostname: z.string(),
  tailnetIp: z.string().nullable(),
  os: z.string().nullable(),
  arch: z.string().nullable(),
  lastSeenAt: z.string().datetime().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createMachineSchema = z.object({
  hostname: z.string().min(1).max(253),
  tailnetIp: z.string().optional(),
  os: z.string().optional(),
  arch: z.string().optional(),
});

export const machineIdSchema = z.object({
  id: z.string().min(1),
});

// ── Port Allocations ───────────────────────────────────────────────

export const portAllocationSchema = z.object({
  id: z.string(),
  port: z.number().int().min(1).max(65535),
  protocol: portProtocolEnum,
  machineId: z.string(),
  serviceName: z.string(),
  projectSlug: z.string().nullable(),
  status: portAllocationStatusEnum,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createPortAllocationSchema = z.object({
  port: z.number().int().min(1).max(65535),
  protocol: portProtocolEnum.optional().default("tcp"),
  machineId: z.string().min(1),
  serviceName: z.string().min(1).max(200),
  projectSlug: z.string().optional(),
  status: portAllocationStatusEnum.optional().default("active"),
});

export const updatePortAllocationSchema = z.object({
  port: z.number().int().min(1).max(65535).optional(),
  protocol: portProtocolEnum.optional(),
  serviceName: z.string().min(1).max(200).optional(),
  projectSlug: z.string().nullable().optional(),
  status: portAllocationStatusEnum.optional(),
});

export const listPortsQuerySchema = z.object({
  machineId: z.string().optional(),
  projectSlug: z.string().optional(),
  status: portAllocationStatusEnum.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const portAllocationIdSchema = z.object({
  id: z.string().min(1),
});

// ── Port Scans (ingest from portwatch agent) ───────────────────────

export const portScanEntrySchema = z.object({
  port: z.number().int().min(1).max(65535),
  protocol: portProtocolEnum.optional().default("tcp"),
  processName: z.string().nullable().optional(),
  pid: z.number().int().nullable().optional(),
});

export const portScanIngestSchema = z.object({
  machineId: z.string().min(1),
  scans: z.array(portScanEntrySchema).min(0),
});

// ── Auto-allocate ──────────────────────────────────────────────────

export const autoAllocateSchema = z.object({
  machineId: z.string().min(1),
  rangeName: z.string().min(1),
  serviceName: z.string().min(1).max(200),
  projectSlug: z.string().optional(),
});

// ── Port Ranges ────────────────────────────────────────────────────

export const portRangeSchema = z.object({
  id: z.string(),
  name: z.string(),
  startPort: z.number().int(),
  endPort: z.number().int(),
  description: z.string().nullable(),
  createdAt: z.string(),
});

// ── Merged Port Map Entry ──────────────────────────────────────────

export const portMapEntrySchema = z.object({
  port: z.number().int(),
  protocol: z.string(),
  machineId: z.string(),
  machineHostname: z.string(),
  // Allocation data (null if unregistered)
  allocationId: z.string().nullable(),
  serviceName: z.string().nullable(),
  projectSlug: z.string().nullable(),
  allocationStatus: portAllocationStatusEnum.nullable(),
  // Scan data (null if not seen)
  processName: z.string().nullable(),
  pid: z.number().int().nullable(),
  lastScanAt: z.string().datetime().nullable(),
  // Reconciled status
  liveStatus: portLiveStatusEnum,
});
