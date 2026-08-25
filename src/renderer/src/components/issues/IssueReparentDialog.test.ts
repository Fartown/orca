import { describe, expect, it } from 'vitest'
import type { IssueSummary } from '../../../../shared/issues/types'
import { legalReparentTargets } from './IssueReparentDialog'

describe('legalReparentTargets', () => {
  it('excludes self, descendants, and cross-host Issues', () => {
    const root = issue('root', null, 'local')
    const child = issue('child', root.id, 'local')
    const grandchild = issue('grandchild', child.id, 'local')
    const sibling = issue('sibling', null, 'local')
    const remote = issue('remote', null, 'ssh:remote')

    expect(
      legalReparentTargets(child, [root, child, grandchild, sibling, remote]).map(
        (candidate) => candidate.id
      )
    ).toEqual(['root', 'sibling'])
  })
})

function issue(
  id: string,
  parentId: string | null,
  executionHostId: 'local' | `ssh:${string}`
): IssueSummary {
  return {
    id,
    hostPartitionKey: executionHostId,
    executionHostId,
    source: { kind: 'local', number: 1 },
    localTitle: id,
    typeLabel: null,
    note: null,
    state: 'active',
    parentId,
    siblingOrder: 0,
    recordRevision: 0,
    createdAt: 1,
    updatedAt: 1,
    archivedAt: null,
    ownUnresolvedCount: 0,
    descendantAttentionCount: 0,
    directConversationCount: 0,
    runningConversationCount: 0
  }
}
