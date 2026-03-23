import { describe, it, expect } from "vitest";
import { resolveUser } from "../../lib/user-identity.js";
import type { MCUser } from "../../lib/config.js";

/**
 * User Identity Resolution Tests
 *
 * Verifies the resolution order:
 * 1. Tailscale-User-Login header -> match against registry tailscaleLogin
 * 2. X-MC-User header -> match against registry id (dev/testing fallback)
 * 3. Default to first owner in registry, or DEFAULT_USER if no registry
 */

const registry: MCUser[] = [
  { id: "ryan", displayName: "Ryan", role: "owner", tailscaleLogin: "ryan@example.com" },
  { id: "bella", displayName: "Bella", role: "member", tailscaleLogin: "bella@example.com" },
];

function makeHeaders(entries: Record<string, string> = {}): { get(name: string): string | undefined } {
  return {
    get(name: string) {
      return entries[name.toLowerCase()];
    },
  };
}

describe("resolveUser", () => {
  it("resolves Tailscale-User-Login header to registry user", () => {
    const headers = makeHeaders({ "tailscale-user-login": "bella@example.com" });
    const user = resolveUser(headers, registry);
    expect(user.id).toBe("bella");
    expect(user.displayName).toBe("Bella");
    expect(user.role).toBe("member");
  });

  it("resolves X-MC-User header to registry user by id", () => {
    const headers = makeHeaders({ "x-mc-user": "bella" });
    const user = resolveUser(headers, registry);
    expect(user.id).toBe("bella");
    expect(user.displayName).toBe("Bella");
  });

  it("falls back to default owner when no headers provided", () => {
    const headers = makeHeaders();
    const user = resolveUser(headers, registry);
    expect(user.id).toBe("ryan");
    expect(user.role).toBe("owner");
  });

  it("falls back to default when Tailscale header does not match registry", () => {
    const headers = makeHeaders({ "tailscale-user-login": "unknown@example.com" });
    const user = resolveUser(headers, registry);
    expect(user.id).toBe("ryan");
    expect(user.role).toBe("owner");
  });

  it("falls back to default when X-MC-User header does not match registry", () => {
    const headers = makeHeaders({ "x-mc-user": "unknown-user" });
    const user = resolveUser(headers, registry);
    expect(user.id).toBe("ryan");
    expect(user.role).toBe("owner");
  });

  it("uses first owner from registry as default when registry is non-empty", () => {
    const customRegistry: MCUser[] = [
      { id: "admin", displayName: "Admin", role: "owner" },
      { id: "guest", displayName: "Guest", role: "member" },
    ];
    const headers = makeHeaders();
    const user = resolveUser(headers, customRegistry);
    expect(user.id).toBe("admin");
    expect(user.displayName).toBe("Admin");
  });

  it("returns hardcoded default when registry is empty", () => {
    const headers = makeHeaders();
    const user = resolveUser(headers, []);
    expect(user.id).toBe("ryan");
    expect(user.displayName).toBe("Ryan");
    expect(user.role).toBe("owner");
  });

  it("returns hardcoded default when registry is undefined", () => {
    const headers = makeHeaders();
    const user = resolveUser(headers);
    expect(user.id).toBe("ryan");
    expect(user.displayName).toBe("Ryan");
    expect(user.role).toBe("owner");
  });

  it("Tailscale header takes priority over X-MC-User header", () => {
    const headers = makeHeaders({
      "tailscale-user-login": "ryan@example.com",
      "x-mc-user": "bella",
    });
    const user = resolveUser(headers, registry);
    expect(user.id).toBe("ryan");
  });
});
