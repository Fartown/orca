import { describe, expect, it } from 'vitest'
import {
  localTaskLinkParamsFor,
  readLocalTaskWorkspaceCandidates
} from './local-task-workspace-candidates'

describe('workspaces offered for linking to a task', () => {
  it('names the branch as the desktop does, so the link records `spare` and not `refs/heads/spare`', () => {
    const [candidate] = readLocalTaskWorkspaceCandidates([
      {
        worktreeId: 'repo1::/w/spare',
        repoId: 'repo1',
        displayName: '',
        branch: 'refs/heads/spare'
      }
    ])
    expect(candidate).toMatchObject({ displayName: 'spare', branch: 'spare' })
    expect(localTaskLinkParamsFor(candidate, 'Studio Mac')).toMatchObject({
      branchSnapshot: 'spare'
    })
  })
})
