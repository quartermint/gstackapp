import { TRUST_LEVELS } from '../constants.js';

/**
 * Trust level for request classification
 * - internal: Requests from Tailscale peers (highest trust)
 * - power-user: Requests with JWT role='power-user' and device approval (can create tasks, execute sandboxed code)
 * - authenticated: Requests with valid JWT token
 * - untrusted: External requests without authentication
 */
export type TrustLevel = (typeof TRUST_LEVELS)[keyof typeof TRUST_LEVELS];

/**
 * Trust context attached to requests after classification
 */
export interface TrustContext {
  /** The determined trust level */
  level: TrustLevel;
  /** Source IP address */
  sourceIp: string;
  /** User ID if authenticated */
  userId?: string;
  /** Tailscale hostname if internal */
  tailscaleHostname?: string;
  /** JWT claims if authenticated */
  jwtClaims?: Record<string, unknown>;
}

/**
 * Type guard to check if a string is a valid TrustLevel
 */
export function isTrustLevel(value: unknown): value is TrustLevel {
  return (
    typeof value === 'string' &&
    Object.values(TRUST_LEVELS).includes(value as TrustLevel)
  );
}

/**
 * Trust level hierarchy for comparison
 * Higher number = more trusted
 */
export const TRUST_HIERARCHY: Record<TrustLevel, number> = {
  [TRUST_LEVELS.UNTRUSTED]: 0,
  [TRUST_LEVELS.AUTHENTICATED]: 1,
  [TRUST_LEVELS.POWER_USER]: 2,
  [TRUST_LEVELS.INTERNAL]: 3,
};

/**
 * Check if one trust level meets or exceeds another
 */
export function meetsTrustLevel(
  actual: TrustLevel,
  required: TrustLevel
): boolean {
  return TRUST_HIERARCHY[actual] >= TRUST_HIERARCHY[required];
}
