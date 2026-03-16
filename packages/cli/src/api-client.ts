import { getApiUrl } from "./config.js";

const TIMEOUT_MS = 5000;

export interface ApiError {
  code: string;
  message: string;
}

export class McApiError extends Error {
  constructor(
    public status: number,
    public apiError?: ApiError
  ) {
    super(apiError?.message ?? `API error: ${status}`);
    this.name = "McApiError";
  }
}

export class McApiUnreachable extends Error {
  constructor(cause?: unknown) {
    super("MC API unreachable");
    this.name = "McApiUnreachable";
    this.cause = cause;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${getApiUrl()}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!res.ok) {
      let apiError: ApiError | undefined;
      try {
        const body = await res.json();
        apiError = body.error;
      } catch {
        // Non-JSON error body
      }
      throw new McApiError(res.status, apiError);
    }

    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof McApiError) throw e;
    throw new McApiUnreachable(e);
  } finally {
    clearTimeout(timeout);
  }
}

// -- Captures --

export interface CreateCaptureRequest {
  rawContent: string;
  type?: "text";
  projectId?: string;
}

export interface CaptureResponse {
  capture: {
    id: string;
    rawContent: string;
    projectId: string | null;
    aiProjectSlug: string | null;
    createdAt: string;
  };
}

export function createCapture(data: CreateCaptureRequest): Promise<CaptureResponse> {
  return request<CaptureResponse>("/api/captures", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// -- Projects --

export interface ProjectSummary {
  slug: string;
  name: string;
  host: string;
  path: string;
  lastCommitTime: string | null;
  lastCommitDate: string | null;
  lastCommitMessage: string | null;
  healthScore: number | null;
  riskLevel: string;
}

export interface ProjectsResponse {
  projects: ProjectSummary[];
}

export function listProjects(): Promise<ProjectsResponse> {
  return request<ProjectsResponse>("/api/projects");
}

// -- Sessions --

export interface SessionsResponse {
  sessions: Array<{
    id: string;
    source: string;
    model: string | null;
    projectSlug: string | null;
    status: string;
    startedAt: string;
  }>;
  total: number;
}

export function listSessions(status?: string): Promise<SessionsResponse> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString();
  return request<SessionsResponse>(`/api/sessions${qs ? `?${qs}` : ""}`);
}

// -- Health check (lightweight) --

export async function checkHealth(): Promise<boolean> {
  try {
    await request<unknown>("/api/health");
    return true;
  } catch {
    return false;
  }
}
