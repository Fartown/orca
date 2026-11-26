import type { AppState } from '../../../types'
import type { AgentStatusEntry } from '../../../../../../shared/agent-status/contracts/agent-status-types'
import { resolveAgentSessionStartedAt } from '../../../../../../shared/agent-session/lifecycle/resume/agent-session-start-time'
import { normalizeExecutionHostConnectionId } from '../../../../../../shared/session-names/runtime-host-connection-owner'
import { classifyAgentPaneConversation } from './agent-pane-conversation'
import type { AgentConversationSource } from './agent-conversation-continuity'
import { findAgentPaneWorktreeId } from '../pane-authority/agent-status-pane-key-tab-binding'
import type {
  AgentStatusMetadata,
  AgentStatusPayload,
  AgentStatusRouting,
  AgentStatusTiming
} from '../contracts/agent-status-contract'

export function localAgentConversationAcceptance(
  args: {
    state: AppState
    paneKey: string
    payload: AgentStatusPayload
    routing?: AgentStatusRouting
    timing?: AgentStatusTiming
    metadata?: AgentStatusMetadata
  },
  agentType: AgentStatusEntry['agentType']
) {
  const { state, paneKey, payload, routing, timing, metadata } = args
  const existing = state.agentStatusByPaneKey.get(paneKey)
  const source: AgentConversationSource = {
    ...payload,
    stateStartedAt: timing?.stateStartedAt,
    turnStartedAt: timing?.turnStartedAt,
    isReplay: timing?.isReplay,
    providerSession: metadata?.providerSession
  }
  const owner = {
    paneKey,
    agentType,
    worktreeId:
      routing?.worktreeId ??
      existing?.worktreeId ??
      findAgentPaneWorktreeId(state, paneKey) ??
      undefined,
    connectionId:
      routing?.connectionId === undefined
        ? (existing?.connectionId ?? state.sleepingAgentSessionsByPaneKey[paneKey]?.connectionId)
        : routing.connectionId
  }
  return { ...classifyAgentPaneConversation(state, owner, source), source }
}

export function conversationSessionStartedAt(
  entry: AgentStatusEntry,
  existing: AgentStatusEntry | undefined,
  acceptance: ReturnType<typeof classifyAgentPaneConversation>,
  source: AgentConversationSource
): number {
  if (acceptance.reset) {
    return (
      source.firstStateStartedAt ??
      acceptance.newTurnStartedAt ??
      entry.evidenceObservedAt ??
      entry.updatedAt
    )
  }
  const previous = acceptance.previous
  const previousEntry =
    existing ?? (previous ? { ...previous, agentType: previous.agent } : undefined)
  const normalizedConnectionId = normalizeExecutionHostConnectionId(
    acceptance.ownerHostId,
    entry.connectionId
  )
  return resolveAgentSessionStartedAt({
    entry: { ...entry, connectionId: normalizedConnectionId },
    previous: previousEntry
      ? {
          ...previousEntry,
          connectionId: normalizeExecutionHostConnectionId(
            acceptance.ownerHostId,
            previousEntry.connectionId
          )
        }
      : undefined,
    identity: {
      ...entry,
      connectionId: normalizedConnectionId,
      providerSession: source.providerSession
    }
  })
}
