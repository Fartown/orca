import type { AppState } from '@/store/types'
import { resolveRuntimePaneTitleLeafId } from '@/lib/runtime-pane-title-leaf-id'
import type { AgentStatusState } from '../../../../shared/agent-status-types'
import type {
  AgentProviderSessionKey,
  AgentProviderSessionMetadata
} from '../../../../shared/agent-session-resume'
import type { AiVaultSessionPreviewMessage } from '../../../../shared/ai-vault-types'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { parseLegacyNumericPaneKey, parsePaneKey } from '../../../../shared/stable-pane-id'
import type {
  TerminalLayoutSnapshot,
  TerminalPaneLayoutNode
} from '../../../../shared/terminal-tab-types'
import {
  originalPaneTargetMatchesExecutionHost,
  paneEntryMatchesExecutionHost
} from './ai-vault-original-pane-host-match'
import { promptsMatchSession } from './ai-vault-original-pane-prompt-match'

export type AiVaultOriginalPaneTarget = {
  paneKey: string
  worktreeId: string
  tabId: string
  leafId: string
}

export type AiVaultOriginalPaneSessionReference = {
  agent: string
  sessionId: string
  providerSessionKey?: AgentProviderSessionKey
  title?: string | null
  previewMessages?: readonly Pick<AiVaultSessionPreviewMessage, 'role' | 'text'>[]
  executionHostId?: ExecutionHostId | null
}

export type OriginalPaneState = Pick<
  AppState,
  | 'agentStatusByPaneKey'
  | 'retainedAgentsByPaneKey'
  | 'sleepingAgentSessionsByPaneKey'
  | 'tabsByWorktree'
  | 'terminalLayoutsByTabId'
>

function agentMatches(
  session: AiVaultOriginalPaneSessionReference,
  agent: string | undefined
): boolean {
  return agent === session.agent
}

export function providerSessionMatchesReference(
  session: AiVaultOriginalPaneSessionReference,
  providerSession: AgentProviderSessionMetadata | undefined
): boolean {
  return (
    providerSession?.id === session.sessionId &&
    (!session.providerSessionKey || providerSession.key === session.providerSessionKey)
  )
}

function layoutHasLeaf(node: TerminalPaneLayoutNode | null | undefined, leafId: string): boolean {
  if (!node) {
    return false
  }
  if (node.type === 'leaf') {
    return node.leafId === leafId
  }
  return layoutHasLeaf(node.first, leafId) || layoutHasLeaf(node.second, leafId)
}

function hasAvailableLeaf(layout: TerminalLayoutSnapshot | undefined, leafId: string): boolean {
  return layoutHasLeaf(layout?.root, leafId) || Boolean(layout?.ptyIdsByLeafId?.[leafId])
}

function getTabOwnerWorktreeId(
  state: OriginalPaneState,
  tabId: string,
  worktreeIdHint?: string
): string | null {
  if (
    worktreeIdHint &&
    (state.tabsByWorktree[worktreeIdHint] ?? []).some((tab) => tab.id === tabId)
  ) {
    return worktreeIdHint
  }
  for (const [worktreeId, tabs] of Object.entries(state.tabsByWorktree)) {
    if (tabs.some((tab) => tab.id === tabId)) {
      return worktreeId
    }
  }
  return null
}

export function resolveOriginalPaneTarget(args: {
  state: OriginalPaneState
  paneKey: string
  worktreeIdHint?: string
  tabIdHint?: string
}): AiVaultOriginalPaneTarget | null {
  const { state, paneKey, worktreeIdHint, tabIdHint } = args
  const stable = parsePaneKey(paneKey)
  if (stable) {
    if (tabIdHint && tabIdHint !== stable.tabId) {
      return null
    }
    const worktreeId = getTabOwnerWorktreeId(state, stable.tabId, worktreeIdHint)
    if (
      !worktreeId ||
      !hasAvailableLeaf(state.terminalLayoutsByTabId[stable.tabId], stable.leafId)
    ) {
      return null
    }
    return { paneKey, worktreeId, tabId: stable.tabId, leafId: stable.leafId }
  }

  const legacy = parseLegacyNumericPaneKey(paneKey)
  if (!legacy || (tabIdHint && tabIdHint !== legacy.tabId)) {
    return null
  }
  const worktreeId = getTabOwnerWorktreeId(state, legacy.tabId, worktreeIdHint)
  if (!worktreeId) {
    return null
  }
  const layout = state.terminalLayoutsByTabId[legacy.tabId]
  const leafId = resolveRuntimePaneTitleLeafId(layout, legacy.numericPaneId)
  if (!leafId || !hasAvailableLeaf(layout, leafId)) {
    return null
  }
  return { paneKey, worktreeId, tabId: legacy.tabId, leafId }
}

export function resolveSessionOriginalPaneTarget(args: {
  state: OriginalPaneState
  session: AiVaultOriginalPaneSessionReference
  paneKey: string
  worktreeIdHint?: string
  tabIdHint?: string
  connectionId?: string | null
}): AiVaultOriginalPaneTarget | null {
  const target = resolveOriginalPaneTarget(args)
  return target &&
    originalPaneTargetMatchesExecutionHost({
      state: args.state,
      session: args.session,
      target,
      connectionId: args.connectionId
    })
    ? target
    : null
}

/**
 * The hook-reported live state of the agent currently running this session,
 * or null when the session is not live in any pane. Matches by provider
 * session id first; falls back to a prompt match only when it is unambiguous.
 */
export function findAiVaultSessionLiveState(
  state: OriginalPaneState,
  session: AiVaultOriginalPaneSessionReference
): AgentStatusState | null {
  const promptMatchedStates: AgentStatusState[] = []

  for (const entry of Object.values(state.agentStatusByPaneKey)) {
    if (!agentMatches(session, entry.agentType)) {
      continue
    }
    if (
      providerSessionMatchesReference(session, entry.providerSession) &&
      paneEntryMatchesExecutionHost({
        state,
        session,
        paneKey: entry.paneKey,
        worktreeIdHint: entry.worktreeId,
        tabIdHint: entry.tabId,
        connectionId: entry.connectionId
      })
    ) {
      return entry.state
    }
    if (
      entry.providerSession === undefined &&
      promptsMatchSession(session, entry) &&
      paneEntryMatchesExecutionHost({
        state,
        session,
        paneKey: entry.paneKey,
        worktreeIdHint: entry.worktreeId,
        tabIdHint: entry.tabId,
        connectionId: entry.connectionId
      })
    ) {
      promptMatchedStates.push(entry.state)
    }
  }

  return promptMatchedStates.length === 1 ? promptMatchedStates[0] : null
}

export function findOriginalAiVaultSessionPane(
  state: OriginalPaneState,
  session: AiVaultOriginalPaneSessionReference
): AiVaultOriginalPaneTarget | null {
  const promptMatchedTargets: AiVaultOriginalPaneTarget[] = []

  for (const entry of Object.values(state.agentStatusByPaneKey)) {
    if (
      agentMatches(session, entry.agentType) &&
      providerSessionMatchesReference(session, entry.providerSession)
    ) {
      const target = resolveSessionOriginalPaneTarget({
        state,
        session,
        paneKey: entry.paneKey,
        worktreeIdHint: entry.worktreeId,
        tabIdHint: entry.tabId,
        connectionId: entry.connectionId
      })
      if (target) {
        return target
      }
    }
    if (
      agentMatches(session, entry.agentType) &&
      entry.providerSession === undefined &&
      promptsMatchSession(session, entry)
    ) {
      const target = resolveSessionOriginalPaneTarget({
        state,
        session,
        paneKey: entry.paneKey,
        worktreeIdHint: entry.worktreeId,
        tabIdHint: entry.tabId,
        connectionId: entry.connectionId
      })
      if (target) {
        promptMatchedTargets.push(target)
      }
    }
  }

  for (const retained of Object.values(state.retainedAgentsByPaneKey)) {
    if (
      agentMatches(session, retained.agentType) &&
      providerSessionMatchesReference(session, retained.entry.providerSession)
    ) {
      const target = resolveSessionOriginalPaneTarget({
        state,
        session,
        paneKey: retained.entry.paneKey,
        worktreeIdHint: retained.worktreeId,
        tabIdHint: retained.entry.tabId ?? retained.tab.id,
        connectionId: retained.entry.connectionId
      })
      if (target) {
        return target
      }
    }
    if (
      agentMatches(session, retained.agentType) &&
      retained.entry.providerSession === undefined &&
      promptsMatchSession(session, retained.entry)
    ) {
      const target = resolveSessionOriginalPaneTarget({
        state,
        session,
        paneKey: retained.entry.paneKey,
        worktreeIdHint: retained.worktreeId,
        tabIdHint: retained.entry.tabId ?? retained.tab.id,
        connectionId: retained.entry.connectionId
      })
      if (target) {
        promptMatchedTargets.push(target)
      }
    }
  }

  for (const record of Object.values(state.sleepingAgentSessionsByPaneKey)) {
    if (
      agentMatches(session, record.agent) &&
      providerSessionMatchesReference(session, record.providerSession)
    ) {
      const target = resolveSessionOriginalPaneTarget({
        state,
        session,
        paneKey: record.paneKey,
        worktreeIdHint: record.worktreeId,
        tabIdHint: record.tabId,
        connectionId: record.connectionId
      })
      if (target) {
        return target
      }
    }
  }

  return promptMatchedTargets.length === 1 ? promptMatchedTargets[0] : null
}
