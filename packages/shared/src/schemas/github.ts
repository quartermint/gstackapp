import { z } from 'zod'

export const InstallationSchema = z.object({
  id: z.number(),
  accountLogin: z.string(),
  accountType: z.enum(['User', 'Organization']),
  appId: z.number(),
  status: z.enum(['active', 'suspended', 'deleted']),
})
export type Installation = z.infer<typeof InstallationSchema>

export const RepositorySchema = z.object({
  id: z.number(),
  installationId: z.number(),
  fullName: z.string(),
  defaultBranch: z.string().default('main'),
  isActive: z.boolean().default(true),
})
export type Repository = z.infer<typeof RepositorySchema>
