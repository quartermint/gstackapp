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
} from "../schemas/api.js";

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
