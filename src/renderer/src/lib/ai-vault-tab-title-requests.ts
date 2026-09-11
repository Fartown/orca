import type { AgentProviderSessionMetadata } from '../../../shared/agent-session-resume'
import type { AgentType } from '../../../shared/agent-status-types'
import type { AiVaultSessionTitle } from '../../../shared/ai-vault-session-title'
import { isAiVaultTitleAgent } from '../../../shared/ai-vault-session-title'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import type { TerminalTab } from '../../../shared/terminal-tab-types'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import type { AppState } from '@/store/types'
import {
  sessionNamePaneIsAmbiguous,
  sessionNamePaneWasReplaced
} from '../session-names/session-name-pane-binding'

export type AiVaultTitleRequest = {
  agent: AiVaultSessionTitle['agent']
  executionHostId: ExecutionHostId
  providerSession: AgentProviderSessionMetadata
  refresh: boolean
  tabId: string
  worktreeId: string
  paneKey?: string
  ptyId?: string | null
  terminalGeneration?: number
}

type RequestCandidate = AiVaultTitleRequest & { priority: number }

function tabIdFromPaneKey(paneKey: string, tabId?: string): string | null {
  return tabId?.trim() || parsePaneKey(paneKey)?.tabId || null
}

function registerCandidate(
  state: AppState,
  tabsById: ReadonlyMap<string, TerminalTab>,
  candidates: Map<string, RequestCandidate>,
  args: {
    agent: AgentType | null | undefined
    paneKey: string
    priority: number
    providerSession: AgentProviderSessionMetadata | undefined
    refresh: boolean
    tabId?: string
    worktreeId?: string
  }
): void {
  if (!isAiVaultTitleAgent(args.agent) || !args.providerSession?.id) {
    return
  }
  const tabId = tabIdFromPaneKey(args.paneKey, args.tabId)
  const tab = tabId ? tabsById.get(tabId) : undefined
  const worktreeId = args.worktreeId ?? tab?.worktreeId
  if (!tabId || !tab || !worktreeId) {
    return
  }
  if (
    sessionNamePaneIsAmbiguous(state, tabId) ||
    sessionNamePaneWasReplaced(state, {
      ...args,
      tabId,
      agent: args.agent,
      providerSession: args.providerSession
    })
  ) {
    return
  }
  const priority = args.priority
  if ((candidates.get(tabId)?.priority ?? -1) >= priority) {
    return
  }
  const executionHostId = getExecutionHostIdForWorktree(state, worktreeId)
  candidates.set(tabId, {
    agent: args.agent,
    executionHostId,
    providerSession: args.providerSession,
    refresh: args.refresh,
    tabId,
    worktreeId,
    paneKey: args.paneKey,
    ptyId: panePtyId(state, tab, args.paneKey),
    terminalGeneration: tab.generation ?? 0,
    priority
  })
}

function panePtyId(state: AppState, tab: TerminalTab, paneKey: string): string | null {
  const layout = state.terminalLayoutsByTabId[tab.id]
  const leaf = parsePaneKey(paneKey)?.leafId
  const ownedPty = leaf ? layout?.ptyIdsByLeafId?.[leaf] : undefined
  return ownedPty ?? (layout?.root?.type === 'split' ? null : tab.ptyId)
}

export function collectAiVaultTitleRequests(state: AppState): AiVaultTitleRequest[] {
  const tabsById = new Map(
    Object.values(state.tabsByWorktree)
      .flat()
      .map((tab) => [tab.id, tab] as const)
  )
  const candidates = new Map<string, RequestCandidate>()

  for (const entry of Object.values(state.retainedAgentsByPaneKey)) {
    registerCandidate(state, tabsById, candidates, {
      agent: entry.agentType,
      paneKey: entry.entry.paneKey,
      priority: 10,
      providerSession: entry.entry.providerSession,
      refresh: false,
      tabId: entry.entry.tabId,
      worktreeId: entry.worktreeId
    })
  }
  for (const record of Object.values(state.sleepingAgentSessionsByPaneKey)) {
    registerCandidate(state, tabsById, candidates, {
      agent: record.agent,
      paneKey: record.paneKey,
      priority: 20,
      providerSession: record.providerSession,
      refresh: false,
      tabId: record.tabId,
      worktreeId: record.worktreeId
    })
  }
  for (const entry of Object.values(state.agentStatusByPaneKey)) {
    registerCandidate(state, tabsById, candidates, {
      agent: entry.agentType,
      paneKey: entry.paneKey,
      priority: 30,
      providerSession: entry.providerSession,
      refresh: true,
      tabId: entry.tabId,
      worktreeId: entry.worktreeId
    })
  }

  return [...candidates.values()].map(({ priority: _priority, ...request }) => request)
}
