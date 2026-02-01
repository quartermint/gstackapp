import { z } from 'zod';
import { AGENT_PROFILES } from '../constants.js';

/**
 * User preferences schema
 */
export const UserPreferencesSchema = z.object({
  /** UI theme preference */
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  /** Notification preferences */
  notifications: z.object({
    /** Enable email notifications */
    email: z.boolean().default(true),
    /** Enable push notifications */
    push: z.boolean().default(true),
    /** Enable in-app notifications */
    inApp: z.boolean().default(true),
  }).default({}),
  /** Default agent profile preference */
  defaultAgentProfile: z.enum([
    AGENT_PROFILES.CHAT_READONLY,
    AGENT_PROFILES.CODE_ASSISTANT,
    AGENT_PROFILES.POWER_USER,
    AGENT_PROFILES.TASK_ORCHESTRATOR,
  ]).optional(),
  /** Language preference (ISO 639-1 code) */
  language: z.string().length(2).default('en'),
  /** Timezone (IANA timezone name) */
  timezone: z.string().default('UTC'),
});

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

/**
 * User profile schema
 */
export const UserProfileSchema = z.object({
  /** Unique user ID */
  id: z.string(),
  /** User email address */
  email: z.string().email(),
  /** User display name */
  name: z.string().min(1).max(100).optional(),
  /** User avatar URL */
  avatarUrl: z.string().url().optional(),
  /** User preferences */
  preferences: UserPreferencesSchema,
  /** Whether the user is a power user */
  isPowerUser: z.boolean().default(false),
  /** Whether device is approved for power user access */
  deviceApproved: z.boolean().default(false),
  /** Account creation timestamp (ISO string) */
  createdAt: z.string().datetime(),
  /** Last profile update timestamp (ISO string) */
  updatedAt: z.string().datetime(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

/**
 * User profile response schema
 */
export const UserProfileResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    /** User profile */
    profile: UserProfileSchema,
  }),
});

export type UserProfileResponse = z.infer<typeof UserProfileResponseSchema>;

/**
 * User preferences update request schema
 */
export const UserPreferencesUpdateRequestSchema = z.object({
  /** UI theme preference */
  theme: z.enum(['light', 'dark', 'system']).optional(),
  /** Notification preferences (partial update) */
  notifications: z.object({
    email: z.boolean().optional(),
    push: z.boolean().optional(),
    inApp: z.boolean().optional(),
  }).optional(),
  /** Default agent profile preference */
  defaultAgentProfile: z.enum([
    AGENT_PROFILES.CHAT_READONLY,
    AGENT_PROFILES.CODE_ASSISTANT,
    AGENT_PROFILES.POWER_USER,
    AGENT_PROFILES.TASK_ORCHESTRATOR,
  ]).optional(),
  /** Language preference (ISO 639-1 code) */
  language: z.string().length(2).optional(),
  /** Timezone (IANA timezone name) */
  timezone: z.string().optional(),
});

export type UserPreferencesUpdateRequest = z.infer<typeof UserPreferencesUpdateRequestSchema>;

/**
 * User preferences update response schema
 */
export const UserPreferencesUpdateResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    /** Updated preferences */
    preferences: UserPreferencesSchema,
  }),
});

export type UserPreferencesUpdateResponse = z.infer<typeof UserPreferencesUpdateResponseSchema>;
