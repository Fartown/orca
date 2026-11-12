import { describe, expect, it, vi } from 'vitest'
import { sendNotesToActiveAgentSession } from '@/lib/active-agent-note-send'
import {
  createNoteSendAppState,
  LEAF_ID,
  OTHER_LEAF_ID,
  type NoteSendAppState
} from '@/lib/active-agent-note-send-test-harness'
import { findTerminalAtRecordedPane } from './local-task-background-terminal-match'

const testState = vi.hoisted(() => {
  const held: { appState: NoteSendAppState | null } = { appState: null }
  const appState = (): NoteSendAppState => {
    if (!held.appState) {
      throw new Error('no app state yet')
    }
    return held.appState
  }
  return { held, appState, callRuntimeRpc: vi.fn() }
})

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: NoteSendAppState) => unknown) => selector(testState.appState()),
    { getState: () => testState.appState() }
  )
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: testState.callRuntimeRpc }))

function listed(handle: string, extra: Record<string, unknown>) {
  return {
    handle,
    ptyId: handle,
    worktreeId: 'wt-1',
    worktreePath: '/repo',
    branch: 'main',
    tabId: `pty:${handle}`,
    leafId: `pty:${handle}`,
    title: 'Claude',
    connected: true,
    writable: true,
    lastOutputAt: 1,
    preview: '',
    ...extra
  }
}

// A session a dispatch launched in the background: its pane has not mounted yet.
const background = listed('pty-bg', { orphaned: true, recordedPaneKey: `tab-9:${OTHER_LEAF_ID}` })

describe('a terminal whose pane has not mounted yet (#102)', () => {
  it('is found by the pane it was recorded for, never by a guess', () => {
    const pane = { tabId: 'tab-9', leafId: OTHER_LEAF_ID }
    expect(findTerminalAtRecordedPane([background], pane)).toBe(background)
    expect(findTerminalAtRecordedPane([background], { tabId: 'tab-9', leafId: LEAF_ID })).toBeNull()
    const live = listed('pty-live', { recordedPaneKey: `tab-9:${OTHER_LEAF_ID}` })
    expect(findTerminalAtRecordedPane([live], pane)).toBeNull()
    const stale = listed('pty-old', { orphaned: true, recordedPaneKey: `tab-9:${OTHER_LEAF_ID}` })
    expect(findTerminalAtRecordedPane([background, stale], pane)).toBeNull()
  })

  it('takes a line sent to that pane, through the shared send by handle', async () => {
    testState.held.appState = createNoteSendAppState()
    const sentTo: unknown[] = []
    testState.callRuntimeRpc.mockReset().mockImplementation(async (_target, method, params) => {
      if (method === 'terminal.list') {
        return { terminals: [background], totalCount: 1, truncated: false }
      }
      if (method === 'terminal.agentStatus') {
        return { agentStatus: { handle: 'pty-bg', isRunningAgent: true, status: 'done' } }
      }
      if (method === 'terminal.send') {
        sentTo.push(params.terminal)
        return { send: { handle: 'pty-bg', accepted: true, bytesWritten: 1 } }
      }
      throw new Error(`unexpected method ${method}`)
    })
    await expect(
      sendNotesToActiveAgentSession({
        worktreeId: 'wt-1',
        prompt: 'Also cover the cold start',
        noteTarget: { tabId: 'tab-9', leafId: OTHER_LEAF_ID }
      })
    ).resolves.toEqual({ status: 'sent' })
    expect(sentTo).toEqual(['pty-bg', 'pty-bg'])
  })
})
