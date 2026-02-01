/**
 * API Keys Management
 *
 * Provides CRUD operations for API keys persistence in Convex.
 * Keys are stored with their hashes (never store raw keys).
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Create a new API key record
 */
export const create = mutation({
  args: {
    id: v.string(),
    keyHash: v.string(),
    keyPrefix: v.string(),
    name: v.string(),
    ownerId: v.string(),
    ownerType: v.union(v.literal("service"), v.literal("user")),
    scopes: v.array(v.string()),
    environment: v.union(
      v.literal("development"),
      v.literal("staging"),
      v.literal("production")
    ),
    active: v.boolean(),
    expiresAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Math.floor(Date.now() / 1000);
    const id = await ctx.db.insert("apiKeys", {
      keyId: args.id,
      keyHash: args.keyHash,
      keyPrefix: args.keyPrefix,
      name: args.name,
      ownerId: args.ownerId,
      ownerType: args.ownerType,
      scopes: args.scopes,
      environment: args.environment,
      active: args.active,
      expiresAt: args.expiresAt,
      createdAt: now,
      metadata: args.metadata,
    });
    return id;
  },
});

/**
 * Get an API key by its hash
 */
export const getByHash = query({
  args: {
    keyHash: v.string(),
  },
  handler: async (ctx, { keyHash }) => {
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyHash", (q) => q.eq("keyHash", keyHash))
      .first();
    return key;
  },
});

/**
 * Get an API key by its ID
 */
export const getById = query({
  args: {
    keyId: v.string(),
  },
  handler: async (ctx, { keyId }) => {
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyId", (q) => q.eq("keyId", keyId))
      .first();
    return key;
  },
});

/**
 * List API keys by owner
 */
export const listByOwner = query({
  args: {
    ownerId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { ownerId, limit }) => {
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .take(limit ?? 50);

    // Return keys without hash
    return keys.map((key) => ({
      _id: key._id,
      keyId: key.keyId,
      keyPrefix: key.keyPrefix,
      name: key.name,
      ownerId: key.ownerId,
      ownerType: key.ownerType,
      scopes: key.scopes,
      environment: key.environment,
      active: key.active,
      expiresAt: key.expiresAt,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
      metadata: key.metadata,
    }));
  },
});

/**
 * Update an API key's last used timestamp
 */
export const updateLastUsed = mutation({
  args: {
    keyId: v.string(),
  },
  handler: async (ctx, { keyId }) => {
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyId", (q) => q.eq("keyId", keyId))
      .first();

    if (!key) {
      throw new Error(`API key ${keyId} not found`);
    }

    await ctx.db.patch(key._id, {
      lastUsedAt: Math.floor(Date.now() / 1000),
    });

    return key._id;
  },
});

/**
 * Revoke an API key (soft delete)
 */
export const revoke = mutation({
  args: {
    keyId: v.string(),
  },
  handler: async (ctx, { keyId }) => {
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyId", (q) => q.eq("keyId", keyId))
      .first();

    if (!key) {
      return false;
    }

    await ctx.db.patch(key._id, {
      active: false,
    });

    return true;
  },
});

/**
 * Delete an API key permanently
 */
export const deleteKey = mutation({
  args: {
    keyId: v.string(),
  },
  handler: async (ctx, { keyId }) => {
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyId", (q) => q.eq("keyId", keyId))
      .first();

    if (!key) {
      return false;
    }

    await ctx.db.delete(key._id);
    return true;
  },
});

/**
 * Update API key expiration (for rotation with grace period)
 */
export const updateExpiration = mutation({
  args: {
    keyId: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, { keyId, expiresAt }) => {
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyId", (q) => q.eq("keyId", keyId))
      .first();

    if (!key) {
      throw new Error(`API key ${keyId} not found`);
    }

    await ctx.db.patch(key._id, {
      expiresAt,
    });

    return key._id;
  },
});

/**
 * List all active API keys (for cache warming)
 */
export const listActive = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }) => {
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_active", (q) => q.eq("active", true))
      .take(limit ?? 1000);
    return keys;
  },
});
