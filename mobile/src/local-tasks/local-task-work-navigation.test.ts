import { describe, expect, it } from 'vitest'
import type {
  LocalTaskSessionLink,
  LocalTaskWorkspaceLink
} from '../../../src/shared/local-tasks/local-task-link-types'
import { makePaneKey } from '../../../src/shared/stable-pane-id'
import { localTaskEndpointFor, SELF_LOCAL_TASK_ENDPOINT } from './local-task-endpoint'
import { localTaskSessionHref } from './local-task-work-navigation'

const PANE_KEY = makePaneKey('tab-1', '11111111-1111-4111-8111-111111111111')

function route(href: string | null) {
  expect(href).not.toBeNull()
  const url = new URL(href ?? '', 'https://orca.test')
  return {
    pathname: url.pathname,
    name: url.searchParams.get('name'),
    paneKey: url.searchParams.get('paneKey'),
    executionHost: url.searchParams.get('executionHost')
  }
}

function workspace(extra: Partial<LocalTaskWorkspaceLink> = {}): LocalTaskWorkspaceLink {
  return {
    taskId: 'p2',
    hostId: 'local',
    kind: 'git-worktree',
    instanceId: null,
    worktreeId: 'repo::/new-parent',
    folderWorkspaceId: null,
    repoId: 'repo',
    branchSnapshot: null,
    nameSnapshot: null,
    hostLabelSnapshot: null,
    linkedVia: 'start',
    linkedAt: 1,
    ...extra
  }
}

function session(extra: Partial<LocalTaskSessionLink> = {}): LocalTaskSessionLink {
  return {
    id: 's1',
    taskId: 'c1',
    hostId: 'local',
    worktreeId: 'repo::/old-parent',
    instanceId: null,
    surface: 'terminal',
    tabId: 'tab-1',
    paneKey: PANE_KEY,
    sessionId: null,
    providerSession: null,
    agent: 'claude',
    linkedVia: 'start',
    openedAt: 1,
    ...extra
  }
}

describe('localTaskSessionHref', () => {
  it('routes a reparented session to the workspace it actually ran in, not the new parent', () => {
    const href = localTaskSessionHref({
      hostId: 'paired-desktop',
      endpoint: SELF_LOCAL_TASK_ENDPOINT,
      session: session(),
      workspace: workspace()
    })
    expect(route(href)).toEqual({
      pathname: `/h/paired-desktop/session/${encodeURIComponent('repo::/old-parent')}`,
      name: null,
      paneKey: PANE_KEY,
      executionHost: null
    })
  })

  it('uses the richer workspace link when the session is in that workspace', () => {
    const href = localTaskSessionHref({
      hostId: 'paired-desktop',
      endpoint: SELF_LOCAL_TASK_ENDPOINT,
      session: session({ worktreeId: 'repo::/new-parent' }),
      workspace: workspace({ nameSnapshot: 'New parent' })
    })
    expect(route(href)).toEqual({
      pathname: `/h/paired-desktop/session/${encodeURIComponent('repo::/new-parent')}`,
      name: 'New parent',
      paneKey: PANE_KEY,
      executionHost: null
    })
  })

  it('keeps the session host when it differs from the parent workspace host', () => {
    const href = localTaskSessionHref({
      hostId: 'paired-desktop',
      endpoint: SELF_LOCAL_TASK_ENDPOINT,
      session: session({ hostId: 'ssh:box', worktreeId: 'repo::/old-parent' }),
      workspace: workspace({ worktreeId: 'repo::/old-parent', hostId: 'local' })
    })
    expect(route(href)).toEqual({
      pathname: `/h/paired-desktop/session/${encodeURIComponent('repo::/old-parent')}`,
      name: null,
      paneKey: PANE_KEY,
      executionHost: null
    })
  })

  it('routes a reparented folder session through its own folder workspace', () => {
    const href = localTaskSessionHref({
      hostId: 'paired-desktop',
      endpoint: SELF_LOCAL_TASK_ENDPOINT,
      session: session({ worktreeId: 'folder:old-folder' }),
      workspace: workspace({ kind: 'folder', folderWorkspaceId: 'new-folder', worktreeId: null })
    })
    expect(route(href)).toEqual({
      pathname: '/h/paired-desktop/session/folder%3Aold-folder',
      name: null,
      paneKey: PANE_KEY,
      executionHost: null
    })
  })

  it("opens a server library's session on that server, by the pane the server lists", () => {
    const href = localTaskSessionHref({
      hostId: 'paired-desktop',
      endpoint: localTaskEndpointFor('runtime:vm'),
      session: session({ worktreeId: 'repo::/new-parent' }),
      workspace: workspace()
    })
    expect(route(href)).toEqual({
      pathname: `/h/paired-desktop/session/${encodeURIComponent('repo::/new-parent')}`,
      name: null,
      paneKey: PANE_KEY,
      executionHost: 'runtime:vm'
    })
  })

  it('opens nothing for a row the library cannot own', () => {
    const href = localTaskSessionHref({
      hostId: 'paired-desktop',
      endpoint: SELF_LOCAL_TASK_ENDPOINT,
      session: session({ hostId: 'runtime:vm' }),
      workspace: null
    })
    expect(href).toBeNull()
  })
})
