import { describe, expect, it } from 'vitest'
import type { IssueSummary } from '../../../shared/issues/types'
import { buildIssueBindingOptions } from './issue-binding-options'

describe('Issue binding options', () => {
  it('keeps active Issues in tree order and exposes their full hierarchy for search', () => {
    const options = buildIssueBindingOptions([
      issue('child', 'Child task', 'root', 1),
      issue('root', 'Root project', null, 0),
      issue('archived', 'Archived task', null, 2, { state: 'archived' })
    ])

    expect(options.map((option) => option.issue.id)).toEqual(['root', 'child'])
    expect(options[1]).toMatchObject({
      title: 'Child task',
      path: 'Root project / Child task',
      searchValue: 'Root project / Child task'
    })
  })

  it('makes external identifiers and Issue types searchable without changing the label', () => {
    const external = issue('external', '', null, 0, {
      source: {
        kind: 'external',
        provider: 'gitlab',
        identifier: 'ORCA-321',
        url: 'https://gitlab.example.com/orca/issues/321',
        titleSnapshot: 'Fix binding picker'
      },
      localTitle: null,
      typeLabel: 'Bug'
    })

    expect(buildIssueBindingOptions([external])).toEqual([
      expect.objectContaining({
        title: 'Fix binding picker',
        path: 'Fix binding picker',
        searchValue: 'Fix binding picker ORCA-321 Bug'
      })
    ])
  })
})

function issue(
  id: string,
  title: string,
  parentId: string | null,
  siblingOrder: number,
  overrides: Partial<IssueSummary> = {}
): IssueSummary {
  return {
    id,
    hostPartitionKey: 'local',
    executionHostId: 'local',
    source: { kind: 'local', number: siblingOrder + 1 },
    localTitle: title,
    typeLabel: null,
    note: null,
    state: 'active',
    parentId,
    siblingOrder,
    recordRevision: 0,
    createdAt: 1,
    updatedAt: 1,
    archivedAt: null,
    ownUnresolvedCount: 0,
    descendantAttentionCount: 0,
    directConversationCount: 0,
    runningConversationCount: 0,
    ...overrides
  }
}
