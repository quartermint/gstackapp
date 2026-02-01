/**
 * Request Handler - Routes incoming requests to appropriate handlers
 */

import type { Env, ExecutionContext } from './index.js';
import { validateToken, type TokenClaims } from './auth.js';
import { RateLimiter } from './ratelimit.js';
import {
  createErrorResponse,
  ERROR_CODES,
  HTTP_STATUS,
  generateRequestId,
} from '@mission-control/shared';

/**
 * CORS headers for responses
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

/**
 * Create a JSON response with standard headers
 */
function jsonResponse(
  data: unknown,
  status: number = HTTP_STATUS.OK
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

/**
 * Create an error response
 */
function errorResponse(
  code: Parameters<typeof createErrorResponse>[0],
  message: string,
  status: number,
  requestId?: string,
  details?: Record<string, unknown>
): Response {
  return jsonResponse(
    createErrorResponse(code, message, details, requestId),
    status
  );
}

/**
 * Get client IP from request
 */
function getClientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

/**
 * Handle health check endpoint
 */
function handleHealthCheck(requestId: string): Response {
  return jsonResponse({
    success: true,
    data: {
      status: 'healthy',
      service: 'mission-control-worker',
      timestamp: Date.now(),
      requestId,
    },
  });
}

/**
 * Forward request to Hub via Tailscale
 */
async function forwardToHub(
  request: Request,
  env: Env,
  path: string,
  claims: TokenClaims | null,
  requestId: string
): Promise<Response> {
  const hubUrl = `${env.HUB_URL}${path}`;

  try {
    // Clone request body for forwarding
    const body = request.method !== 'GET' ? await request.text() : undefined;

    // Build headers for Hub request
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
      'X-Forwarded-For': getClientIp(request),
    };

    // Pass along authenticated user info if available
    if (claims) {
      headers['X-User-Id'] = claims.sub;
      headers['X-Trust-Level'] = 'authenticated';
    } else {
      headers['X-Trust-Level'] = 'untrusted';
    }

    const hubResponse = await fetch(hubUrl, {
      method: request.method,
      headers,
      body,
    });

    // Clone response with CORS headers
    const responseBody = await hubResponse.text();
    return new Response(responseBody, {
      status: hubResponse.status,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS,
      },
    });
  } catch (error) {
    console.error('Hub request failed:', error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to connect to hub',
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      requestId
    );
  }
}

/**
 * Main request handler
 */
export async function handleRequest(
  request: Request,
  env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  const requestId = generateRequestId();
  const url = new URL(request.url);
  const path = url.pathname;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: HTTP_STATUS.OK,
      headers: CORS_HEADERS,
    });
  }

  // Health check doesn't require auth or rate limiting
  if (path === '/health' && request.method === 'GET') {
    return handleHealthCheck(requestId);
  }

  // Rate limiting
  const clientIp = getClientIp(request);
  const rateLimiter = new RateLimiter(env.RATE_LIMIT);
  const rateLimit = await rateLimiter.checkRateLimit(clientIp);

  if (!rateLimit.allowed) {
    return errorResponse(
      ERROR_CODES.RATE_LIMIT_EXCEEDED,
      `Rate limit exceeded. Try again in ${Math.ceil((rateLimit.resetAt - Date.now()) / 1000)} seconds`,
      HTTP_STATUS.TOO_MANY_REQUESTS,
      requestId,
      {
        remaining: rateLimit.remaining,
        resetAt: rateLimit.resetAt,
      }
    );
  }

  // Token validation (optional for some endpoints)
  let claims: TokenClaims | null = null;
  const authHeader = request.headers.get('Authorization');

  if (authHeader) {
    const tokenResult = await validateToken(authHeader, env.JWT_SECRET);
    if (!tokenResult.valid) {
      return errorResponse(
        tokenResult.errorCode,
        tokenResult.errorMessage,
        HTTP_STATUS.UNAUTHORIZED,
        requestId
      );
    }
    claims = tokenResult.claims;
  }

  // Route requests
  switch (true) {
    case path === '/chat' && request.method === 'POST':
      return forwardToHub(request, env, '/chat', claims, requestId);

    case path === '/tasks' && request.method === 'POST':
      return forwardToHub(request, env, '/tasks', claims, requestId);

    case path === '/tasks' && request.method === 'GET':
      return forwardToHub(request, env, `/tasks${url.search}`, claims, requestId);

    case path.startsWith('/tasks/') && request.method === 'GET':
      return forwardToHub(request, env, path, claims, requestId);

    default:
      return errorResponse(
        ERROR_CODES.VALIDATION_FAILED,
        `Unknown endpoint: ${request.method} ${path}`,
        HTTP_STATUS.NOT_FOUND,
        requestId
      );
  }
}
