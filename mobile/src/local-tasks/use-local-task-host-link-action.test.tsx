import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_TASKS_RUNTIME_CAPABILITY } from '../../../src/shared/local-tasks/local-tasks-capability'
import type { ActionSheetAction } from '../components/ActionSheetModal'
import type { ConnectionState } from '../transport/types'
import type { Worktree } from '../worktree/workspace-list-types'
import { useLocalTaskHostLinkAction } from './use-local-task-host-link-action'

vi.mock('lucide-react-native', () => ({ ClipboardList: 'ClipboardList' }))
vi.mock('./local-task-link-to-task-sheet', () => ({ LocalTaskLinkToTaskSheet: () => null }))

const row: Worktree = {
  workspaceKind: 'git',
  worktreeId: 'repo::/w/shop-12',
  repoId: 'repo',
  repo: 'shop',
  branch: 'zc/shop-12',
  displayName: 'shop-12',
  path: '/w/shop-12',
  liveTerminalCount: 0,
  hasAttachedPty: false,
  unread: false,
  isPinned: false,
  linkedPR: null
}

let renderer: ReactTestRenderer | null = null
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

function actionsFor(args: {
  connState: ConnectionState
  hostCapabilities: string[]
  target: Worktree
}): ActionSheetAction[] {
  let actions: ActionSheetAction[] = []
  function Probe() {
    const link = useLocalTaskHostLinkAction({
      client: null,
      connState: args.connState,
      hostCapabilities: args.hostCapabilities
    })
    actions = link.actionsFor(args.target, () => {})
    return null
  }
  act(() => {
    renderer = create(createElement(Probe))
  })
  return actions
}

describe('host screen long-press "Link to task…"', () => {
  it('is offered by a connected desktop that hosts tasks', () => {
    expect(
      actionsFor({
        connState: 'connected',
        hostCapabilities: [LOCAL_TASKS_RUNTIME_CAPABILITY],
        target: row
      })
    ).toHaveLength(1)
  })

  it('is absent on a desktop without local tasks, out of contact, or on a folder workspace', () => {
    expect(actionsFor({ connState: 'connected', hostCapabilities: [], target: row })).toEqual([])
    expect(
      actionsFor({
        connState: 'reconnecting',
        hostCapabilities: [LOCAL_TASKS_RUNTIME_CAPABILITY],
        target: row
      })
    ).toEqual([])
    expect(
      actionsFor({
        connState: 'connected',
        hostCapabilities: [LOCAL_TASKS_RUNTIME_CAPABILITY],
        target: { ...row, workspaceKind: 'folder-workspace', worktreeId: 'folder:f1' }
      })
    ).toEqual([])
  })
})
