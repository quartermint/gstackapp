import { z } from 'zod';

/**
 * Node status schema
 */
export const NodeStatusSchema = z.enum(['online', 'offline', 'busy', 'draining']);

export type NodeStatus = z.infer<typeof NodeStatusSchema>;

/**
 * Node capabilities
 */
export const NodeCapabilitiesSchema = z.object({
  /** CPU cores available */
  cpuCores: z.number().min(1),
  /** Memory in MB */
  memoryMb: z.number().min(512),
  /** Whether sandbox is enabled */
  sandboxEnabled: z.boolean(),
  /** Supported platforms */
  platform: z.enum(['darwin', 'linux']),
  /** Node architecture */
  arch: z.enum(['arm64', 'x64']),
});

export type NodeCapabilities = z.infer<typeof NodeCapabilitiesSchema>;

/**
 * Node heartbeat schema (Compute -> Hub)
 */
export const NodeHeartbeatSchema = z.object({
  /** Node hostname */
  hostname: z.string().min(1),
  /** Node status */
  status: NodeStatusSchema,
  /** Current load (0-1) */
  load: z.number().min(0).max(1),
  /** Active task count */
  activeTasks: z.number().min(0),
  /** Node capabilities */
  capabilities: NodeCapabilitiesSchema,
  /** Tailscale IP */
  tailscaleIp: z.string().ip().optional(),
  /** Version of compute package */
  version: z.string().optional(),
});

export type NodeHeartbeat = z.infer<typeof NodeHeartbeatSchema>;

/**
 * Node registration response (Hub -> Compute)
 */
export const NodeRegistrationResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    /** Assigned node ID */
    nodeId: z.string(),
    /** Heartbeat interval in ms */
    heartbeatIntervalMs: z.number(),
    /** Acknowledged */
    acknowledged: z.literal(true),
  }),
});

export type NodeRegistrationResponse = z.infer<
  typeof NodeRegistrationResponseSchema
>;

/**
 * Node info for listing
 */
export const NodeInfoSchema = z.object({
  id: z.string(),
  hostname: z.string(),
  status: NodeStatusSchema,
  load: z.number(),
  activeTasks: z.number(),
  capabilities: NodeCapabilitiesSchema,
  lastHeartbeat: z.number(),
  tailscaleIp: z.string().optional(),
});

export type NodeInfo = z.infer<typeof NodeInfoSchema>;
