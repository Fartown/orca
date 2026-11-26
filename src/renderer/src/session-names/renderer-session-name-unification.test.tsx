// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { rowConversationName } from '@/components/dashboard/snapshot/dashboard-card-labels'
import type { DashboardAgentRow } from '@/components/dashboard/rows/dashboard-agent-row'
import {
  forgetTerminalSessionNames,
  saveTerminalSessionName,
  terminalSessionNamesOwnedBy
} from '@/lib/agent-session/history/session-names/terminal-session-names'
import {
  canonicalSessionTitleKey,
  getCanonicalSessionTitle,
  getCanonicalSessionTitleIndex
} from '@/lib/canonical-session-titles'
import { publishBotGroups } from '@/lib/bot-group-catalog-snapshot'
import { buildRecentTabSwitcherModel } from '@/components/tab-bar/recent-switcher/recent-tab-switching'
import { createWorkspaceTabPaletteIndex } from '@/lib/workspace/search/tabs/workspace-tab-palette-index'
import { resolvePinnedTabLabel } from '@/store/slices/tabs/closing/pinned-tab-close-guard'
import { makeTab } from '@/store/terminals/testing/terminal-tab.test-fixture'
import { makeTabGroup, makeUnifiedTab } from '@/store/slices/tabs/tab-group.test-fixture'
import { makeWorktree } from '@/store/slices/worktrees/worktree.test-fixture'
import { useAppStore } from '@/store'
import { TEST_REPO } from '@/store/repos/repo.test-fixture'
import type { BotGroup } from '../../../shared/bots/bot-group'
import {
  captureStructuredNotificationSessionName,
  resolveSidebarSlotTargetSessionName
} from './renderer-surface-session-names'
import { sessionNameStore } from './session-name-store'
import { useActivitySessionNames } from './use-activity-session-names'

const LEAF_1 = '11111111-1111-4111-8111-111111111111'
const LEAF_2 = '22222222-2222-4222-8222-222222222222'

describe('renderer session-name unification across closed tabs, remote activity, dashboard, notifications, and slot menus', () => {
  const initialState = useAppStore.getState()

  beforeEach(() => {
    forgetTerminalSessionNames([
      ...terminalSessionNamesOwnedBy('tab-closed'),
      ...terminalSessionNamesOwnedBy('tab-open-split')
    ])
    localStorage.clear()
    sessionNameStore.reset()
    publishBotGroups([])
    useAppStore.setState(initialState, true)
  })

  afterEach(() => {
    forgetTerminalSessionNames([
      ...terminalSessionNamesOwnedBy('tab-closed'),
      ...terminalSessionNamesOwnedBy('tab-open-split')
    ])
    localStorage.clear()
    sessionNameStore.reset()
    publishBotGroups([])
    useAppStore.setState(initialState, true)
  })

  it('reads the terminal session name in tab navigation when the restored group label is stale', () => {
    const worktree = makeWorktree({ id: 'wt', repoId: TEST_REPO.id })
    const unified = makeUnifiedTab({
      id: 'u',
      entityId: 't',
      worktreeId: 'wt',
      groupId: 'g',
      label: 'Previous task',
      customLabel: 'Previous manual name',
      aiVaultTitle: { agent: 'claude', sessionId: 'previous-session', title: 'Previous task' }
    })
    const terminal = makeTab({
      id: 't',
      worktreeId: 'wt',
      title: 'Claude',
      aiVaultTitle: {
        agent: 'claude',
        sessionId: 'session-a',
        title: 'Deployment review',
        providerName: { kind: 'named', title: 'Deployment review', field: 'ai-title.aiTitle' }
      }
    })
    const state = {
      ...initialState,
      tabsByWorktree: { wt: [terminal] },
      unifiedTabsByWorktree: {
        wt: [unified, makeUnifiedTab({ id: 'u2', worktreeId: 'wt', groupId: 'g' })]
      },
      activeGroupIdByWorktree: { wt: 'g' },
      groupsByWorktree: { wt: [makeTabGroup({ id: 'g', worktreeId: 'wt', tabOrder: ['u', 'u2'] })] }
    }
    const palette = createWorkspaceTabPaletteIndex()({
      ...state,
      worktrees: [worktree],
      repoMap: new Map(),
      worktreeOrder: new Map(),
      generatedTitlesEnabled: false,
      chatNames: new Map()
    })
    expect.soft(palette.find((item) => item.tab.id === 'u')?.title).toBe('Deployment review')
    expect
      .soft(
        buildRecentTabSwitcherModel(state, 'wt', 'mru')?.items.find((item) => item.tabId === 'u')
          ?.label
      )
      .toBe('Deployment review')
    expect(resolvePinnedTabLabel(state, 'wt', 'u')).toBe('Deployment review')
  })

  it('bridges saved manual terminal-session-names into canonical titles across closed tabs while suppressing open split tabs', () => {
    saveTerminalSessionName({
      executionHostId: 'local',
      sessionId: 'closed-session-1',
      agent: 'claude',
      title: '关闭标签后仍保留的手动改名',
      tabId: 'tab-closed'
    })
    saveTerminalSessionName({
      executionHostId: 'local',
      sessionId: 'split-session-1',
      agent: 'claude',
      title: '分屏父标签旧手动名',
      tabId: 'tab-open-split'
    })

    useAppStore.setState({
      terminalLayoutsByTabId: {
        'tab-open-split': {
          root: {
            type: 'split',
            direction: 'horizontal',
            ratio: 0.5,
            first: { type: 'leaf', leafId: LEAF_1 },
            second: { type: 'leaf', leafId: LEAF_2 }
          },
          activeLeafId: LEAF_1,
          expandedLeafId: null,
          ptyIdsByLeafId: { [LEAF_1]: 'pty-1', [LEAF_2]: 'pty-2' }
        }
      }
    })

    expect(getCanonicalSessionTitle('local', 'claude', 'closed-session-1')).toBe(
      '关闭标签后仍保留的手动改名'
    )
    expect(
      getCanonicalSessionTitleIndex().get(
        canonicalSessionTitleKey('local', 'claude', 'closed-session-1')
      )
    ).toBe('关闭标签后仍保留的手动改名')

    expect(getCanonicalSessionTitle('local', 'claude', 'split-session-1')).toBeUndefined()
    expect(
      getCanonicalSessionTitleIndex().get(
        canonicalSessionTitleKey('local', 'claude', 'split-session-1')
      )
    ).toBeUndefined()
  })

  it('preserves unmounted/sleeping single-pane customTitle and resolves runtime:<env> host in useActivitySessionNames', () => {
    const remoteRepo = { ...TEST_REPO, id: 'repo-remote', executionHostId: 'runtime:dbox' as const }
    const remoteWorktree = makeWorktree({
      id: 'repo-remote::/work/dreamina',
      repoId: 'repo-remote',
      runtimeOwnerEnvironmentId: 'dbox'
    })

    sessionNameStore.publish('runtime:dbox', {
      titles: [
        {
          agent: 'claude',
          sessionId: 'remote-session-1',
          title: '远端运行时原生标题',
          kind: 'named',
          providerName: {
            kind: 'named',
            title: '远端运行时原生标题',
            field: 'custom-title.customTitle'
          }
        }
      ]
    })

    const sleepingTab = {
      id: 'tab-sleeping',
      worktreeId: remoteWorktree.id,
      ptyId: null,
      title: 'Terminal',
      customTitle: '休眠单窗格手动标题',
      color: null,
      sortOrder: 0,
      createdAt: 1
    }
    const remoteTab = {
      id: 'tab-remote',
      worktreeId: remoteWorktree.id,
      ptyId: null,
      title: 'Terminal',
      customTitle: null,
      color: null,
      sortOrder: 1,
      createdAt: 2
    }

    useAppStore.setState({
      repos: [remoteRepo],
      worktreesByRepo: { 'repo-remote': [remoteWorktree] },
      terminalLayoutsByTabId: {},
      sleepingAgentSessionsByPaneKey: {
        [`tab-sleeping:${LEAF_1}`]: {
          paneKey: `tab-sleeping:${LEAF_1}`,
          worktreeId: remoteWorktree.id,
          tabId: 'tab-sleeping',
          agent: 'claude',
          providerSession: { key: 'session_id', id: 'sleeping-session-1' },
          prompt: '继续',
          state: 'done',
          capturedAt: 500,
          updatedAt: 500,
          launchConfig: { agentArgs: '', agentEnv: {} }
        }
      }
    })

    const live = {
      remote: {
        state: 'working' as const,
        timestamp: 100,
        agentType: 'claude' as const,
        entry: {
          paneKey: `tab-remote:${LEAF_1}`,
          tabId: 'tab-remote',
          worktreeId: remoteWorktree.id,
          connectionId: null,
          terminalTitle: 'Terminal',
          state: 'working' as const,
          agentType: 'claude' as const,
          providerSession: { key: 'session_id' as const, id: 'remote-session-1' },
          prompt: '继续',
          stateHistory: [],
          interrupted: false,
          stateStartedAt: 100,
          updatedAt: 100
        },
        worktree: remoteWorktree,
        repo: remoteRepo,
        tab: remoteTab
      }
    }
    const sleepingEvent = {
      id: 'evt-sleeping-1',
      state: 'done' as const,
      timestamp: 90,
      observedAt: 90,
      agentType: 'claude' as const,
      agentAlive: false,
      unread: false,
      entry: {
        paneKey: `tab-sleeping:${LEAF_1}`,
        tabId: 'tab-sleeping',
        worktreeId: remoteWorktree.id,
        connectionId: null,
        terminalTitle: 'Terminal',
        state: 'done' as const,
        agentType: 'claude' as const,
        providerSession: { key: 'session_id' as const, id: 'sleeping-session-1' },
        prompt: '继续',
        stateHistory: [],
        interrupted: false,
        stateStartedAt: 90,
        updatedAt: 90
      },
      worktree: remoteWorktree,
      repo: remoteRepo,
      tab: sleepingTab
    }

    const { result } = renderHook(() => useActivitySessionNames([sleepingEvent], live))
    expect(result.current(live.remote)).toBe('远端运行时原生标题')
    expect(result.current(sleepingEvent)).toBe('休眠单窗格手动标题')
  })

  it('resolves non-focused split-pane dashboard cards, structured notification titles, and sidebar slot jump names', () => {
    const wt = makeWorktree({ id: 'repo1::/tmp/wt', repoId: TEST_REPO.id })
    const splitTab = {
      id: 'tab-split',
      worktreeId: wt.id,
      ptyId: 'pty-1',
      title: 'Split Tab',
      customTitle: null,
      aiVaultTitle: {
        agent: 'claude' as const,
        sessionId: 'focused-pane-session',
        title: '焦点窗格会话名',
        providerName: {
          kind: 'named' as const,
          title: '焦点窗格会话名',
          field: 'custom-title.customTitle'
        }
      },
      color: null,
      sortOrder: 0,
      createdAt: 1
    }

    act(() => {
      sessionNameStore.publish('local', {
        titles: [
          {
            agent: 'codex',
            sessionId: 'sibling-pane-session',
            title: '非焦点分屏原生会话名',
            kind: 'named',
            providerName: {
              kind: 'named',
              title: '非焦点分屏原生会话名',
              field: 'thread_name'
            }
          }
        ]
      })
    })

    useAppStore.setState({
      repos: [TEST_REPO],
      worktreesByRepo: { [TEST_REPO.id]: [wt] },
      tabsByWorktree: { [wt.id]: [splitTab] },
      terminalLayoutsByTabId: {
        'tab-split': {
          root: {
            type: 'split',
            direction: 'horizontal',
            ratio: 0.5,
            first: { type: 'leaf', leafId: LEAF_1 },
            second: { type: 'leaf', leafId: LEAF_2 }
          },
          activeLeafId: LEAF_1,
          expandedLeafId: null,
          ptyIdsByLeafId: { [LEAF_1]: 'pty-1', [LEAF_2]: 'pty-2' },
          titlesByLeafId: { [LEAF_1]: 'Pane 1', [LEAF_2]: 'Terminal 2' }
        }
      }
    })

    const siblingDashboardRow: DashboardAgentRow = {
      paneKey: `tab-split:${LEAF_2}`,
      state: 'working',
      startedAt: 100,
      agentType: 'codex',
      tab: splitTab,
      entry: {
        paneKey: `tab-split:${LEAF_2}`,
        tabId: 'tab-split',
        worktreeId: wt.id,
        terminalTitle: 'Terminal 2',
        state: 'working',
        prompt: '继续',
        stateHistory: [],
        agentType: 'codex',
        providerSession: { key: 'session_id', id: 'sibling-pane-session' },
        interrupted: false,
        stateStartedAt: 100,
        updatedAt: 100
      }
    }

    expect(
      rowConversationName(
        siblingDashboardRow,
        false,
        useAppStore.getState().terminalLayoutsByTabId['tab-split'],
        undefined,
        new Map(),
        {}
      )
    ).toBe('非焦点分屏原生会话名')

    expect(
      resolveSidebarSlotTargetSessionName(useAppStore.getState(), {
        worktreeId: wt.id,
        paneKey: `tab-split:${LEAF_2}`,
        tabId: 'tab-split',
        agentType: 'codex',
        entry: siblingDashboardRow.entry
      })
    ).toBe('非焦点分屏原生会话名')

    const store = useAppStore.getState()
    const paneKey = siblingDashboardRow.paneKey
    const routing = { worktreeId: wt.id, tabId: splitTab.id, connectionId: null }
    const status = { agentType: 'codex' as const, state: 'working' as const, prompt: '继续' }
    store.setAgentStatus(paneKey, status, 'Terminal 2', undefined, routing)
    store.recordAgentProviderSession(
      paneKey,
      'codex',
      { key: 'session_id', id: 'sibling-pane-session' },
      undefined,
      routing
    )
    store.removeAgentStatus(paneKey)
    store.setAgentStatus(paneKey, status, 'Terminal 2', undefined, routing)
    const recreated = useAppStore.getState().agentStatusByPaneKey.get(paneKey)!
    expect(recreated.providerSession).toBeUndefined()
    const active = {
      entry: recreated,
      tab: splitTab,
      worktree: wt,
      repo: TEST_REPO,
      agentType: 'codex' as const,
      state: 'working' as const,
      timestamp: 100
    }
    const historical = {
      ...active,
      id: 'previous',
      observedAt: 80,
      agentAlive: false,
      unread: false,
      entry: { ...recreated, stateStartedAt: 80, prompt: 'Earlier task' }
    }
    const { result } = renderHook(() =>
      useActivitySessionNames([historical], { [paneKey]: active })
    )
    expect
      .soft(
        rowConversationName(
          { ...siblingDashboardRow, entry: recreated },
          false,
          useAppStore.getState().terminalLayoutsByTabId['tab-split'],
          undefined,
          new Map(),
          {}
        )
      )
      .toBe('非焦点分屏原生会话名')
    expect
      .soft(
        resolveSidebarSlotTargetSessionName(useAppStore.getState(), {
          worktreeId: wt.id,
          paneKey,
          tabId: splitTab.id,
          agentType: 'codex',
          entry: recreated
        })
      )
      .toBe('非焦点分屏原生会话名')
    expect.soft(result.current(active)).toBe('非焦点分屏原生会话名')
    expect(result.current(historical)).toBe('Codex')
    const target = {
      worktreeId: wt.id,
      paneKey,
      tabId: splitTab.id,
      agentType: 'codex' as const,
      entry: recreated
    }
    expect(
      resolveSidebarSlotTargetSessionName(useAppStore.getState(), {
        ...target,
        executionHostId: 'runtime:other'
      })
    ).toBe('Codex')
    expect(
      resolveSidebarSlotTargetSessionName(useAppStore.getState(), {
        ...target,
        entry: { ...recreated, sessionBoundary: true }
      })
    ).toBe('Codex')
    expect(
      resolveSidebarSlotTargetSessionName(useAppStore.getState(), {
        ...target,
        entry: {
          ...recreated,
          orchestration: { taskId: 'child', dispatchId: 'child', parentPaneKey: paneKey }
        }
      })
    ).toBeNull()

    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test fixture needs group room identity fields.
    const group = {
      id: 'group-room-1',
      name: '多智能体评审室',
      folderWorkspaceId: 'room-ws',
      members: [{ botId: 'reviewer', sessionId: 'bot-group-member-42' }]
    } as BotGroup
    publishBotGroups([group])

    const memberChatTab = {
      ...makeUnifiedTab({
        id: 'chat-member',
        worktreeId: 'folder:room-ws',
        groupId: 'g1',
        contentType: 'agent-session',
        entityId: 'bot-group-member-42',
        label: 'New Chat'
      }),
      contentType: 'agent-session' as const
    }
    expect(captureStructuredNotificationSessionName(useAppStore.getState(), memberChatTab)).toBe(
      '多智能体评审室'
    )
  })
})
