import { describe, expect, it } from 'vitest'
import { createTestStore } from '@/store/slices/store-test-helpers'
import { makeWorktree } from '@/store/slices/worktrees-slice-test-fixtures'
import type { Worktree } from '../../../shared/worktree/types'
import type { LocalTaskLinks } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import type { LocalTaskDispatchCandidate } from './local-task-dispatch-candidates'
import {
  localTaskCreateChoiceBlocked,
  localTaskCreateChoiceFitsProject,
  localTaskCreateWorkspaceChoices
} from './local-task-create-workspace-choices'

function project(id: string, orcaProjectId: string): LocalTaskProject {
  return {
    id,
    name: id,
    prefix: id.toUpperCase(),
    aliases: [],
    repos: [orcaProjectId],
    defaultRepoId: orcaProjectId,
    lastExecutionHostId: null,
    rules: { startMovesToInProgress: true, prMergedCompletes: false },
    statuses: [],
    createdAt: 0,
    updatedAt: 0,
    revision: 1
  }
}

function task(id: string, projectId: string, number: number): LocalTask {
  return {
    id,
    projectId,
    number,
    ref: `${projectId.toUpperCase()}-${number}`,
    title: id,
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

function workspace(
  worktree: Worktree,
  hostId: string,
  available = true
): Extract<LocalTaskDispatchCandidate, { kind: 'workspace' }> {
  return {
    kind: 'workspace',
    id: `workspace:${hostId}:${worktree.id}`,
    label: worktree.displayName,
    detail: hostId === 'local' ? 'This Mac' : hostId.slice(hostId.indexOf(':') + 1),
    hostId,
    available,
    worktree
  }
}

const orc = project('orc', 'orca-orca')
const shop = project('shop', 'orca-shop')
const reconnect = makeWorktree({
  id: 'orca::/feat-reconnect',
  repoId: 'orca',
  projectId: 'orca-orca',
  displayName: 'feat-reconnect'
})
const docs = makeWorktree({
  id: 'orca::/docs-typo',
  repoId: 'orca',
  projectId: 'orca-orca',
  displayName: 'docs-typo'
})
const refund = makeWorktree({
  id: 'shop::/refund-webhook',
  repoId: 'shop',
  projectId: 'orca-shop',
  displayName: 'refund-webhook'
})
const deploy = makeWorktree({
  id: 'infra::/deploy-scripts',
  repoId: 'infra',
  projectId: 'orca-infra',
  displayName: 'deploy-scripts'
})
const owner = task('orc-41', 'orc', 41)
const links: LocalTaskLinks = {
  workspaces: [
    {
      taskId: owner.id,
      hostId: 'local',
      kind: 'git-worktree',
      instanceId: null,
      worktreeId: reconnect.id,
      folderWorkspaceId: null,
      repoId: 'orca',
      branchSnapshot: null,
      nameSnapshot: null,
      hostLabelSnapshot: null,
      linkedVia: 'start',
      linkedAt: 1
    }
  ],
  sessions: []
}

describe('New task 已有工作区 choices (REQ-027)', () => {
  const store = createTestStore()
  store.setState({
    repos: [
      { id: 'orca', path: '/orca', displayName: 'orca', badgeColor: '#000', addedAt: 0 },
      { id: 'shop', path: '/shop', displayName: 'shop', badgeColor: '#000', addedAt: 0 }
    ],
    projectHostSetups: []
  })

  it('places each workspace in a project that can hold it, a taken one as its owner’s subtask', () => {
    const choices = localTaskCreateWorkspaceChoices(
      store.getState(),
      [
        workspace(deploy, 'ssh:dbox', false),
        workspace(reconnect, 'local'),
        workspace(docs, 'local'),
        workspace(refund, 'local')
      ],
      {
        tasks: [owner],
        links,
        writableProjects: [orc, shop],
        projectId: 'shop',
        sourceWorktreeId: null
      }
    )
    expect(
      choices.map((choice) => [
        choice.candidate.label,
        choice.repoLabel,
        choice.owner?.ref ?? null,
        choice.projectId,
        localTaskCreateChoiceBlocked(choice)
      ])
    ).toEqual([
      ['feat-reconnect', 'orca', 'ORC-41', 'orc', null],
      // The current project tracks another repo, so the one tracking orca takes the task.
      ['docs-typo', 'orca', null, 'orc', null],
      ['refund-webhook', 'shop', null, 'shop', null],
      // Out of contact: listed last and blocked until contact returns.
      ['deploy-scripts', null, null, 'shop', 'dbox is not connected']
    ])
    const [taken, free] = choices
    expect(taken.ownerLink?.taskId).toBe(owner.id)
    expect(localTaskCreateChoiceFitsProject(taken, 'shop')).toBe(false)
    expect(localTaskCreateChoiceFitsProject(free, 'shop')).toBe(true)
  })

  it('takes a paired server’s workspace only into that server’s projects', () => {
    const remote = project('runtime:env-1/srv', 'orca-orca')
    const onServer = workspace(docs, 'runtime:env-1')
    const args = { tasks: [], links: { workspaces: [], sessions: [] }, projectId: 'orc' }
    const [unplaceable] = localTaskCreateWorkspaceChoices(store.getState(), [onServer], {
      ...args,
      writableProjects: [orc],
      sourceWorktreeId: null
    })
    expect(localTaskCreateChoiceBlocked(unplaceable)).toBe('No project here can take a new task')
    const [placed] = localTaskCreateWorkspaceChoices(store.getState(), [onServer], {
      ...args,
      writableProjects: [orc, remote],
      sourceWorktreeId: null
    })
    expect(placed.projectId).toBe(remote.id)
    expect(localTaskCreateChoiceFitsProject(placed, 'orc')).toBe(false)
  })

  it('blocks a taken workspace whose owner’s project takes no writes now', () => {
    const [taken] = localTaskCreateWorkspaceChoices(
      store.getState(),
      [workspace(reconnect, 'local')],
      { tasks: [owner], links, writableProjects: [shop], projectId: 'shop', sourceWorktreeId: null }
    )
    expect(taken.owner?.id).toBe(owner.id)
    expect(localTaskCreateChoiceBlocked(taken)).toBe('No project here can take a new task')
  })

  it('lists the session’s own workspace first when a task is made from it', () => {
    const choices = localTaskCreateWorkspaceChoices(
      store.getState(),
      [workspace(docs, 'local'), workspace(refund, 'local')],
      {
        tasks: [],
        links: { workspaces: [], sessions: [] },
        writableProjects: [orc, shop],
        projectId: 'orc',
        sourceWorktreeId: refund.id
      }
    )
    expect(choices.map((choice) => choice.candidate.label)).toEqual(['refund-webhook', 'docs-typo'])
  })
})
