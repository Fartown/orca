import { describe, expect, it } from 'vitest'
import { createTestStore } from '@/store/slices/store-test-helpers'
import { makeWorktree } from '@/store/slices/worktrees-slice-test-fixtures'
import type {
  LocalTaskLinks,
  LocalTaskWorkspaceLink
} from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
import { describeLocalTaskFailure } from '@/local-tasks/local-task-failure-copy'
import { listLocalTaskWorkspaceChoices } from './LocalTaskWorkspacePicker'
import { listLocalTaskChoicesForWorkspace } from './LocalTaskWorkspaceTaskPicker'

function project(id: string, orcaProjectId: string): LocalTaskProject {
  return {
    id,
    name: id,
    prefix: id.toUpperCase(),
    aliases: [],
    repos: [orcaProjectId],
    defaultRepoId: null,
    lastExecutionHostId: null,
    rules: { startMovesToInProgress: true, prMergedCompletes: true },
    statuses: [
      {
        id: `${id}-todo`,
        projectId: id,
        category: 'unstarted',
        name: 'Todo',
        color: 'gray',
        position: 0
      }
    ],
    createdAt: 0,
    updatedAt: 0,
    revision: 1
  }
}

function task(
  id: string,
  projectId: string,
  number: number,
  parentId: string | null = null
): LocalTask {
  return {
    id,
    projectId,
    number,
    ref: `${projectId.toUpperCase()}-${number}`,
    title: id,
    description: '',
    criteria: [],
    statusId: `${projectId}-todo`,
    priority: 0,
    labels: [],
    parentId,
    createdAt: 0,
    updatedAt: 0,
    revision: 1
  }
}

function workspace(taskId: string, worktreeId: string): LocalTaskWorkspaceLink {
  return {
    taskId,
    hostId: 'local',
    kind: 'git-worktree',
    instanceId: null,
    worktreeId,
    folderWorkspaceId: null,
    repoId: 'repo1',
    branchSnapshot: null,
    nameSnapshot: 'shop-9',
    hostLabelSnapshot: null,
    linkedVia: 'manual',
    linkedAt: 1
  }
}

describe('task picker for a workspace (REQ-011)', () => {
  // The same Orca project tracked by a paired server's library too; its ids carry that server.
  const remote = { ...project('runtime:env-1/srv', 'orca-shop') }
  const projects = [project('shop', 'orca-shop'), project('blog', 'orca-blog'), remote]
  const tasks = [
    task('t9', 'shop', 9),
    task('t12', 'shop', 12),
    task('t13', 'shop', 13, 't12'),
    task('b1', 'blog', 1),
    task('runtime:env-1/r1', remote.id, 1)
  ]
  const links: LocalTaskLinks = { workspaces: [workspace('t9', 'repo1::/shop-9')], sessions: [] }

  it('lists every task of the Orca serving the workspace, its repo’s projects first, greying ones with a workspace', () => {
    const choices = listLocalTaskChoicesForWorkspace(
      new Set(['orca-shop']),
      'ssh:minizc',
      projects,
      tasks,
      links
    )
    expect(
      choices.map((choice) => [choice.task.id, choice.linkedWorkspace, choice.related])
    ).toEqual([
      ['t13', null, true],
      ['t12', null, true],
      ['t9', 'shop-9', true],
      ['b1', null, false]
    ])
  })

  it('offers a paired server’s workspace only to that server’s tasks', () => {
    const choices = listLocalTaskChoicesForWorkspace(
      new Set(['orca-shop']),
      'runtime:env-1',
      projects,
      tasks,
      links
    )
    expect(choices.map((choice) => choice.task.id)).toEqual(['runtime:env-1/r1'])
  })
})

describe('workspace picker for a task (REQ-011)', () => {
  it('lists the host’s workspaces with the project’s first, showing one owned by another task as taken', () => {
    const store = createTestStore()
    store.setState({
      repos: [{ id: 'repo1', path: '/repo1', displayName: 'Shop', badgeColor: '#000', addedAt: 0 }],
      projectHostSetups: []
    })
    const free = makeWorktree({ id: 'repo1::/shop-12', repoId: 'repo1', projectId: 'orca-shop' })
    const taken = makeWorktree({ id: 'repo1::/shop-9', repoId: 'repo1', projectId: 'orca-shop' })
    const elsewhere = makeWorktree({ id: 'repo2::/blog', repoId: 'repo2', projectId: 'orca-blog' })
    const choices = listLocalTaskWorkspaceChoices(
      store.getState(),
      [free, taken, elsewhere],
      project('shop', 'orca-shop'),
      { workspaces: [workspace('t9', taken.id)], sessions: [] },
      [task('t9', 'shop', 9)],
      't12'
    )
    expect(choices.map((choice) => [choice.worktree.id, choice.ownerRef, choice.related])).toEqual([
      [free.id, null, true],
      [taken.id, 'SHOP-9', true],
      [elsewhere.id, null, false]
    ])
  })

  it('names the owning task when the library refuses a second link', () => {
    expect(
      describeLocalTaskFailure({ ok: false, code: 'workspace_already_linked', detail: 'SHOP-9' })
    ).toContain('SHOP-9')
  })
})
