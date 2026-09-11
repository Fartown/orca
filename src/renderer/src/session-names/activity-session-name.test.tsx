// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '../store'
import { useAgentPaneThreads } from '../components/activity/use-agent-pane-threads'
import { buildActivityEvents } from '../components/activity/activity-event-builder'
import {
  makeRepo,
  makeTab,
  makeWorktree,
  PANE_KEY,
  LEAF_ID
} from '../components/activity/ActivityPrototypePage-test-fixtures'
import { sessionNameStore } from './session-name-store'
import { createAgentStatusEventApplicator } from '../hooks/ipc-events/agent-status-event-applicator'
import type {
  AiVaultSessionTitlesArgs,
  AiVaultSessionTitlesResult
} from '../../../shared/ai-vault-session-title'

const initial = useAppStore.getInitialState()
let nativeName = 'Provider 原生名'
const request = { executionHostId: 'local' as const, agent: 'codex' as const, sessionId: 'A' }
const resolve = vi.fn(
  async (args: AiVaultSessionTitlesArgs): Promise<AiVaultSessionTitlesResult> => ({
    titles: args.requests.map((item) => ({
      ...item,
      title: '继续',
      generatedTitle: '最初的有效任务',
      providerName: {
        kind: 'named' as const,
        title: nativeName,
        field: 'session_index.thread_name'
      }
    }))
  })
)

beforeEach(() => {
  useAppStore.setState(initial, true)
  sessionNameStore.reset()
  nativeName = 'Provider 原生名'
  resolve.mockClear()
  Object.assign(window, { api: { ...window.api, aiVault: { resolveSessionTitles: resolve } } })
  useAppStore.setState({
    repos: [makeRepo()],
    worktreesByRepo: { 'repo-1': [makeWorktree()] },
    tabsByWorktree: {
      'wt-1': [{ ...makeTab(), title: '正在处理实时内容', generatedTitle: '旧容器名' }]
    },
    terminalLayoutsByTabId: {
      'tab-1': {
        root: { type: 'leaf', leafId: LEAF_ID },
        activeLeafId: LEAF_ID,
        expandedLeafId: null,
        ptyIdsByLeafId: { [LEAF_ID]: 'pty-1' }
      }
    },
    agentStatusByPaneKey: {
      [PANE_KEY]: {
        paneKey: PANE_KEY,
        worktreeId: 'wt-1',
        tabId: 'tab-1',
        agentType: 'codex',
        providerSession: { key: 'session_id', id: 'A' },
        connectionId: null,
        state: 'working',
        prompt: '继续',
        stateHistory: [],
        updatedAt: Date.now(),
        stateStartedAt: Date.now(),
        toolName: 'Bash',
        toolInput: 'pnpm test'
      }
    }
  })
})
afterEach(() => {
  cleanup()
  sessionNameStore.reset()
  useAppStore.setState(initial, true)
})

function mountThreads() {
  return renderHook(() =>
    useAgentPaneThreads({ query: '', readFilter: 'all', groupBy: 'status', selectedPaneKey: null })
  )
}

it('the mounted Activity pipeline reads its own Provider name without a winning tab slot', async () => {
  const { result } = mountThreads()
  await waitFor(() => expect(result.current.allThreads[0]?.paneTitle).toBe(nativeName))
  expect(resolve).toHaveBeenCalledWith(
    expect.objectContaining({
      executionHostScope: 'local',
      requests: [{ agent: 'codex', sessionId: 'A' }]
    })
  )
  expect(result.current.allThreads[0]?.responsePreview).toContain('pnpm test')
})

it('a name-only public refresh changes the mounted row with no status, tab or freshness write', async () => {
  await sessionNameStore.read([request], true)
  const { result } = mountThreads()
  const status = useAppStore.getState().agentStatusByPaneKey
  const tabs = useAppStore.getState().tabsByWorktree
  nativeName = 'Provider 已改名'
  await act(async () => {
    await sessionNameStore.read([request], true)
  })
  await waitFor(() => expect(result.current.allThreads[0]?.paneTitle).toBe(nativeName))
  expect(useAppStore.getState().agentStatusByPaneKey).toBe(status)
  expect(useAppStore.getState().tabsByWorktree).toBe(tabs)
})

it('a substantive follow-up does not replace the Provider first-prompt fallback', async () => {
  resolve.mockImplementationOnce(async (args) => ({
    titles: args.requests.map((item) => ({
      ...item,
      title: '最初的有效任务',
      generatedTitle: '最初的有效任务',
      providerName: { kind: 'absent' as const }
    }))
  }))
  useAppStore.setState((s) => ({
    agentStatusByPaneKey: {
      [PANE_KEY]: { ...s.agentStatusByPaneKey[PANE_KEY], prompt: '后续检查新的错误原因' }
    }
  }))
  const { result } = mountThreads()
  await waitFor(() => expect(result.current.allThreads[0]?.paneTitle).toBe('最初的有效任务'))
})

it('unknown legacy history never inherits the replacement session identity', () => {
  const entry = useAppStore.getState().agentStatusByPaneKey[PANE_KEY]
  const result = buildActivityEvents({
    agentStatusByPaneKey: {
      [PANE_KEY]: {
        ...entry,
        stateHistory: [{ state: 'done', prompt: '旧会话任务', startedAt: 100 }]
      }
    },
    retainedAgentsByPaneKey: {},
    tabsByWorktree: useAppStore.getState().tabsByWorktree,
    worktreeMap: new Map([['wt-1', makeWorktree()]]),
    repoMap: new Map([['repo-1', makeRepo()]]),
    acknowledgedAgentsByPaneKey: {},
    now: Date.now()
  })
  const history = result.events.find((event) => event.timestamp === 100)
  expect(history).toBeDefined()
  expect(history!.entry.providerSession).toBeUndefined()
  expect(history!.entry.prompt).toBe('旧会话任务')
})

it('an explicit native name may itself be 继续', async () => {
  nativeName = '继续'
  const { result } = mountThreads()
  await waitFor(() => expect(result.current.allThreads[0]?.paneTitle).toBe('继续'))
})

it('an inactive split pane requests its own SID and never borrows the selected pane slot', async () => {
  const sibling = '22222222-2222-4222-8222-222222222222'
  const siblingPane = `tab-1:${sibling}`
  resolve.mockImplementationOnce(async (args) => ({
    titles: args.requests.map((item) => ({
      ...item,
      title: `Provider ${item.sessionId}`,
      providerName: {
        kind: 'named' as const,
        title: `Provider ${item.sessionId}`,
        field: 'session_index.thread_name'
      }
    }))
  }))
  useAppStore.setState((s) => ({
    terminalLayoutsByTabId: {
      'tab-1': {
        root: {
          type: 'split',
          direction: 'horizontal',
          first: { type: 'leaf', leafId: LEAF_ID },
          second: { type: 'leaf', leafId: sibling },
          ratio: 0.5
        },
        activeLeafId: sibling,
        expandedLeafId: null,
        ptyIdsByLeafId: { [LEAF_ID]: 'pty-1', [sibling]: 'pty-2' }
      }
    },
    agentStatusByPaneKey: {
      ...s.agentStatusByPaneKey,
      [siblingPane]: {
        ...s.agentStatusByPaneKey[PANE_KEY],
        paneKey: siblingPane,
        providerSession: { key: 'session_id', id: 'B' }
      }
    },
    tabsByWorktree: {
      'wt-1': [
        {
          ...makeTab(),
          aiVaultTitle: {
            agent: 'codex',
            sessionId: 'B',
            title: 'Provider B',
            providerName: { kind: 'named', title: 'Provider B', field: 'session_index.thread_name' }
          }
        }
      ]
    }
  }))
  const { result } = mountThreads()
  await waitFor(() =>
    expect(result.current.allThreads.find((row) => row.paneKey === PANE_KEY)?.paneTitle).toBe(
      'Provider A'
    )
  )
  expect(result.current.allThreads.find((row) => row.paneKey === siblingPane)?.paneTitle).toBe(
    'Provider B'
  )
  expect(resolve.mock.calls[0][0].requests.map((item) => item.sessionId).sort()).toEqual(['A', 'B'])
})

it('a retained row without a live tab still reads its own name', async () => {
  useAppStore.setState((s) => ({
    tabsByWorktree: {},
    agentStatusByPaneKey: {},
    retainedAgentsByPaneKey: {
      [PANE_KEY]: {
        entry: { ...s.agentStatusByPaneKey[PANE_KEY], state: 'done' },
        worktreeId: 'wt-1',
        tab: makeTab(),
        agentType: 'codex',
        startedAt: Date.now()
      }
    }
  }))
  const { result } = mountThreads()
  await waitFor(() => expect(result.current.allThreads[0]?.paneTitle).toBe(nativeName))
})

it('a runtime tab stamp owns the read even when the row carries connectionId null', async () => {
  useAppStore.setState({
    unifiedTabsByWorktree: {
      'wt-1': [
        {
          id: 'unified',
          groupId: 'group',
          entityId: 'tab-1',
          contentType: 'terminal',
          worktreeId: 'wt-1',
          executionHostId: 'runtime:remote',
          label: 'Codex',
          customLabel: null,
          color: null,
          sortOrder: 0,
          createdAt: 1
        }
      ]
    }
  })
  const { result } = mountThreads()
  await waitFor(() => expect(result.current.allThreads[0]?.paneTitle).toBe(nativeName))
  expect(resolve.mock.calls[0][0].executionHostScope).toBe('runtime:remote')
})

it('real IPC timing through the mounted Activity cache keeps latest B and historical A distinct', async () => {
  const start = Date.now()
  useAppStore.setState({ workspaceSessionReady: true, agentStatusByPaneKey: {} })
  const apply = createAgentStatusEventApplicator({
    pendingAgentStatusEvents: [],
    transientClearWatermarkByConnectionId: new Map(),
    enqueuePendingAgentStatus: vi.fn()
  })
  const sendDone = (id: string, receivedAt: number) =>
    apply({
      paneKey: PANE_KEY,
      connectionId: null,
      tabId: 'tab-1',
      worktreeId: 'wt-1',
      state: 'done',
      prompt: '继续',
      agentType: 'codex',
      receivedAt,
      stateStartedAt: start,
      providerSession: { key: 'session_id', id }
    })
  expect(sendDone('A', start)).toBe('applied')
  const { result } = mountThreads()
  await waitFor(() => expect(result.current.allThreads[0]?.paneTitle).toBe(nativeName))
  nativeName = '当前会话B'
  await act(async () => {
    expect(sendDone('B', start + 100)).toBe('applied')
  })
  await waitFor(() => expect(result.current.allThreads[0]?.paneTitle).toBe('当前会话B'))
  await act(async () => {
    expect(sendDone('B', start + 200)).toBe('applied')
  })
  const thread = result.current.allThreads[0]
  expect(thread.latestEvent?.entry.providerSession?.id).toBe('B')
  expect(thread.latestTimestamp).toBe(start + 100)
  expect(thread.events).toHaveLength(2)
  expect(thread.events.map((event) => event.entry.providerSession?.id)).toEqual(
    expect.arrayContaining(['A', 'B'])
  )
  expect(thread.paneTitle).toBe('当前会话B')
})
