// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { makeTerminalTab, makeWorktree } from '@/store/slices/worktrees-slice-test-fixtures'
import type { LocalTaskSessionLink } from '../../../../shared/local-tasks/local-task-link-types'
import { toWebTerminalSurfaceTabId } from '../../../../shared/terminal-surface-id'

const requestMount = vi.hoisted(() => vi.fn())
vi.mock('@/components/terminal/background-terminal-worktree-mount', () => ({
  requestBackgroundTerminalWorktreeMount: requestMount
}))
vi.mock('@/local-tasks/local-task-host-contact', () => ({
  useLocalTaskHostInContact: () => true
}))
vi.mock('@/components/activity/activity-terminal-portal-status', () => ({
  useActivityTerminalPortalStatus: () => 'loading'
}))
vi.mock('@/components/native-chat/NativeChatView', () => ({ default: () => null }))

import { useAppStore } from '@/store'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import { localTaskSessionPanelStore } from '@/local-tasks/local-task-session-panel-store'
import { LocalTaskSessionPanelSlot } from './LocalTaskSessionPanelSlot'

const WORKTREE = 'repo::/remote'
const TAB = toWebTerminalSurfaceTabId('host-tab')
const LEAF = '11111111-1111-4111-8111-111111111111'
const link: LocalTaskSessionLink = {
  id: 'runtime:env-1/session',
  taskId: 'runtime:env-1/task',
  hostId: 'runtime:env-1',
  worktreeId: WORKTREE,
  instanceId: null,
  surface: 'terminal',
  tabId: TAB,
  paneKey: null,
  sessionId: null,
  providerSession: null,
  agent: 'claude',
  linkedVia: 'manual',
  openedAt: 1
}
const worktree = makeWorktree({
  id: WORKTREE,
  repoId: 'repo',
  hostId: 'runtime:env-1',
  runtimeOwnerEnvironmentId: 'env-1'
})
const terminalTab = makeTerminalTab({ id: TAB, worktreeId: WORKTREE })
const layout = {
  terminalLayoutsByTabId: {
    [TAB]: {
      root: { type: 'leaf' as const, leafId: LEAF },
      activeLeafId: LEAF,
      expandedLeafId: null,
      ptyIdsByLeafId: { [LEAF]: 'remote:env-1@@term' }
    }
  }
}

beforeEach(() => {
  requestMount.mockClear()
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    activeView: 'tasks',
    worktreesByRepo: {},
    tabsByWorktree: {},
    terminalLayoutsByTabId: {}
  })
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState(), true)
  localTasksDomainStore.setState({ links: { workspaces: [], sessions: [link] } })
  localTaskSessionPanelStore.getState().close()
  localTaskSessionPanelStore.getState().open(link)
})
afterEach(() => {
  cleanup()
  localTaskSessionPanelStore.getState().close()
})

it.each(['catalog then tab then layout', 'layout then tab then catalog'])(
  'requests the targeted mount after %s and re-requests after readiness returns',
  (order) => {
    if (order === 'layout then tab then catalog') {
      useAppStore.setState(layout)
    }
    render(<LocalTaskSessionPanelSlot />)
    expect(requestMount).not.toHaveBeenCalled()

    const catalog = { worktreesByRepo: { repo: [worktree] } }
    const tab = { tabsByWorktree: { [WORKTREE]: [terminalTab] } }
    const [first, second] =
      order === 'catalog then tab then layout' ? [catalog, tab] : [tab, catalog]
    act(() => useAppStore.setState(first))
    expect(requestMount).not.toHaveBeenCalled()
    act(() => useAppStore.setState(second))
    expect(requestMount).toHaveBeenCalledWith({ worktreeId: WORKTREE, tabIds: [TAB] })

    if (order === 'catalog then tab then layout') {
      act(() => useAppStore.setState(layout))
    }
    expect(requestMount).toHaveBeenCalledWith({ worktreeId: WORKTREE, tabIds: [TAB] })

    requestMount.mockClear()
    act(() => useAppStore.setState({ worktreesByRepo: {} }))
    expect(requestMount).not.toHaveBeenCalled()
    act(() => useAppStore.setState(catalog))
    expect(requestMount).toHaveBeenCalledWith({ worktreeId: WORKTREE, tabIds: [TAB] })
  }
)
