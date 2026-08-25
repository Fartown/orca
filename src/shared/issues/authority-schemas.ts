import { z } from 'zod'
import { parseExecutionHostId, type ExecutionHostId } from '../execution-host'
import type { AuthorityExecutionHostId, AuthorityHostPartitionKey } from './types'

const AuthorityIdSchema = z.string().uuid()

export const AuthorityExecutionHostIdSchema = z
  .union([
    z.literal('local'),
    z
      .string()
      .regex(/^ssh:[^\s]+$/)
      .max(4_096)
  ])
  .transform((value): AuthorityExecutionHostId => value as AuthorityExecutionHostId)

export const IssueHostPartitionKeySchema = AuthorityExecutionHostIdSchema.transform(
  (value): AuthorityHostPartitionKey => value
)

export const IssueRouteExecutionHostIdSchema = z.string().transform((value, context) => {
  const parsed = parseExecutionHostId(value)
  if (parsed) {
    return parsed.id as ExecutionHostId
  }
  context.addIssue({ code: 'custom', message: 'Invalid execution host id' })
  return z.NEVER
})

export const IssueAuthorityDescriptorSchema = z.object({
  authorityId: AuthorityIdSchema,
  hostPartitionKey: IssueHostPartitionKeySchema,
  authorityExecutionHostId: AuthorityExecutionHostIdSchema,
  profileLabel: z.string().trim().min(1).max(512).optional()
})
