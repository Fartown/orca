import { describe, expect, it } from 'vitest'
import { LocalTaskProposalItemSchema } from './local-task-dispatcher-rpc-params'
import { LocalTasksLinksLinkWorkspaceParams } from './local-tasks-link-rpc-params'

describe('dispatcher workspace proposal targets', () => {
  it.each(['start', 'link', 'record'] as const)(
    'accepts the same long worktree id as a workspace link for %s',
    (kind) => {
      const worktreeId = `repo-1::/tmp/${'w'.repeat(200)}`
      const target = { worktreeId }
      const proposal =
        kind === 'start'
          ? { kind, title: 'Check output', prompt: 'Run checks', target }
          : kind === 'link'
            ? { kind, taskId: 'task-1', target }
            : { kind, title: 'Check output', target }
      expect(
        LocalTasksLinksLinkWorkspaceParams.safeParse({
          clientOperationId: 'op-1',
          taskId: 'task-1',
          hostId: 'host-1',
          kind: 'git-worktree',
          worktreeId,
          linkedVia: 'manual'
        }).success
      ).toBe(true)
      expect(LocalTaskProposalItemSchema.safeParse(proposal).success).toBe(true)
      expect(
        LocalTaskProposalItemSchema.safeParse({
          ...proposal,
          target: { worktreeId: 'w'.repeat(4097) }
        }).success
      ).toBe(false)
    }
  )
})
