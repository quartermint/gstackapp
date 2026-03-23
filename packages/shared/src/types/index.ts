import type { z } from "zod";
import type {
  captureSchema,
  createCaptureSchema,
  updateCaptureSchema,
  listCapturesQuerySchema,
  captureSourceTypeEnum,
  extractionTypeEnum,
  captureExtractionSchema,
  fewShotExampleSchema,
  correctionStatsSchema,
  reassignCaptureSchema,
  groundingSpanSchema,
  deviceClassificationSchema,
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
import type {
  burnRateEnum,
  weeklyBudgetSchema,
  routingSuggestionSchema,
  budgetResponseSchema,
} from "../schemas/budget.js";
import type {
  lmStudioHealthEnum,
  lmStudioStatusSchema,
  modelsResponseSchema,
} from "../schemas/models.js";
import type {
  discoveryHostEnum,
  discoveryStatusEnum,
  discoverySchema,
  createDiscoverySchema,
  updateDiscoveryStatusSchema,
  listDiscoveriesQuerySchema,
} from "../schemas/discovery.js";
import type {
  starIntentEnum,
  starSchema,
  createStarSchema,
  updateStarIntentSchema,
  listStarsQuerySchema,
} from "../schemas/star.js";
import type {
  knowledgeResponseSchema,
  knowledgeListResponseSchema,
} from "../schemas/knowledge.js";
import type {
  recordVisitSchema,
  getVisitQuerySchema,
  visitResponseSchema,
} from "../schemas/visit.js";
import type {
  insightTypeEnum,
  insightSchema,
} from "../schemas/insight.js";
import type {
  solutionProblemTypeEnum,
  solutionSeverityEnum,
  solutionStatusEnum,
  solutionReferenceTypeEnum,
  solutionSchema,
  createSolutionSchema,
  updateSolutionStatusSchema,
  updateSolutionMetadataSchema,
  listSolutionsQuerySchema,
  solutionReferenceSchema,
  compoundScoreSchema,
} from "../schemas/solution.js";

export type Capture = z.infer<typeof captureSchema>;
export type CreateCapture = z.infer<typeof createCaptureSchema>;
export type UpdateCapture = z.infer<typeof updateCaptureSchema>;
export type ListCapturesQuery = z.infer<typeof listCapturesQuerySchema>;
export type CaptureSourceType = z.infer<typeof captureSourceTypeEnum>;
export type ExtractionType = z.infer<typeof extractionTypeEnum>;
export type CaptureExtraction = z.infer<typeof captureExtractionSchema>;
export type FewShotExample = z.infer<typeof fewShotExampleSchema>;
export type CorrectionStats = z.infer<typeof correctionStatsSchema>;
export type ReassignCapture = z.infer<typeof reassignCaptureSchema>;
export type GroundingSpan = z.infer<typeof groundingSpanSchema>;
export type DeviceClassification = z.infer<typeof deviceClassificationSchema>;

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

export type BurnRate = z.infer<typeof burnRateEnum>;
export type WeeklyBudget = z.infer<typeof weeklyBudgetSchema>;
export type RoutingSuggestion = z.infer<typeof routingSuggestionSchema>;
export type BudgetResponse = z.infer<typeof budgetResponseSchema>;
export type LmStudioHealth = z.infer<typeof lmStudioHealthEnum>;
export type LmStudioStatus = z.infer<typeof lmStudioStatusSchema>;
export type ModelsResponse = z.infer<typeof modelsResponseSchema>;

export type DiscoveryHost = z.infer<typeof discoveryHostEnum>;
export type DiscoveryStatus = z.infer<typeof discoveryStatusEnum>;
export type Discovery = z.infer<typeof discoverySchema>;
export type CreateDiscovery = z.infer<typeof createDiscoverySchema>;
export type UpdateDiscoveryStatus = z.infer<typeof updateDiscoveryStatusSchema>;
export type ListDiscoveriesQuery = z.infer<typeof listDiscoveriesQuerySchema>;

export type StarIntent = z.infer<typeof starIntentEnum>;
export type Star = z.infer<typeof starSchema>;
export type CreateStar = z.infer<typeof createStarSchema>;
export type UpdateStarIntent = z.infer<typeof updateStarIntentSchema>;
export type ListStarsQuery = z.infer<typeof listStarsQuerySchema>;

export type KnowledgeResponse = z.infer<typeof knowledgeResponseSchema>;
export type KnowledgeListResponse = z.infer<typeof knowledgeListResponseSchema>;

export type RecordVisit = z.infer<typeof recordVisitSchema>;
export type GetVisitQuery = z.infer<typeof getVisitQuerySchema>;
export type VisitResponse = z.infer<typeof visitResponseSchema>;

export type InsightType = z.infer<typeof insightTypeEnum>;
export type Insight = z.infer<typeof insightSchema>;

export type SolutionProblemType = z.infer<typeof solutionProblemTypeEnum>;
export type SolutionSeverity = z.infer<typeof solutionSeverityEnum>;
export type SolutionStatus = z.infer<typeof solutionStatusEnum>;
export type SolutionReferenceType = z.infer<typeof solutionReferenceTypeEnum>;
export type Solution = z.infer<typeof solutionSchema>;
export type CreateSolution = z.infer<typeof createSolutionSchema>;
export type UpdateSolutionStatus = z.infer<typeof updateSolutionStatusSchema>;
export type UpdateSolutionMetadata = z.infer<typeof updateSolutionMetadataSchema>;
export type ListSolutionsQuery = z.infer<typeof listSolutionsQuerySchema>;
export type SolutionReference = z.infer<typeof solutionReferenceSchema>;
export type CompoundScore = z.infer<typeof compoundScoreSchema>;
