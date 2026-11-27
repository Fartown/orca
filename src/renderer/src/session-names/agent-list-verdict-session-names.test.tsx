// @vitest-environment happy-dom
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type {
  AgentListVerdict,
  AgentListVerdictUpdate
} from '../../../shared/agent-status/presentation/agent-list-status'
import type {
  AiVaultSessionTitlesArgs,
  AiVaultSessionTitlesResult
} from '../../../shared/ai-vault/contracts/ai-vault-session-title'
import { makePaneKey } from '../../../shared/workspace-layout/stable-pane-id'
import type { Tab } from '../../../shared/workspace-layout/tab-groups/tab-types'
import AgentListVerdictPublisher, {
  readPublishedAgentPaneThreads
} from '../components/activity/paired-clients/agent-list-verdict-publisher'
import { useAppStore } from '../store'
import { acceptedAgentStatuses } from '../store/slices/agent-status/status-ownership/accepted-agent-statuses'
import {
  LEAF_ID,
  LEAF_ID_2,
  makeRepo,
  makeTab,
  makeWorktree,
  PANE_KEY
} from './activity-test-fixtures'
import { sessionNameStore } from './session-name-store'

const initial = useAppStore.getInitialState()
const NOW = 1_700_000_000_000
let nativeName = 'Provider 原生名'
const localRequest = {
  executionHostId: 'local' as const,
  agent: 'claude' as const,
  sessionId: 'S1'
}
const publishListVerdicts = vi.fn<(update: AgentListVerdictUpdate | null) => void>()
const resolve = vi.fn(
  async (args: AiVaultSessionTitlesArgs): Promise<AiVaultSessionTitlesResult> => ({
    titles: args.requests.map((item) => ({
      ...item,
      title: '你觉得呢',
      generatedTitle: '最初的有效任务',
      providerName: {
        kind: 'named' as const,
        title: nativeName,
        field: 'customTitle'
      }
    }))
  })
)

function latestPublishedTitle(paneKey = PANE_KEY): string | undefined {
  for (let i = publishListVerdicts.mock.calls.length - 1; i >= 0; i -= 1) {
    const update = publishListVerdicts.mock.calls[i]?.[0]
    if (!update) {
      continue
    }
    if (update.kind === 'changes' && update.removed.includes(paneKey)) {
      return undefined
    }
    const verdict: AgentListVerdict | undefined =
      update.kind === 'reset' ? update.publication.verdicts[paneKey] : update.changed[paneKey]
    if (verdict) {
      return verdict.listed ? verdict.title : undefined
    }
    if (update.kind === 'reset') {
      return undefined
    }
  }
  return undefined
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  useAppStore.setState(initial, true)
  sessionNameStore.reset()
  nativeName = 'Provider 原生名'
  resolve.mockClear()
  publishListVerdicts.mockClear()
  Object.assign(window, {
    api: {
      ...window.api,
      aiVault: { resolveSessionTitles: resolve },
      agentStatus: { publishListVerdicts }
    }
  })
  useAppStore.setState({
    persistedUIReady: true,
    repos: [makeRepo()],
    worktreesByRepo: { 'repo-1': [makeWorktree()] },
    tabsByWorktree: {
      'wt-1': [{ ...makeTab(), title: 'Claude 实时标题', generatedTitle: '旧容器名' }]
    },
    terminalLayoutsByTabId: {
      'tab-1': {
        root: { type: 'leaf', leafId: LEAF_ID },
        activeLeafId: LEAF_ID,
        expandedLeafId: null,
        ptyIdsByLeafId: { [LEAF_ID]: 'pty-1' }
      }
    },
    agentStatusByPaneKey: acceptedAgentStatuses([
      [
        PANE_KEY,
        {
          paneKey: PANE_KEY,
          worktreeId: 'wt-1',
          tabId: 'tab-1',
          agentType: 'claude',
          providerSession: { key: 'session_id', id: 'S1' },
          connectionId: null,
          state: 'working',
          prompt: '你觉得呢',
          stateHistory: [],
          updatedAt: NOW,
          stateStartedAt: NOW,
          toolName: 'Read',
          toolInput: 'README.md'
        }
      ]
    ])
  })
})

afterEach(() => {
  cleanup()
  sessionNameStore.reset()
  useAppStore.setState(initial, true)
  vi.useRealTimers()
})

it('publishes the confirmed Provider name instead of a raw follow-up prompt', async () => {
  render(<AgentListVerdictPublisher />)
  await waitFor(() => expect(latestPublishedTitle()).toBe(nativeName))
  expect(readPublishedAgentPaneThreads()?.[0]?.paneTitle).toBe(nativeName)
})

it('publishes names resolved before the persisted UI became ready', async () => {
  await sessionNameStore.read([localRequest], true)
  useAppStore.setState({ persistedUIReady: false })
  render(<AgentListVerdictPublisher />)
  expect(publishListVerdicts).not.toHaveBeenCalled()
  await act(async () => {
    useAppStore.setState({ persistedUIReady: true })
  })
  await waitFor(() => expect(latestPublishedTitle()).toBe('Provider 原生名'))
  expect(readPublishedAgentPaneThreads()?.[0]?.paneTitle).toBe('Provider 原生名')
})

it('publishes a single-pane manual tab rename ahead of the Provider name', async () => {
  await sessionNameStore.read([localRequest], true)
  useAppStore.setState({
    tabsByWorktree: {
      'wt-1': [{ ...makeTab(), title: 'Claude 实时标题', customTitle: '手动改名' }]
    }
  })
  render(<AgentListVerdictPublisher />)
  await waitFor(() => expect(latestPublishedTitle()).toBe('手动改名'))
  expect(readPublishedAgentPaneThreads()?.[0]?.paneTitle).toBe('手动改名')
})

it('publishes the Provider first-prompt fallback when a follow-up prompt arrives', async () => {
  resolve.mockImplementationOnce(async (args) => ({
    titles: args.requests.map((item) => ({
      ...item,
      title: '最初的有效任务',
      generatedTitle: '最初的有效任务',
      providerName: { kind: 'absent' as const }
    }))
  }))
  render(<AgentListVerdictPublisher />)
  await waitFor(() => expect(latestPublishedTitle()).toBe('最初的有效任务'))
})

it('re-publishes when the Provider native name changes without status or tab writes', async () => {
  await sessionNameStore.read([localRequest], true)
  render(<AgentListVerdictPublisher />)
  await waitFor(() => expect(latestPublishedTitle()).toBe(nativeName))
  const status = useAppStore.getState().agentStatusByPaneKey
  const tabs = useAppStore.getState().tabsByWorktree
  nativeName = 'Provider 已改名'
  await act(async () => {
    await sessionNameStore.read([localRequest], true)
  })
  await waitFor(() => expect(latestPublishedTitle()).toBe('Provider 已改名'))
  expect(useAppStore.getState().agentStatusByPaneKey).toBe(status)
  expect(useAppStore.getState().tabsByWorktree).toBe(tabs)
})

it('publishes the SSH host session name using the SSH execution host scope', async () => {
  const sshHost = 'ssh:box-1' as const
  const sshRepo = { ...makeRepo(), id: 'repo-ssh', connectionId: 'box-1' }
  const sshWorktree = { ...makeWorktree(), id: 'wt-ssh', repoId: 'repo-ssh' }
  const sshTab = { ...makeTab(), id: 'tab-ssh', ptyId: 'pty-ssh', worktreeId: 'wt-ssh' }
  const sshPaneKey = makePaneKey('tab-ssh', LEAF_ID)
  resolve.mockImplementationOnce(async (args) => ({
    titles: args.requests.map((item) => ({
      ...item,
      title: '你觉得呢',
      providerName: {
        kind: 'named' as const,
        title: 'SSH 远端会话名',
        field: 'customTitle'
      }
    }))
  }))
  useAppStore.setState({
    repos: [sshRepo],
    worktreesByRepo: { 'repo-ssh': [sshWorktree] },
    tabsByWorktree: { 'wt-ssh': [sshTab] },
    terminalLayoutsByTabId: {
      'tab-ssh': {
        root: { type: 'leaf', leafId: LEAF_ID },
        activeLeafId: LEAF_ID,
        expandedLeafId: null,
        ptyIdsByLeafId: { [LEAF_ID]: 'pty-ssh' }
      }
    },
    agentStatusByPaneKey: acceptedAgentStatuses([
      [
        sshPaneKey,
        {
          paneKey: sshPaneKey,
          worktreeId: 'wt-ssh',
          tabId: 'tab-ssh',
          agentType: 'claude',
          providerSession: { key: 'session_id', id: 'S-SSH' },
          connectionId: 'box-1',
          state: 'working',
          prompt: '你觉得呢',
          stateHistory: [],
          updatedAt: NOW,
          stateStartedAt: NOW
        }
      ]
    ])
  })
  render(<AgentListVerdictPublisher />)
  await waitFor(() => expect(latestPublishedTitle(sshPaneKey)).toBe('SSH 远端会话名'))
  expect(resolve).toHaveBeenCalledWith(
    expect.objectContaining({
      executionHostScope: sshHost,
      requests: [{ agent: 'claude', sessionId: 'S-SSH' }]
    })
  )
})

it('publishes each split pane name independently without applying the tab customTitle', async () => {
  const siblingPaneKey = makePaneKey('tab-1', LEAF_ID_2)
  resolve.mockImplementationOnce(async (args) => ({
    titles: args.requests.map((item) => ({
      ...item,
      title: `Provider ${item.sessionId}`,
      providerName: {
        kind: 'named' as const,
        title: `Provider ${item.sessionId}`,
        field: 'customTitle'
      }
    }))
  }))
  useAppStore.setState((s) => ({
    tabsByWorktree: {
      'wt-1': [{ ...makeTab(), customTitle: '父标签改名' }]
    },
    terminalLayoutsByTabId: {
      'tab-1': {
        root: {
          type: 'split',
          direction: 'horizontal',
          first: { type: 'leaf', leafId: LEAF_ID },
          second: { type: 'leaf', leafId: LEAF_ID_2 }
        },
        activeLeafId: LEAF_ID,
        expandedLeafId: null,
        ptyIdsByLeafId: { [LEAF_ID]: 'pty-1', [LEAF_ID_2]: 'pty-2' }
      }
    },
    agentStatusByPaneKey: acceptedAgentStatuses([
      [PANE_KEY, s.agentStatusByPaneKey.get(PANE_KEY)!],
      [
        siblingPaneKey,
        {
          ...s.agentStatusByPaneKey.get(PANE_KEY)!,
          paneKey: siblingPaneKey,
          providerSession: { key: 'session_id', id: 'S2' },
          prompt: '你觉得呢'
        }
      ]
    ])
  }))
  render(<AgentListVerdictPublisher />)
  await waitFor(() => {
    expect(latestPublishedTitle(PANE_KEY)).toBe('Provider S1')
    expect(latestPublishedTitle(siblingPaneKey)).toBe('Provider S2')
  })
})

it('publishes a native chat tab saved name instead of a follow-up prompt', async () => {
  const chatTabId = 'agent-chat-1'
  const chatPaneKey = makePaneKey(chatTabId, LEAF_ID)
  const chatTab: Tab = {
    id: chatTabId,
    entityId: 'session-chat-1',
    groupId: 'group-1',
    worktreeId: 'wt-1',
    contentType: 'agent-session',
    label: 'Claude',
    customLabel: '原生聊天会话名',
    color: null,
    sortOrder: 0,
    createdAt: 1,
    executionHostId: 'local'
  }
  useAppStore.setState({
    tabsByWorktree: {},
    unifiedTabsByWorktree: { 'wt-1': [chatTab] },
    terminalLayoutsByTabId: {},
    agentStatusByPaneKey: acceptedAgentStatuses([
      [
        chatPaneKey,
        {
          paneKey: chatPaneKey,
          worktreeId: 'wt-1',
          tabId: chatTabId,
          agentType: 'claude',
          connectionId: null,
          state: 'working',
          prompt: '你觉得呢',
          stateHistory: [],
          updatedAt: NOW,
          stateStartedAt: NOW
        }
      ]
    ])
  })
  render(<AgentListVerdictPublisher />)
  await waitFor(() => expect(latestPublishedTitle(chatPaneKey)).toBe('原生聊天会话名'))
})
