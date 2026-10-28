import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LaunchAgentInNewTabArgs } from '@/lib/launch-agent-in-new-tab'
import { structuredAgentSessionPaneKey } from '../../../shared/structured-agent-session-projection'
import type { LocalTaskWorkspaceLink } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'

const fixture = vi.hoisted(() => ({
  launch: vi.fn(),
  plan: vi.fn(),
  recordSession: vi.fn()
}))

vi.mock('@/store', async () => {
  const { createTestStore } = await import('@/store/slices/store-test-helpers')
  return { useAppStore: createTestStore() }
})
vi.mock('@/lib/launch-agent-in-new-tab', () => ({ launchAgentInNewTab: fixture.launch }))
vi.mock('@/lib/agent-session-launch-plan', () => ({
  planAgentSessionLaunch: fixture.plan,
  adoptAgentSessionLaunchVerdict: (verdict: unknown) => verdict
}))
vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealWorkspace: () => ({}) }))
vi.mock('./local-tasks-runtime-client', () => ({
  localTasksClient: { recordSession: fixture.recordSession }
}))

import { useAppStore } from '@/store'
import { makeWorktree } from '@/store/slices/worktrees-slice-test-fixtures'
import { launchLocalTaskSession } from './local-task-session-launch'

const WORKTREE_ID = 'repo1::/repo1/shop-12'

const task: LocalTask = {
  id: 'task-13',
  projectId: 'p',
  number: 13,
  ref: 'SHOP-13',
  title: 'Export endpoint',
  description: '',
  criteria: ['CSV download works'],
  statusId: 'todo',
  priority: 0,
  labels: [],
  parentId: 'task-12',
  createdAt: 0,
  updatedAt: 0,
  revision: 1
}

const link: LocalTaskWorkspaceLink = {
  taskId: 'task-12',
  hostId: 'local',
  kind: 'git-worktree',
  instanceId: null,
  worktreeId: WORKTREE_ID,
  folderWorkspaceId: null,
  repoId: 'repo1',
  branchSnapshot: null,
  nameSnapshot: null,
  hostLabelSnapshot: null,
  linkedVia: 'start',
  linkedAt: 1
}

function launch(): boolean {
  return launchLocalTaskSession({
    task,
    link,
    agent: 'claude',
    promptDelivery: 'auto-submit'
  })
}

function recorded(): unknown[] {
  return fixture.recordSession.mock.calls.map(([input]) => input)
}

beforeEach(() => {
  useAppStore.setState({
    repos: [{ id: 'repo1', path: '/repo1', displayName: 'Shop', badgeColor: '#000', addedAt: 0 }],
    worktreesByRepo: { repo1: [makeWorktree({ id: WORKTREE_ID, repoId: 'repo1' })] }
  })
  fixture.plan.mockImplementation((_state: unknown, request: { requestId: string }) => ({
    route: 'structured-native-chat',
    requestId: request.requestId
  }))
  fixture.recordSession.mockResolvedValue({ ok: true, session: {} })
})

afterEach(() => {
  fixture.launch.mockReset()
  fixture.plan.mockReset()
  fixture.recordSession.mockReset()
})

describe('open session (REQ-010, A1)', () => {
  it('plans the route before launching and records a terminal by its tab', async () => {
    fixture.launch.mockReturnValue({ surface: { kind: 'local-terminal', tabId: 'tab-1' } })
    expect(launch()).toBe(true)
    const args: LaunchAgentInNewTabArgs = fixture.launch.mock.calls[0][0]
    expect(fixture.plan).toHaveBeenCalledOnce()
    // Why: a planned launch never waits on the host, so the terminal tab id is not swallowed.
    expect(args.agentSessionLaunchPlan?.requestId).toEqual(expect.any(String))
    expect(args.requestId).toBeUndefined()
    await vi.waitFor(() =>
      expect(recorded()).toEqual([
        expect.objectContaining({
          taskId: 'task-13',
          surface: 'terminal',
          tabId: 'tab-1',
          agent: 'claude'
        })
      ])
    )
  })

  it('opens and records its own terminal when the host declines the chat', async () => {
    fixture.launch.mockImplementation((args: LaunchAgentInNewTabArgs) => {
      if (args.agentSessionLaunchPlan?.route === 'terminal-tui') {
        return { surface: { kind: 'local-terminal', tabId: 'tab-declined' } }
      }
      const declined = args.onStructuredHostDeclined?.()
      expect(declined).toEqual(expect.objectContaining({ opened: true, tabId: 'tab-declined' }))
      return {
        surface: { kind: 'host-published' },
        structuredSettlement: Promise.resolve({ kind: 'terminal' })
      }
    })
    expect(launch()).toBe(true)
    await vi.waitFor(() =>
      expect(recorded()).toEqual([
        expect.objectContaining({ surface: 'terminal', tabId: 'tab-declined' })
      ])
    )
  })

  it('records a chat with its session id and derived pane key once it settles', async () => {
    fixture.launch.mockReturnValue({
      surface: { kind: 'local-chat', tabId: 'chat-tab' },
      structuredSettlement: Promise.resolve({ kind: 'structured', sessionId: 'session-abc' })
    })
    launch()
    await vi.waitFor(() =>
      expect(recorded()).toEqual([
        expect.objectContaining({
          surface: 'chat',
          tabId: 'chat-tab',
          sessionId: 'session-abc',
          paneKey: structuredAgentSessionPaneKey('chat-tab', 'session-abc')
        })
      ])
    )
  })

  it('records nothing when the chat launch is cancelled', async () => {
    fixture.launch.mockReturnValue({
      surface: { kind: 'local-chat', tabId: 'chat-tab' },
      structuredSettlement: Promise.resolve({ kind: 'cancelled', sessionId: null })
    })
    launch()
    await Promise.resolve()
    await Promise.resolve()
    expect(fixture.recordSession).not.toHaveBeenCalled()
  })
})
