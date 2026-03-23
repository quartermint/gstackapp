import type { MCUser } from "./config.js";

const DEFAULT_USER: MCUser = {
  id: "ryan",
  displayName: "Ryan",
  role: "owner",
};

/**
 * Resolve user identity from request context.
 *
 * Resolution order (per D-03, RESEARCH Pattern 2):
 * 1. Tailscale-User-Login header -> match against registry tailscaleLogin
 * 2. X-MC-User header -> match against registry id (dev/testing fallback)
 * 3. Default to first owner in registry, or DEFAULT_USER if no registry
 */
export function resolveUser(
  headers: { get(name: string): string | undefined },
  registry: MCUser[] = []
): MCUser {
  // 1. Tailscale identity header
  const tsLogin = headers.get("tailscale-user-login");
  if (tsLogin) {
    const match = registry.find((u) => u.tailscaleLogin === tsLogin);
    if (match) return match;
  }

  // 2. Dev fallback header
  const mcUser = headers.get("x-mc-user");
  if (mcUser) {
    const match = registry.find((u) => u.id === mcUser);
    if (match) return match;
  }

  // 3. Default: first owner in registry, or hardcoded default
  const owner = registry.find((u) => u.role === "owner");
  return owner ?? DEFAULT_USER;
}

export type { MCUser };
