/**
 * Mission Control Worker - Cloudflare Worker Entry Point
 *
 * Public entry point that handles:
 * - Token validation
 * - Rate limiting
 * - Request routing to Hub via Tailscale
 */

import { handleRequest } from './handler.js';

/**
 * Environment bindings for the worker
 */
export interface Env {
  /** Hub URL (Tailscale IP) */
  HUB_URL: string;
  /** JWT secret for token validation */
  JWT_SECRET: string;
  /** KV namespace for rate limiting */
  RATE_LIMIT: KVNamespace;
}

/**
 * Execution context provided by Cloudflare
 */
export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export default {
  /**
   * Main fetch handler for incoming requests
   */
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    return handleRequest(request, env, ctx);
  },
};
