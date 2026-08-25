import { describe, expect, it } from 'vitest'
import { buildAttentionPreservingIssueRows } from './attention'
import type { IssueAttentionInput } from './attention'

function issue(
  id: string,
  parentId: string | null,
  ownUnresolvedCount: number,
  state: IssueAttentionInput['state'] = 'active'
): IssueAttentionInput {
  return {
    id,
    hostPartitionKey: 'local',
    executionHostId: 'local',
    source: { kind: 'local', number: 1 },
    localTitle: id,
    typeLabel: null,
    note: null,
    state,
    parentId,
    siblingOrder: 0,
    recordRevision: 0,
    createdAt: 1,
    updatedAt: 1,
    archivedAt: state === 'archived' ? 1 : null,
    ownUnresolvedCount
  }
}

describe('Issue attention projection', () => {
  it('keeps archived ancestors as context without inventing own attention', () => {
    const projection = buildAttentionPreservingIssueRows(
      [
        issue('archived-root', null, 0, 'archived'),
        issue('child', 'archived-root', 2),
        issue('grandchild', 'child', 1),
        issue('quiet-root', null, 0)
      ],
      'needs-me'
    )

    expect(projection.globalAttentionIssueCount).toBe(2)
    expect(
      projection.rows.map(({ issue: value, contextOnly, descendantAttentionCount }) => ({
        id: value.id,
        own: value.ownUnresolvedCount,
        contextOnly,
        descendantAttentionCount
      }))
    ).toEqual([
      {
        id: 'archived-root',
        own: 0,
        contextOnly: true,
        descendantAttentionCount: 2
      },
      { id: 'child', own: 2, contextOnly: false, descendantAttentionCount: 1 },
      { id: 'grandchild', own: 1, contextOnly: false, descendantAttentionCount: 0 }
    ])
  })
})
