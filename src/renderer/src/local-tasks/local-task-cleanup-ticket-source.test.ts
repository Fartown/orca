// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import type { LocalTaskWorkspaceLink } from '../../../shared/local-tasks/local-task-link-types'
import { LOCAL_TASK_SOURCE_HIDDEN_PREFERENCE_KEY } from '../../../shared/local-tasks/local-task-source-visibility'
import { createDefaultWorkspaceCleanupFilterState } from '../../../shared/workspace-cleanup-filter-model'
import { WORKSPACE_CLEANUP_TICKET_SOURCE_VALUES } from '../../../shared/workspace-cleanup-facet-rankings'
import {
  FACET_NOW,
  makeFacets
} from '@/components/workspace-cleanup/workspace-cleanup-facet.test.fixture'
import { matchesWorkspaceCleanupFilters } from '@/components/workspace-cleanup/workspace-cleanup-query'
import { useLocalTaskCleanupTicketSourceValues } from './local-task-cleanup-ticket-source'
import { localTasksDomainStore } from './local-tasks-domain-store'

const project: LocalTaskProject = {
  id: 'shop',
  name: 'Shop',
  prefix: 'SHOP',
  aliases: [],
  repos: [],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: true },
  statuses: [],
  createdAt: 0,
  updatedAt: 0,
  revision: 0
}

const link: LocalTaskWorkspaceLink = {
  taskId: 'task-12',
  hostId: 'local',
  kind: 'git-worktree',
  instanceId: null,
  worktreeId: 'repo-1::/repo/alpha',
  folderWorkspaceId: null,
  repoId: 'repo-1',
  branchSnapshot: null,
  nameSnapshot: null,
  hostLabelSnapshot: null,
  linkedVia: 'manual',
  linkedAt: 0
}

function linkWorkspace(): void {
  localTasksDomainStore
    .getState()
    .writer('local')
    .applyLinks({ workspaces: [link], sessions: [] })
}

beforeEach(() => {
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  localTasksDomainStore.getState().openEndpoint('local')
  localTasksDomainStore.getState().writer('local').applyProjects([project])
})

describe('workspace cleanup and local tasks', () => {
  it('counts a task link as a ticket, so the workspace is not "completely empty"', () => {
    expect(makeFacets().isCompletelyEmpty).toBe(true)
    linkWorkspace()
    const facets = makeFacets()
    expect(facets.ticketSources).toEqual(['local-task'])
    expect(facets.isCompletelyEmpty).toBe(false)

    const onlyLocal = createDefaultWorkspaceCleanupFilterState()
    onlyLocal.safety.dismissed = 'any'
    onlyLocal.ticket.sources = ['local-task']
    expect(matchesWorkspaceCleanupFilters(facets, onlyLocal, FACET_NOW)).toBe(true)
    onlyLocal.ticket.sources = ['linear']
    expect(matchesWorkspaceCleanupFilters(facets, onlyLocal, FACET_NOW)).toBe(false)
  })

  it('offers the Local filter only while Local is shown, unless a saved filter still uses it', () => {
    const offered = (selected: ('local-task' | 'linear')[]) =>
      renderHook(() =>
        useLocalTaskCleanupTicketSourceValues(WORKSPACE_CLEANUP_TICKET_SOURCE_VALUES, selected)
      ).result.current
    expect(offered([])).toContain('local-task')

    localTasksDomainStore
      .getState()
      .writer('local')
      .applyPreferences({ [LOCAL_TASK_SOURCE_HIDDEN_PREFERENCE_KEY]: '1' })
    expect(offered([])).not.toContain('local-task')
    expect(offered(['local-task'])).toContain('local-task')
  })
})
