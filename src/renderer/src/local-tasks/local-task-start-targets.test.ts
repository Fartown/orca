import { describe, expect, it } from 'vitest'
import { createTestStore } from '@/store/slices/store-test-helpers'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { ProjectHostSetup } from '../../../shared/project-types'
import type { Repo } from '../../../shared/repo-types'
import type { LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import {
  localTaskStartTargets,
  resolveLocalTaskStartTarget
} from './local-task-workspace-resolution'

function repo(id: string, hostId: ExecutionHostId, kind: 'git' | 'folder' = 'git'): Repo {
  return {
    id,
    path: `/${id}`,
    displayName: id,
    badgeColor: 'gray',
    addedAt: 1,
    kind,
    executionHostId: hostId,
    ...(hostId.startsWith('ssh:') ? { connectionId: hostId.slice(4) } : {})
  }
}

function setup(projectId: string, target: Repo): ProjectHostSetup {
  const hostId = target.executionHostId ?? 'local'
  return {
    id: `setup-${target.id}`,
    projectId,
    hostId,
    repoId: target.id,
    path: target.path,
    displayName: target.displayName,
    kind: target.kind ?? 'git',
    connectionId: target.connectionId ?? null,
    executionHostId: hostId,
    setupState: 'ready',
    setupMethod: 'legacy-repo',
    createdAt: 1,
    updatedAt: 1
  }
}

function taskProject(id: string, repos: string[], defaultRepoId: string | null): LocalTaskProject {
  return {
    id,
    name: id,
    prefix: 'SHOP',
    aliases: [],
    repos,
    defaultRepoId,
    lastExecutionHostId: null,
    rules: { startMovesToInProgress: true, prMergedCompletes: true },
    statuses: [],
    createdAt: 1,
    updatedAt: 1,
    revision: 1
  }
}

const api = repo('api', 'local')
const web = repo('web', 'ssh:minizc')
const docs = repo('docs', 'local', 'folder')
const blog = repo('blog', 'local')
const served = repo('served', 'runtime:env-1')

function state() {
  const store = createTestStore()
  store.setState({
    repos: [api, web, docs, blog, served],
    projects: [],
    projectHostSetups: [
      setup('orca-api', api),
      setup('orca-web', web),
      setup('orca-docs', docs),
      setup('orca-blog', blog),
      setup('orca-served', served)
    ]
  })
  return store.getState()
}

const orcaProjectsOf = (targets: { orcaProjectId: string }[]) =>
  targets.map((target) => target.orcaProjectId)

describe('Start targets of a task project (REQ-009, D-008)', () => {
  it('offers each linked repo on the library’s hosts, the default first', () => {
    const project = taskProject('shop', ['orca-api', 'orca-web', 'orca-served'], 'orca-web')
    const targets = localTaskStartTargets(state(), project)
    // Why no served: that repo lives on a paired server, whose own library keeps its tasks.
    expect(orcaProjectsOf(targets)).toEqual(['orca-web', 'orca-api'])
    expect(targets[0].target).toMatchObject({ projectId: 'orca-web', hostId: 'ssh:minizc' })
    expect(resolveLocalTaskStartTarget(state(), project, 'orca-api')?.repo.id).toBe('api')
    expect(resolveLocalTaskStartTarget(state(), project)?.repo.id).toBe('web')
  })

  it('offers every git repo on the library’s hosts when the project links none', () => {
    const project = taskProject('research', [], null)
    expect(orcaProjectsOf(localTaskStartTargets(state(), project))).toEqual([
      'orca-api',
      'orca-web',
      'orca-blog'
    ])
    const served = taskProject('runtime:env-1/research', [], null)
    expect(orcaProjectsOf(localTaskStartTargets(state(), served))).toEqual(['orca-served'])
  })
})
