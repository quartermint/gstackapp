import type { z } from "zod";
import type {
  captureSchema,
  createCaptureSchema,
  updateCaptureSchema,
  listCapturesQuerySchema,
} from "../schemas/capture.js";
import type {
  projectSchema,
  projectListQuerySchema,
} from "../schemas/project.js";
import type {
  apiErrorSchema,
  healthResponseSchema,
  searchQuerySchema,
  searchResultSchema,
  searchResponseSchema,
} from "../schemas/api.js";
import type {
  machineSchema,
  createMachineSchema,
  portAllocationSchema,
  createPortAllocationSchema,
  updatePortAllocationSchema,
  listPortsQuerySchema,
  portScanEntrySchema,
  portScanIngestSchema,
  autoAllocateSchema,
  portRangeSchema,
  portMapEntrySchema,
} from "../schemas/port.js";
import type {
  healthCheckTypeEnum,
  healthSeverityEnum,
  riskLevelEnum,
  copyHostEnum,
  healthFindingSchema,
  healthFindingInputSchema,
  projectCopySchema,
  healthFindingResponseSchema,
  healthCheckResponseSchema,
  risksResponseSchema,
  copyResponseSchema,
} from "../schemas/health.js";
import type {
  sessionSourceEnum,
  sessionStatusEnum,
  modelTierEnum,
  createSessionSchema,
  heartbeatSchema,
  stopSessionSchema,
  sessionSchema,
  sessionResponseSchema,
  listSessionsQuerySchema,
} from "../schemas/session.js";

export type Capture = z.infer<typeof captureSchema>;
export type CreateCapture = z.infer<typeof createCaptureSchema>;
export type UpdateCapture = z.infer<typeof updateCaptureSchema>;
export type ListCapturesQuery = z.infer<typeof listCapturesQuerySchema>;

export type Project = z.infer<typeof projectSchema>;
export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;

export type ApiError = z.infer<typeof apiErrorSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;

export type Machine = z.infer<typeof machineSchema>;
export type CreateMachine = z.infer<typeof createMachineSchema>;
export type PortAllocation = z.infer<typeof portAllocationSchema>;
export type CreatePortAllocation = z.infer<typeof createPortAllocationSchema>;
export type UpdatePortAllocation = z.infer<typeof updatePortAllocationSchema>;
export type ListPortsQuery = z.infer<typeof listPortsQuerySchema>;
export type PortScanEntry = z.infer<typeof portScanEntrySchema>;
export type PortScanIngest = z.infer<typeof portScanIngestSchema>;
export type AutoAllocateRequest = z.infer<typeof autoAllocateSchema>;
export type PortRange = z.infer<typeof portRangeSchema>;
export type PortMapEntry = z.infer<typeof portMapEntrySchema>;

export type HealthCheckType = z.infer<typeof healthCheckTypeEnum>;
export type HealthSeverity = z.infer<typeof healthSeverityEnum>;
export type RiskLevel = z.infer<typeof riskLevelEnum>;
export type CopyHost = z.infer<typeof copyHostEnum>;
export type HealthFinding = z.infer<typeof healthFindingSchema>;
export type HealthFindingInput = z.infer<typeof healthFindingInputSchema>;
export type ProjectCopy = z.infer<typeof projectCopySchema>;

export type HealthFindingResponse = z.infer<typeof healthFindingResponseSchema>;
export type HealthCheckResponse = z.infer<typeof healthCheckResponseSchema>;
export type RisksResponse = z.infer<typeof risksResponseSchema>;
export type CopyResponse = z.infer<typeof copyResponseSchema>;

export type SessionSource = z.infer<typeof sessionSourceEnum>;
export type SessionStatus = z.infer<typeof sessionStatusEnum>;
export type ModelTier = z.infer<typeof modelTierEnum>;
export type CreateSession = z.infer<typeof createSessionSchema>;
export type Heartbeat = z.infer<typeof heartbeatSchema>;
export type StopSession = z.infer<typeof stopSessionSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;
