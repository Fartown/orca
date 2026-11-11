import { describe, expect, it } from 'vitest'
import type {
  LocalTaskLinks,
  LocalTaskWorkspaceLink
} from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import { buildLocalTaskSourceRows, localTaskSourceBlockedReason } from './local-task-source-rows'

const project: LocalTaskProject = {
  id: 'shop',
  name: 'Shop',
  prefix: 'SHOP',
  aliases: ['STORE'],
  repos: ['orca-shop'],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: true },
  statuses: [
    {
      id: 'todo',
      projectId: 'shop',
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

function task(number: number, title: string): LocalTask {
  return {
    id: `t${number}`,
    projectId: 'shop',
    number,
    ref: `SHOP-${number}`,
    title,
    description: '',
    criteria: [],
    statusId: 'todo',
    priority: 0,
    labels: [],
    parentId: null,
    createdAt: 0,
    updatedAt: 0,
    revision: 1
  }
}

function link(taskId: string, worktreeId: string, name: string): LocalTaskWorkspaceLink {
  return {
    taskId,
    hostId: 'local',
    kind: 'git-worktree',
    instanceId: null,
    worktreeId,
    folderWorkspaceId: null,
    repoId: 'repo1',
    branchSnapshot: null,
    nameSnapshot: name,
    hostLabelSnapshot: null,
    linkedVia: 'manual',
    linkedAt: 1
  }
}

const tasks = [task(1, 'Refund flow'), task(12, 'Order export'), task(120, 'Export coupons')]
const links: LocalTaskLinks = {
  workspaces: [link('t1', 'repo1::/shop-1', 'shop-1'), link('t120', 'repo1::/here', 'here')],
  sessions: []
}
const scope = {
  hostId: 'local',
  orcaProjectIds: ['orca-shop'],
  workspace: { id: 'repo1::/here', hostId: 'local' }
}

function rows(query: string, blocked: string | null = null) {
  return buildLocalTaskSourceRows({ scope, projects: [project], tasks, links, query, blocked })
}

describe('Local tasks tab rows (REQ-011)', () => {
  it('finds tasks by title words and by ref, the exact ref first, even under an earlier prefix', () => {
    expect(rows('export').map((row) => row.task?.ref)).toEqual(['SHOP-120', 'SHOP-12'])
    expect(rows('store-12').map((row) => row.task?.ref)).toEqual(['SHOP-12', 'SHOP-120'])
  })

  it('greys a task another workspace has, but not the one this workspace has', () => {
    const byRef = new Map(rows('').map((row) => [row.task?.ref, row]))
    expect(byRef.get('SHOP-1')).toMatchObject({ disabled: true, note: 'Has shop-1' })
    expect(byRef.get('SHOP-120')).toMatchObject({ disabled: false, note: null })
    expect(byRef.get('SHOP-12')).toMatchObject({ disabled: false, note: null })
  })

  it('leads with why nothing can be linked while the library cannot take the write', () => {
    const blocked = localTaskSourceBlockedReason(
      { inContact: false, connection: 'live', hostState: 'ready' },
      'Studio'
    )
    expect(blocked).toBe(
      'Studio is not connected, so tasks can’t be linked now. The tasks below are as last read.'
    )
    const listed = rows('order', blocked)
    expect(listed[0]).toMatchObject({ task: null, disabled: true, note: blocked })
    expect(listed.slice(1).every((row) => row.disabled)).toBe(true)
    expect(
      localTaskSourceBlockedReason({ inContact: true, connection: 'live', hostState: 'ready' }, '')
    ).toBeNull()
  })
})
