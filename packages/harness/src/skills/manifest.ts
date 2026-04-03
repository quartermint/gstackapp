import { z } from 'zod'

/** Canonical tool names (Claude Code conventions) */
export const CanonicalToolSchema = z.enum(['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'])

/** Capability tiers matching model profiles */
export const ModelTierSchema = z.enum(['opus', 'sonnet', 'haiku'])

/** Provider capabilities a skill may require */
export const CapabilitySchema = z.enum(['tool_use', 'vision', 'long_context'])

/**
 * SkillManifest Zod schema — validates .skill.json files.
 * Required fields: id, name, version, tools, prompt, outputSchema
 * Optional fields: minimumModel, capabilities, description, author, license
 */
export const SkillManifestSchema = z.object({
  // Required fields (D-05)
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be semver (e.g., 1.0.0)'),
  tools: z.array(CanonicalToolSchema).min(1),
  prompt: z.string().min(1),
  outputSchema: z.record(z.unknown()),

  // Optional fields (D-06)
  minimumModel: ModelTierSchema.optional(),
  capabilities: z.array(CapabilitySchema).optional(),
  description: z.string().optional(),
  author: z.string().optional(),
  license: z.string().optional(),
})

export type SkillManifest = z.infer<typeof SkillManifestSchema>
