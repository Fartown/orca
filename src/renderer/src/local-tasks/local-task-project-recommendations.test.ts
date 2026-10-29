import { describe, expect, it } from 'vitest'
import type { LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import type { Project } from '../../../shared/project-types'
import {
  localTaskEndpointForOrcaProject,
  recommendLocalTaskProjects,
  suggestLocalTaskPrefix,
  takenLocalTaskPrefixes
} from './local-task-project-recommendations'

function orcaProject(id: string, displayName: string): Project {
  return {
    id,
    displayName,
    badgeColor: 'blue',
    sourceRepoIds: [],
    createdAt: 0,
    updatedAt: 0
  }
}

function taskProject(orcaProjectId: string, prefix: string, aliases: string[]): LocalTaskProject {
  return {
    id: `task-${orcaProjectId}`,
    name: prefix,
    prefix,
    aliases,
    repos: [orcaProjectId],
    defaultRepoId: null,
    lastExecutionHostId: null,
    rules: { startMovesToInProgress: true, prMergedCompletes: true },
    statuses: [],
    createdAt: 0,
    updatedAt: 0,
    revision: 0
  }
}

describe('task project recommendations (REQ-001, REQ-002)', () => {
  it('suggests a prefix from the project name', () => {
    expect(suggestLocalTaskPrefix('shop', new Set())).toBe('SHOP')
    expect(suggestLocalTaskPrefix('refund-webhook', new Set())).toBe('RW')
    expect(suggestLocalTaskPrefix('商城', new Set())).toBe('TASK')
    expect(suggestLocalTaskPrefix('2048-game', new Set())).toBe('TASK')
  })

  it('never suggests a prefix another project holds, current or earlier', () => {
    const existing = [taskProject('orca-1', 'MALL', ['SHOP'])]
    expect(takenLocalTaskPrefixes(existing)).toEqual(new Set(['MALL', 'SHOP']))
    expect(suggestLocalTaskPrefix('shop', takenLocalTaskPrefixes(existing))).toBe('SHOP2')
  })

  it('skips Orca projects that already have a task project and keeps suggestions distinct', () => {
    const recommendations = recommendLocalTaskProjects(
      [orcaProject('orca-1', 'shop'), orcaProject('orca-2', 'shop'), orcaProject('orca-3', 'Shop')],
      [taskProject('orca-1', 'SHOP', [])]
    )
    expect(recommendations.map(({ project, prefix }) => [project.id, prefix])).toEqual([
      ['orca-2', 'SHOP2'],
      ['orca-3', 'SHOP3']
    ])
  })

  it('keeps a new task project in the library of the Orca that serves its project', () => {
    const all = () => true
    // This app serves its local and SSH hosts, so its own library comes first.
    expect(localTaskEndpointForOrcaProject(['runtime:env-1', 'ssh:minizc'], all)).toBe('local')
    expect(localTaskEndpointForOrcaProject(['runtime:env-1'], all)).toBe('runtime:env-1')
    expect(
      localTaskEndpointForOrcaProject(['runtime:env-1'], (endpoint) => endpoint === 'local')
    ).toBeNull()
  })
})
