// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import {
  localTaskSessionMountReady,
  planLocalTaskSessionPortal,
  resolveLocalTaskSessionPaneKey
} from './local-task-session-panel-portal'
import { toWebTerminalSurfaceTabId } from '../../../shared/terminal-surface-id'
import { makeTerminalTab, makeWorktree } from '@/store/slices/worktrees-slice-test-fixtures'

const LEAF = '11111111-1111-4111-8111-111111111111'
const WORKTREE = 'repo::/remote'
const MIRRORED_TAB = toWebTerminalSurfaceTabId('host-tab')
const OWNER = { hostId: 'runtime:env-1', worktreeId: WORKTREE }
const worktree = makeWorktree({
  id: WORKTREE,
  repoId: 'repo',
  hostId: 'runtime:env-1',
  runtimeOwnerEnvironmentId: 'env-1'
})
const terminalTab = makeTerminalTab({ id: MIRRORED_TAB, worktreeId: WORKTREE })

const candidate = {
  slotId: 'local-task-session',
  requestToken: 'one',
  target: document.createElement('div'),
  worktreeId: 'workspace',
  tabId: 'tab',
  paneKey: 'tab:leaf'
}

it('keeps an already portaled terminal in place on disconnect without requesting a mount', () => {
  const connected = planLocalTaskSessionPortal(candidate, true, null)
  expect(connected.requestMount).toBe(true)
  expect(connected.descriptor?.active).toBe(true)
  const disconnected = planLocalTaskSessionPortal(candidate, false, connected.descriptor)
  expect(disconnected).toMatchObject({
    requestMount: false,
    descriptor: { active: false, target: candidate.target }
  })
})

it('does not mount a disconnected session that was never shown', () => {
  expect(planLocalTaskSessionPortal(candidate, false, null)).toEqual({
    descriptor: null,
    requestMount: false
  })
  expect(
    planLocalTaskSessionPortal({ ...candidate, requestToken: 'two' }, false, {
      ...candidate,
      active: true
    })
  ).toEqual({ descriptor: null, requestMount: false })
})

it('uses the mirrored SSH terminal layout when a linked session has only a host tab id', () => {
  const tabId = toWebTerminalSurfaceTabId('host-tab')
  expect(
    resolveLocalTaskSessionPaneKey(
      { tabId, paneKey: null },
      {
        root: { type: 'leaf', leafId: LEAF },
        activeLeafId: LEAF,
        expandedLeafId: null,
        ptyIdsByLeafId: { [LEAF]: 'remote-pty' }
      }
    )
  ).toBe(`${tabId}:${LEAF}`)
  expect(resolveLocalTaskSessionPaneKey({ tabId, paneKey: null }, undefined)).toBeNull()
})

it('waits for both the owning workspace row and mirrored terminal tab before mounting', () => {
  const base = { repos: [], projectGroups: [], folderWorkspaces: [] }
  const beforeCatalog = {
    ...base,
    worktreesByRepo: {},
    tabsByWorktree: { [WORKTREE]: [terminalTab] }
  }
  const beforeTab = {
    ...base,
    worktreesByRepo: { repo: [worktree] },
    tabsByWorktree: {}
  }
  const ready = {
    ...base,
    worktreesByRepo: { repo: [worktree] },
    tabsByWorktree: { [WORKTREE]: [terminalTab] }
  }

  expect(localTaskSessionMountReady(beforeCatalog, OWNER, MIRRORED_TAB)).toBe(false)
  expect(localTaskSessionMountReady(beforeTab, OWNER, MIRRORED_TAB)).toBe(false)
  expect(localTaskSessionMountReady(ready, OWNER, MIRRORED_TAB)).toBe(true)
  expect(
    localTaskSessionMountReady(ready, { ...OWNER, hostId: 'runtime:other' }, MIRRORED_TAB)
  ).toBe(false)
  expect(localTaskSessionMountReady(ready, OWNER, 'web-terminal-other')).toBe(false)
})
