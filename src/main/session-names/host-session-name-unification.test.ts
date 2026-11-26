import { describe, expect, it } from 'vitest'
import { resolveAiVaultSessionTitlesByHost } from '../ipc/ai-vault/ai-vault-session-title-routing'
import { RuntimeOrchestrationSenderNames } from '../runtime/orchestration/mailbox/senders/runtime-orchestration-sender-names'
import { AgentGeneratedTabTitles } from '../runtime/terminal/layout/agent-generated-tab-titles'
import { buildHeadlessMobileSessionTerminalTabs } from '../runtime/terminal/surface/mobile-session-terminal-projection'
import type { RuntimeMobileSessionTabsResult } from '../../shared/remote-runtime/session-graph/runtime-session-contracts'
import {
  applyHeadlessMobileSessionTabTitles,
  resolveStructuredMobileNotificationTitle,
  resolveWindowlessTerminalNotificationTitle
} from './headless-mobile-tab-session-title'
import {
  resolveWorktreeAgentRowProviderNames,
  worktreeAgentRowProviderTitleKey
} from './worktree-agent-row-provider-names'

const LEAF_A = '11111111-1111-4111-8111-111111111111'
const LEAF_B = '22222222-2222-4222-8222-222222222222'

describe('host session-name unification across main/headless surfaces', () => {
  it('preserves single-pane customTitle and generatedTitle when trackedTitle exists while isolating split panes', () => {
    const singleTabSenderNames = new RuntimeOrchestrationSenderNames({
      getDb: () => null,
      getHandleRecord: () => ({ worktreeId: 'wt-1', tabId: 'tab-single', ptyId: 'pty-1' }),
      getPtyAgents: () => ({ launchAgent: 'claude' }),
      getTerminalPaneKey: () => `tab-single:${LEAF_A}`,
      getWorkspaceSession: () => ({
        tabsByWorktree: {
          'wt-1': [
            {
              id: 'tab-single',
              worktreeId: 'wt-1',
              ptyId: 'pty-1',
              title: 'Terminal 1',
              customTitle: '手动单窗格改名',
              generatedTitle: '首轮单窗格摘要',
              color: null,
              sortOrder: 0,
              createdAt: 1
            }
          ]
        },
        terminalLayoutsByTabId: {
          'tab-single': {
            root: { type: 'leaf', leafId: LEAF_A },
            activeLeafId: LEAF_A,
            expandedLeafId: null,
            ptyIdsByLeafId: { [LEAF_A]: 'pty-1' },
            titlesByLeafId: { [LEAF_A]: 'Terminal 1' }
          }
        }
      }),
      getStore: () => ({ getSettings: () => ({ tabAutoGenerateTitle: true }) }),
      getAgentStatusSnapshotForPane: () => [],
      getTrackedTitle: () => 'Terminal 1'
    })

    const singleName = singleTabSenderNames.agentRowNamer()({
      paneKey: `tab-single:${LEAF_A}`,
      tabId: 'tab-single',
      worktreeId: 'wt-1',
      ptyId: 'pty-1',
      agentType: 'claude',
      providerSessionId: 'abcd1234-0000-4000-8000-000000000001'
    })
    expect(singleName).toBe('手动单窗格改名')

    const splitSenderNames = new RuntimeOrchestrationSenderNames({
      getDb: () => null,
      getHandleRecord: () => ({ worktreeId: 'wt-1', tabId: 'tab-split', ptyId: 'pty-2' }),
      getPtyAgents: () => ({ launchAgent: 'codex' }),
      getTerminalPaneKey: () => `tab-split:${LEAF_B}`,
      getWorkspaceSession: () => ({
        tabsByWorktree: {
          'wt-1': [
            {
              id: 'tab-split',
              worktreeId: 'wt-1',
              ptyId: 'pty-1',
              title: 'Terminal 1',
              customTitle: '父容器标题不应泄漏到分屏子窗格',
              color: null,
              sortOrder: 0,
              createdAt: 1
            }
          ]
        },
        terminalLayoutsByTabId: {
          'tab-split': {
            root: {
              type: 'split',
              direction: 'horizontal',
              ratio: 0.5,
              first: { type: 'leaf', leafId: LEAF_A },
              second: { type: 'leaf', leafId: LEAF_B }
            },
            activeLeafId: LEAF_A,
            expandedLeafId: null,
            ptyIdsByLeafId: { [LEAF_A]: 'pty-1', [LEAF_B]: 'pty-2' },
            titlesByLeafId: { [LEAF_A]: 'Pane A', [LEAF_B]: 'Terminal 2' }
          }
        }
      }),
      getStore: () => ({ getSettings: () => ({ tabAutoGenerateTitle: false }) }),
      getAgentStatusSnapshotForPane: () => [],
      getTrackedTitle: () => 'Terminal 2'
    })

    const splitFallbackName = splitSenderNames.agentRowNamer(undefined, {
      mintIdentityFallback: true
    })({
      paneKey: `tab-split:${LEAF_B}`,
      tabId: 'tab-split',
      worktreeId: 'wt-1',
      ptyId: 'pty-2',
      agentType: 'codex',
      providerSessionId: 'feedbeef-0000-4000-8000-000000000002'
    })
    expect(splitFallbackName).toBe('Codex feedbeef')
  })

  it('names attributed headless rows without mirrored tabId and enriches orchestration sender() from host cache', async () => {
    const sessionId = '99887766-1111-4111-8111-222233334444'
    const resolved = await resolveWorktreeAgentRowProviderNames(
      new Map([
        [
          'p1',
          {
            paneKey: `headless-tab:${LEAF_A}`,
            worktreeId: 'wt-headless',
            connectionId: null,
            state: 'working',
            agentType: 'claude',
            providerSessionId: sessionId,
            prompt: '你觉得呢',
            lastAssistantMessage: null,
            toolName: null,
            toolInput: null,
            interrupted: false,
            stateStartedAt: 100,
            updatedAt: 100
          }
        ]
      ]),
      {
        resolveTitles: async () => ({
          titles: [
            {
              agent: 'claude',
              sessionId,
              title: '无头主机原生会话名',
              kind: 'named',
              providerName: {
                kind: 'named',
                title: '无头主机原生会话名',
                field: 'custom-title.customTitle'
              }
            }
          ]
        })
      }
    )

    const senderNames = new RuntimeOrchestrationSenderNames({
      getDb: () => null,
      getHandleRecord: (handle) =>
        handle === 'TERM-1'
          ? { worktreeId: 'wt-headless', tabId: 'headless-tab', ptyId: 'pty-h1' }
          : undefined,
      getPtyAgents: () => ({ launchAgent: 'claude' }),
      getTerminalPaneKey: () => `headless-tab:${LEAF_A}`,
      getWorkspaceSession: () => null,
      getStore: () => ({ getSettings: () => ({ tabAutoGenerateTitle: false }) }),
      getAgentStatusSnapshotForPane: () => [
        {
          paneKey: `headless-tab:${LEAF_A}`,
          worktreeId: 'wt-headless',
          connectionId: null,
          agentType: 'claude',
          providerSession: { key: 'session_id', id: sessionId },
          receivedAt: 200
        }
      ],
      getTrackedTitle: () => 'claude'
    })

    expect(
      senderNames.agentRowNamer(resolved, { mintIdentityFallback: true })({
        paneKey: `headless-tab:${LEAF_A}`,
        worktreeId: 'wt-headless',
        agentType: 'claude',
        providerSessionId: sessionId
      })
    ).toBe('无头主机原生会话名')

    expect(senderNames.sender('TERM-1').name).toBe('无头主机原生会话名')

    expect(
      resolveWindowlessTerminalNotificationTitle({
        senderNames,
        worktreeId: 'wt-headless',
        paneKey: `headless-tab:${LEAF_A}`,
        ptyId: 'pty-h1',
        row: {
          paneKey: `headless-tab:${LEAF_A}`,
          worktreeId: 'wt-headless',
          connectionId: null,
          state: 'done',
          prompt: '继续',
          agentType: 'claude',
          providerSession: { key: 'session_id', id: sessionId },
          stateStartedAt: 200,
          receivedAt: 200
        }
      })
    ).toBe('无头主机原生会话名')

    expect(
      resolveStructuredMobileNotificationTitle({
        senderNames,
        workspaceId: 'wt-headless',
        sessionId: 'chat-1',
        roomLabel: '研发群聊房间'
      })
    ).toBe('研发群聊房间')
  })

  it('isolates split customTitle in buildHeadlessMobileSessionTerminalTabs and applies mobile-only provider titles', () => {
    const persistedTabs = [
      {
        id: 'tab-split',
        worktreeId: 'wt-1',
        ptyId: 'pty-a',
        title: 'Split Container',
        customTitle: '父级标签名',
        color: null,
        sortOrder: 0,
        createdAt: 1
      }
    ]
    const projectedSplit = buildHeadlessMobileSessionTerminalTabs('wt-1', persistedTabs, {
      activeRepoId: null,
      activeWorktreeId: 'wt-1',
      activeTabId: 'tab-split',
      tabsByWorktree: { 'wt-1': persistedTabs },
      terminalLayoutsByTabId: {
        'tab-split': {
          root: {
            type: 'split',
            direction: 'horizontal',
            ratio: 0.5,
            first: { type: 'leaf', leafId: LEAF_A },
            second: { type: 'leaf', leafId: LEAF_B }
          },
          activeLeafId: LEAF_A,
          expandedLeafId: null,
          ptyIdsByLeafId: { [LEAF_A]: 'pty-a', [LEAF_B]: 'pty-b' },
          titlesByLeafId: { [LEAF_A]: 'Leaf A', [LEAF_B]: 'Leaf B' }
        }
      }
    }).map((tab, index) => ({
      ...tab,
      status: 'pending-handle' as const,
      terminal: null,
      ...(index === 1
        ? {
            agentStatus: {
              paneKey: `tab-split:${LEAF_B}`,
              terminalTitle: 'Leaf B',
              state: 'working' as const,
              agentType: 'codex' as const,
              prompt: '继续',
              stateHistory: [],
              providerSession: { key: 'session_id' as const, id: 'codex-split-b' },
              interrupted: false,
              stateStartedAt: 10,
              updatedAt: 10
            }
          }
        : {})
    }))

    expect(projectedSplit.map((tab) => tab.customTitle)).toEqual([null, null])

    const snapshot: RuntimeMobileSessionTabsResult = {
      worktree: 'wt-1',
      publicationEpoch: 'epoch-1',
      snapshotVersion: 1,
      activeGroupId: null,
      activeTabId: projectedSplit[0]?.id ?? null,
      activeTabType: 'terminal',
      tabs: projectedSplit
    }
    const resolvedMap = new Map([
      [
        worktreeAgentRowProviderTitleKey('codex', 'codex-split-b'),
        {
          agent: 'codex' as const,
          sessionId: 'codex-split-b',
          title: '分屏二号原生标题',
          kind: 'named' as const,
          providerName: {
            kind: 'named' as const,
            title: '分屏二号原生标题',
            field: 'thread_name'
          }
        }
      ]
    ])

    const runtimeView = applyHeadlessMobileSessionTabTitles(snapshot, 'runtime', resolvedMap)
    expect(runtimeView).toBe(snapshot)

    const mobileView = applyHeadlessMobileSessionTabTitles(snapshot, 'mobile', resolvedMap)
    const secondTab = mobileView.tabs[1]
    expect(secondTab?.title).toBe('分屏二号原生标题')
    expect(
      secondTab?.type === 'terminal' ? secondTab.resolvesSessionTitle : undefined
    ).toBeUndefined()
  })

  it('returns explicit unavailable nameEvidence for unsupported SSH and failed runtime scopes', async () => {
    const requests = [{ agent: 'claude' as const, sessionId: 'sess-ssh-1' }]

    const sshResult = await resolveAiVaultSessionTitlesByHost({
      executionHostScope: 'ssh:devbox',
      requests
    })
    expect(sshResult).toEqual({
      titles: [],
      nameEvidence: [
        {
          agent: 'claude',
          sessionId: 'sess-ssh-1',
          providerName: { kind: 'unavailable' }
        }
      ]
    })

    const failedRuntimeResult = await resolveAiVaultSessionTitlesByHost(
      {
        executionHostScope: 'runtime:mini',
        requests
      },
      async () => ({ titles: [] })
    )
    expect(failedRuntimeResult).toEqual({
      titles: [],
      nameEvidence: [
        {
          agent: 'claude',
          sessionId: 'sess-ssh-1',
          providerName: { kind: 'unavailable' }
        }
      ]
    })
  })

  it('keeps unverified ID-less headless rows from leaking prior aiVaultTitle while preserving generated-title session boundaries', async () => {
    const persistedSlot = {
      agent: 'claude' as const,
      sessionId: 'session-dbox-1',
      title: '会话与 Tab 标题不一致',
      generatedTitle: '排查会话与 Tab 标题不一致',
      providerName: {
        kind: 'named' as const,
        title: '会话与 Tab 标题不一致',
        field: 'ai-title.aiTitle'
      }
    }
    const persistedSingleTabs = [
      {
        id: 'tab-dbox',
        worktreeId: 'wt-dbox',
        ptyId: 'pty-dbox',
        title: '✳ Claude Code',
        customTitle: null,
        aiVaultTitle: persistedSlot,
        color: null,
        sortOrder: 0,
        createdAt: 1
      }
    ]
    const projectedSingle = buildHeadlessMobileSessionTerminalTabs('wt-dbox', persistedSingleTabs, {
      activeRepoId: null,
      activeWorktreeId: 'wt-dbox',
      activeTabId: 'tab-dbox',
      tabsByWorktree: { 'wt-dbox': persistedSingleTabs },
      terminalLayoutsByTabId: {
        'tab-dbox': {
          root: { type: 'leaf', leafId: LEAF_A },
          activeLeafId: LEAF_A,
          expandedLeafId: null
        }
      }
    }).map((tab) => ({
      ...tab,
      status: 'pending-handle' as const,
      terminal: null,
      agentStatus: {
        paneKey: `tab-dbox:${LEAF_A}`,
        terminalTitle: '✳ Claude Code',
        state: 'done' as const,
        agentType: 'claude' as const,
        prompt: '新会话 B 的首轮提示词',
        stateHistory: [],
        interrupted: false,
        stateStartedAt: 20,
        updatedAt: 20
      }
    }))

    const singleSnapshot: RuntimeMobileSessionTabsResult = {
      worktree: 'wt-dbox',
      publicationEpoch: 'epoch-dbox',
      snapshotVersion: 2,
      activeGroupId: null,
      activeTabId: projectedSingle[0]?.id ?? null,
      activeTabType: 'terminal',
      tabs: projectedSingle
    }
    const refreshedSlot = {
      ...persistedSlot,
      title: '旧会话 A 最新改名',
      providerName: {
        kind: 'named' as const,
        title: '旧会话 A 最新改名',
        field: 'custom-title.customTitle'
      }
    }
    // Negative case: without providerSession.id, headless mobile projection must not bind or refresh old session A onto session B.
    const mobileSingleView = applyHeadlessMobileSessionTabTitles(
      singleSnapshot,
      'mobile',
      new Map([[worktreeAgentRowProviderTitleKey('claude', 'session-dbox-1'), refreshedSlot]])
    )
    expect(mobileSingleView).toBe(singleSnapshot)
    expect(mobileSingleView.tabs[0]?.title).not.toBe('旧会话 A 最新改名')

    // Negative case: explicit providerSessionId: undefined preserves the "no owning session" contract in worktree.ps / orchestration naming.
    const senderNames = new RuntimeOrchestrationSenderNames({
      getDb: () => null,
      getHandleRecord: () => ({ worktreeId: 'wt-dbox', tabId: 'tab-dbox', ptyId: 'pty-dbox' }),
      getPtyAgents: () => ({ launchAgent: 'claude' }),
      getTerminalPaneKey: () => `tab-dbox:${LEAF_A}`,
      getWorkspaceSession: () => ({
        tabsByWorktree: { 'wt-dbox': persistedSingleTabs },
        terminalLayoutsByTabId: {
          'tab-dbox': {
            root: { type: 'leaf', leafId: LEAF_A },
            activeLeafId: LEAF_A,
            expandedLeafId: null
          }
        }
      }),
      getStore: () => ({ getSettings: () => ({ tabAutoGenerateTitle: true }) }),
      getAgentStatusSnapshotForPane: () => [],
      getTrackedTitle: () => '✳ Claude Code'
    })
    expect(
      senderNames.agentRowNamer(new Map(), { mintIdentityFallback: true })({
        paneKey: `tab-dbox:${LEAF_A}`,
        tabId: 'tab-dbox',
        worktreeId: 'wt-dbox',
        ptyId: 'pty-dbox',
        agentType: 'claude',
        providerSessionId: undefined
      })
    ).toBeNull()

    const generatedWrites: { tabId: string; title: string }[] = []
    let currentTab: {
      customTitle?: string | null
      generatedTitle?: string | null
      aiVaultTitle?: typeof persistedSlot | null
    } = { ...persistedSingleTabs[0]! }
    const generatedTitles = new AgentGeneratedTabTitles({
      enabled: () => true,
      targetOf: () => ({ workspace: 'wt-dbox', tabId: 'tab-dbox', tab: currentTab }),
      orchestrationForPaneKey: () => undefined,
      apply: async (command) => {
        for (const item of command.renames) {
          generatedWrites.push({ tabId: item.tabId, title: item.title ?? '' })
          currentTab = { ...currentTab, generatedTitle: item.title }
        }
        return { ok: true, result: {} }
      }
    })
    generatedTitles.noteStatus({
      paneKey: `tab-dbox:${LEAF_A}`,
      tabId: 'tab-dbox',
      worktreeId: 'wt-dbox',
      connectionId: null,
      state: 'working',
      prompt: '你执行啊',
      agentType: 'claude',
      providerSession: { key: 'session_id', id: 'session-dbox-1' },
      stateStartedAt: 30,
      receivedAt: 30
    })
    await generatedTitles.settled()
    expect(generatedWrites).toEqual([])

    // Agent change without providerSession.id still supersedes the old Claude slot and writes the new task.
    generatedTitles.noteStatus({
      paneKey: `tab-dbox:${LEAF_A}`,
      tabId: 'tab-dbox',
      worktreeId: 'wt-dbox',
      connectionId: null,
      state: 'working',
      prompt: '切换到 Codex 后的首轮任务',
      agentType: 'codex',
      stateStartedAt: 35,
      receivedAt: 35
    })
    await generatedTitles.settled()
    expect(generatedWrites).toEqual([{ tabId: 'tab-dbox', title: '切换到 Codex 后的首轮任务' }])

    // Reset generatedTitle to verify a different session ID for the same agent also supersedes.
    currentTab = { ...persistedSingleTabs[0]! }
    generatedWrites.length = 0
    generatedTitles.noteStatus({
      paneKey: `tab-dbox:${LEAF_A}`,
      tabId: 'tab-dbox',
      worktreeId: 'wt-dbox',
      connectionId: null,
      state: 'working',
      prompt: '新会话首轮任务内容',
      agentType: 'claude',
      providerSession: { key: 'session_id', id: 'session-dbox-2' },
      stateStartedAt: 40,
      receivedAt: 40
    })
    await generatedTitles.settled()
    expect(generatedWrites).toEqual([{ tabId: 'tab-dbox', title: '新会话首轮任务内容' }])
  })
})
