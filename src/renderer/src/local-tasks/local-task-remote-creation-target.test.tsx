// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { useComposerTargetStore } from '@/hooks/composer-state/composer-target-store'
import { resolveWorkspaceCreationTarget } from '@/lib/project-host-workspace-target'
import {
  canResolveFolderSmartGitHubSubmit,
  getInitialAutoManagedWorkspaceName,
  getInitialGitHubPrStartPointSelection,
  getMatchingLinkedTaskSourceContext,
  isExplicitWorkspaceNameInput,
  resolveInitialWorkspaceRunSeed,
  resolveSmartGitHubCreateNames,
  retargetGitHubPrStartPointSelection,
  type ComposerDecisions
} from '@/hooks/composer-state/composer-decisions'
import { selectLocalTaskStartState } from './local-task-work-actions'
import { startLocalTaskWork } from './local-task-start-work'
import {
  isFolderLocalTaskProject,
  resolveLocalTaskStartTarget
} from './local-task-workspace-resolution'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import type { Project, ProjectHostSetup } from '../../../shared/project-types'

const decisions: ComposerDecisions = {
  canResolveFolderSmartGitHubSubmit,
  getInitialAutoManagedWorkspaceName,
  getInitialGitHubPrStartPointSelection,
  getMatchingLinkedTaskSourceContext,
  isExplicitWorkspaceNameInput,
  resolveInitialWorkspaceRunSeed,
  resolveSmartGitHubCreateNames,
  retargetGitHubPrStartPointSelection
}
const setup: ProjectHostSetup = {
  id: 'setup-1',
  projectId: 'repo:remote-1',
  hostId: 'ssh:ssh-1',
  repoId: 'remote-1',
  path: '/remote/project',
  displayName: 'Remote project',
  kind: 'git',
  connectionId: 'ssh-1',
  executionHostId: 'ssh:ssh-1',
  setupState: 'ready',
  setupMethod: 'legacy-repo',
  createdAt: 1,
  updatedAt: 1
}
const otherHostSetup: ProjectHostSetup = {
  ...setup,
  id: 'setup-other-host',
  hostId: 'local',
  connectionId: null,
  executionHostId: 'local'
}
const catalogProject: Project = {
  id: setup.projectId,
  displayName: setup.displayName,
  badgeColor: 'gray',
  sourceRepoIds: [setup.repoId],
  createdAt: 1,
  updatedAt: 1
}
const taskProject: LocalTaskProject = {
  id: 'task-project',
  repos: [setup.projectId],
  name: 'Remote project',
  prefix: 'REM',
  aliases: [],
  defaultRepoId: setup.projectId,
  lastExecutionHostId: setup.hostId,
  rules: { startMovesToInProgress: true, prMergedCompletes: true },
  statuses: [],
  createdAt: 1,
  updatedAt: 1,
  revision: 1
}
const task: LocalTask = {
  id: 'task-1',
  projectId: taskProject.id,
  number: 1,
  ref: 'REM-1',
  title: 'Task',
  description: '',
  criteria: [],
  statusId: 'status-1',
  priority: 0,
  labels: [],
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  revision: 1
}
const original = useAppStore.getState()

afterEach(() =>
  useAppStore.setState({
    repos: original.repos,
    projects: original.projects,
    projectHostSetups: original.projectHostSetups
  })
)

it('uses a ready SSH setup when the local repo catalog has not listed its repo', () => {
  const state = {
    ...useAppStore.getState(),
    repos: [],
    projects: [catalogProject],
    projectHostSetups: [setup]
  }
  const start = resolveLocalTaskStartTarget(state, taskProject)
  expect(start).toMatchObject({
    repo: {
      id: setup.repoId,
      path: setup.path,
      connectionId: setup.connectionId,
      executionHostId: setup.hostId
    },
    target: { projectId: setup.projectId, hostId: setup.hostId, projectHostSetupId: setup.id }
  })
  expect(selectLocalTaskStartState(state, taskProject, null).reason).not.toBeNull()
  expect(isFolderLocalTaskProject(state, taskProject)).toBe(false)
  expect(
    isFolderLocalTaskProject(
      { ...state, projectHostSetups: [{ ...setup, kind: 'folder' }] },
      taskProject
    )
  ).toBe(true)
})

it('says the linked repositories left Orca, apart from a project that never linked one', () => {
  const state = { ...useAppStore.getState(), repos: [], projects: [], projectHostSetups: [] }
  expect(selectLocalTaskStartState(state, taskProject, null).reason).toBe(
    'This project’s repositories were removed from Orca'
  )
  expect(
    selectLocalTaskStartState(state, { ...taskProject, repos: [], defaultRepoId: null }, null)
      .reason
  ).toBe('No Git repository in Orca for this project')
})

it('prefers the last execution host when one repo id exists on local and SSH hosts', () => {
  const localRepo = {
    id: setup.repoId,
    path: '/local/project',
    displayName: 'Local project',
    badgeColor: 'gray',
    addedAt: 1,
    executionHostId: 'local' as const
  }
  const state = {
    ...useAppStore.getState(),
    repos: [localRepo],
    projects: [catalogProject],
    projectHostSetups: [setup]
  }
  expect(resolveLocalTaskStartTarget(state, taskProject)).toMatchObject({
    repo: { path: setup.path, executionHostId: setup.hostId },
    target: { hostId: setup.hostId, projectHostSetupId: setup.id }
  })
})

it('adds only a host-matched task fallback repo to the composer without changing the catalog', () => {
  const state = useAppStore.getState()
  useAppStore.setState({
    repos: [],
    projects: [catalogProject],
    projectHostSetups: [setup, otherHostSetup]
  })
  const target = resolveLocalTaskStartTarget(useAppStore.getState(), taskProject)
  if (!target) {
    throw new Error('Expected the ready remote setup to resolve')
  }
  const options = {
    persistDraft: false,
    initialRepoId: target.repo.id,
    initialWorkspaceTarget: target.target,
    initialTaskRepo: target.repo
  }
  const injected = renderHook(() => useComposerTargetStore(options, decisions))
  expect(injected.result.current.eligibleRepos).toEqual([target.repo])
  expect(injected.result.current.repos).toEqual([target.repo])
  expect(injected.result.current.projectHostSetups).toEqual([setup])
  expect(
    resolveWorkspaceCreationTarget({
      eligibleRepos: injected.result.current.eligibleRepos,
      projects: [catalogProject],
      projectHostSetups: injected.result.current.projectHostSetups,
      projectId: setup.projectId,
      hostId: 'local',
      actionableHostIds: new Set(['local', setup.hostId])
    }).status
  ).toBe('unavailable')
  injected.unmount()
  const ordinary = renderHook(() => useComposerTargetStore({ persistDraft: false }, decisions))
  expect(ordinary.result.current.eligibleRepos).toEqual([])
  expect(ordinary.result.current.projectHostSetups).toEqual([setup, otherHostSetup])
  expect(ordinary.result.current.repos).toBe(useAppStore.getState().repos)
  expect(ordinary.result.current.projectHostSetups).toBe(useAppStore.getState().projectHostSetups)
  ordinary.unmount()
  const wrongHost = renderHook(() =>
    useComposerTargetStore(
      {
        ...options,
        initialWorkspaceTarget: { ...target.target, hostId: 'local' }
      },
      decisions
    )
  )
  expect(wrongHost.result.current.eligibleRepos).toEqual([])
  wrongHost.unmount()
  expect(state.repos).toEqual([])
  expect(useAppStore.getState().repos).toEqual([])
})

it('passes the ready setup repo and exact host target through the task Start modal input', () => {
  useAppStore.setState({ repos: [], projects: [catalogProject], projectHostSetups: [setup] })
  const openModal = vi.spyOn(useAppStore.getState(), 'openModal').mockImplementation(() => {})
  expect(startLocalTaskWork(task, taskProject)).toBe(true)
  expect(openModal).toHaveBeenCalledWith(
    'new-workspace-composer',
    expect.objectContaining({
      initialRepoId: setup.repoId,
      initialTaskRepo: expect.objectContaining({
        id: setup.repoId,
        path: setup.path,
        executionHostId: setup.hostId
      }),
      initialWorkspaceTarget: {
        projectId: setup.projectId,
        hostId: setup.hostId,
        projectHostSetupId: setup.id
      }
    })
  )
  openModal.mockRestore()
})
