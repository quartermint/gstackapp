import { z } from "zod";

export const solutionProblemTypeEnum = z.enum([
  "bug_fix",
  "architecture",
  "performance",
  "integration",
  "configuration",
  "testing",
  "deployment",
]);

export const solutionSeverityEnum = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

export const solutionStatusEnum = z.enum([
  "candidate",
  "accepted",
  "dismissed",
]);

export const solutionReferenceTypeEnum = z.enum([
  "startup_banner",
  "search_result",
  "mcp_query",
]);

export const solutionSchema = z.object({
  id: z.string(),
  sessionId: z.string().nullable().optional(),
  projectSlug: z.string().nullable().optional(),
  title: z.string(),
  content: z.string(),
  contentHash: z.string(),
  module: z.string().nullable().optional(),
  problemType: solutionProblemTypeEnum.nullable().optional(),
  symptoms: z.string().nullable().optional(),
  rootCause: z.string().nullable().optional(),
  tagsJson: z.string().nullable().optional(),
  severity: solutionSeverityEnum.nullable().optional(),
  status: solutionStatusEnum,
  referenceCount: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  reviewedAt: z.string().datetime().nullable().optional(),
});

export const createSolutionSchema = z.object({
  sessionId: z.string().optional(),
  projectSlug: z.string().optional(),
  title: z.string().min(1).max(500),
  content: z.string().min(1).max(50000),
  contentHash: z.string().min(1),
  module: z.string().optional(),
  problemType: solutionProblemTypeEnum.optional(),
  symptoms: z.string().optional(),
  rootCause: z.string().optional(),
  tagsJson: z.string().optional(),
  severity: solutionSeverityEnum.optional(),
  status: solutionStatusEnum.optional(),
});

export const updateSolutionStatusSchema = z.object({
  status: solutionStatusEnum,
});

export const updateSolutionMetadataSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  module: z.string().optional(),
  problemType: solutionProblemTypeEnum.optional(),
  symptoms: z.string().optional(),
  rootCause: z.string().optional(),
  tagsJson: z.string().optional(),
  severity: solutionSeverityEnum.optional(),
});

export const listSolutionsQuerySchema = z.object({
  projectSlug: z.string().optional(),
  status: solutionStatusEnum.optional(),
  problemType: solutionProblemTypeEnum.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const solutionReferenceSchema = z.object({
  id: z.string(),
  solutionId: z.string(),
  sessionId: z.string(),
  referenceType: solutionReferenceTypeEnum,
  createdAt: z.string().datetime(),
});

export const compoundScoreSchema = z.object({
  totalSolutions: z.number().int(),
  acceptedSolutions: z.number().int(),
  referencedSolutions: z.number().int(),
  totalReferences: z.number().int(),
  reuseRate: z.number(),
  weeklyTrend: z.array(
    z.object({
      week: z.string(),
      references: z.number().int(),
    })
  ),
});
