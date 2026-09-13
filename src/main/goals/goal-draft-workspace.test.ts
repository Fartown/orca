import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { resolveGoalDraftWorkspace, type GoalDraftWorkspacePorts } from './goal-draft-workspace'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'goal-workspace-'))
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})
function ports(): GoalDraftWorkspacePorts {
  return {
    getFolderWorkspaces: () => [
      {
        id: 'folder-1',
        folderPath: directory,
        projectGroupId: 'group-1',
        connectionId: null
      } as never
    ],
    getRepos: () => [],
    getProjectGroups: () => [],
    showWorktree: vi.fn(async () => ({ path: directory, hostId: 'local' }))
  }
}
it('drafts in an ordinary folder without a Git checkout or an execution session', async () => {
  const source = ports()
  expect(await resolveGoalDraftWorkspace('folder:folder-1', source)).toBe(directory)
  expect(source.showWorktree).not.toHaveBeenCalled()
})
it('uses the host worktree resolver and refuses SSH work instead of executing it locally', async () => {
  const source = ports()
  expect(await resolveGoalDraftWorkspace('wt-1', source)).toBe(directory)
  expect(source.showWorktree).toHaveBeenCalledWith('wt-1')
  source.showWorktree = async () => ({ path: directory, hostId: 'ssh:remote' })
  await expect(resolveGoalDraftWorkspace('wt-1', source)).rejects.toThrow('local execution host')
  source.getFolderWorkspaces = () => [
    { ...ports().getFolderWorkspaces()[0], connectionId: 'remote' }
  ]
  await expect(resolveGoalDraftWorkspace('folder:folder-1', source)).rejects.toThrow(
    'local execution host'
  )
})
it('reports missing workspaces without touching a provider session', async () => {
  await expect(resolveGoalDraftWorkspace('folder:missing', ports())).rejects.toThrow(
    'no longer exists'
  )
})
