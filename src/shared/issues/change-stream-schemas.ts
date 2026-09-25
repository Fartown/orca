import { z } from 'zod'

export const ISSUE_CHANGES_SUBSCRIBE_METHOD = 'issues.subscribeChanges'
export const ISSUE_CHANGES_UNSUBSCRIBE_METHOD = 'issues.unsubscribeChanges'

export const IssuesUnsubscribeChangesParams = z.object({
  subscriptionId: z.string().min(1)
})

// Why: the stream carries invalidation only; clients re-read through the revision-aware
// list methods, so a notice can never disagree with the snapshot it points at.
export const IssueChangeStreamMessage = z.discriminatedUnion('type', [
  // Sent after the host attaches its listener; every (re)subscribe must resync.
  z.object({ type: z.literal('ready'), subscriptionId: z.string() }),
  // null: runtime attachments or readiness moved, which every partition projects.
  z.object({ type: z.literal('changed'), hostPartitionKeys: z.array(z.string()).nullable() }),
  z.object({ type: z.literal('end') })
])

export type IssueChangeStreamMessage = z.infer<typeof IssueChangeStreamMessage>
