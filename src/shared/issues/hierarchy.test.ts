import { describe, expect, it } from 'vitest'
import type { IssueRecord } from './types'
import { getCyclicIssueIds, projectIssueTree, validateIssueParentEdge } from './hierarchy'

function issue(id: string, parentId: string | null, siblingOrder = 0, host = 'local'): IssueRecord {
  return {
    id,
    hostPartitionKey: host === 'local' ? 'local' : `ssh:${host}`,
    executionHostId: host === 'local' ? 'local' : `ssh:${host}`,
    source: { kind: 'local', number: siblingOrder + 1 },
    localTitle: id,
    typeLabel: null,
    note: null,
    state: 'active',
    parentId,
    siblingOrder,
    recordRevision: 0,
    createdAt: 1,
    updatedAt: 1,
    archivedAt: null
  }
}

describe('Issue hierarchy projection', () => {
  it('projects valid rows in preorder and preserves sibling order', () => {
    const rows = projectIssueTree([
      issue('child-b', 'root', 1),
      issue('root', null),
      issue('grandchild', 'child-a'),
      issue('child-a', 'root', 0)
    ])

    expect(
      rows.map(({ issue: value, depth, childIssueIds }) => ({
        id: value.id,
        depth,
        childIssueIds
      }))
    ).toEqual([
      { id: 'root', depth: 0, childIssueIds: ['child-a', 'child-b'] },
      { id: 'child-a', depth: 1, childIssueIds: ['grandchild'] },
      { id: 'grandchild', depth: 2, childIssueIds: [] },
      { id: 'child-b', depth: 1, childIssueIds: [] }
    ])
  })

  it('breaks invalid, cross-host, cyclic, and over-depth edges into safe roots', () => {
    const issues = [
      issue('missing', 'absent'),
      issue('remote-child', 'local-parent', 0, 'remote'),
      issue('local-parent', null),
      issue('cycle-a', 'cycle-b'),
      issue('cycle-b', 'cycle-a'),
      issue('depth-root', null),
      issue('depth-child', 'depth-root'),
      issue('depth-grandchild', 'depth-child'),
      issue('depth-fourth', 'depth-grandchild')
    ]
    const rows = projectIssueTree(issues)
    const errors = Object.fromEntries(
      rows.map(({ issue: value, parentEdgeError }) => [value.id, parentEdgeError])
    )

    expect(validateIssueParentEdge(issues[1], issues[2])).toBe('cross-host')
    expect(getCyclicIssueIds(issues)).toEqual(new Set(['cycle-a', 'cycle-b']))
    expect(errors).toMatchObject({
      missing: 'missing-parent',
      'remote-child': 'cross-host',
      'cycle-a': 'cycle',
      'cycle-b': 'cycle',
      'depth-fourth': 'depth'
    })
    expect(rows).toHaveLength(issues.length)
    expect(rows.find(({ issue: value }) => value.id === 'depth-fourth')).toMatchObject({
      parentId: null,
      depth: 0
    })
  })
})
