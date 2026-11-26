import { agentProviderSessionsEqual } from '../../../../../../shared/agent-session/lifecycle/resume/agent-provider-session-equality'
import { getExecutionHostIdForWorktree } from '@/lib/workspace/ownership/worktree-runtime-owner'
import { canonicalOrchestrationForRow } from '@/runtime/agent-orchestration/visible-agent-orchestration'
import { sameAgentStatusTerminalOwner } from '../../../../../../shared/agent-status/identity/agent-status-terminal-owner'
import { normalizeExecutionHostConnectionId } from '../../../../../../shared/session-names/runtime-host-connection-owner'
import { resolveAgentStatusLiveEntryTiming } from './agent-status-live-entry-timing'
import { resolveAgentStatusLiveEntryMainAgent } from './agent-status-live-entry-main-agent'
import { resolveSessionNameLiveEntryState } from '../../../../../../shared/session-names/session-name-live-entry'
import type { AgentStatusEntry } from '../../../../../../shared/agent-status/contracts/agent-status-types'
import {
  resolveAgentStatusIdentity,
  shouldSuppressInheritedTerminalStatus
} from '../../../../../../shared/agent-status/identity/agent-status-identity'
import { isCommandCodeNewTurnWhileWorking } from '../../../../../../shared/agent-status/output/command-code-turn-boundary'
import {
  invocationLaunchConfig,
  ownerLaunchAttested,
  registryEntryMatchesStatus
} from '../launch-config/agent-status-launch-config'
import {
  findAgentPaneWorktreeId,
  getTabIdFromPaneKey
} from '../pane-authority/agent-status-pane-key-tab-binding'
import { mergeCurrentOrchestrationContext } from '../orchestration/agent-status-orchestration-context'
import { deriveAgentStatusLiveFacts } from './agent-status-live-facts'
import {
  localAgentConversationAcceptance,
  conversationSessionStartedAt
} from '../conversation/agent-conversation-acceptance'
import { liveEntryChildFields } from './agent-status-live-entry-children'
import {
  canReuseStatusProviderSession,
  statusRetainsResumableIdentity
} from '../../../../../../shared/agent-session/lifecycle/resume/agent-resume-record-from-status'

import type {
  AgentStatusLiveEntryArgs,
  AgentStatusLiveEntryBuild,
  AgentStatusLiveEntryRejection
} from './agent-status-live-entry-contract'

/** Build one accepted live row and the derived map-update facts, or say why the frame was rejected. */
export function buildAgentStatusLiveEntry(
  args: AgentStatusLiveEntryArgs
): AgentStatusLiveEntryBuild | AgentStatusLiveEntryRejection {
  const { state, paneKey, payload, terminalTitle, timing, routing, metadata, updatedAt } = args
  const existing = state.agentStatusByPaneKey.get(paneKey)
  if (existing && updatedAt < existing.updatedAt && !timing?.allowOlderTimestamp) {
    return { entry: null, reason: 'stale' }
  }
  const ownerWorktreeId =
    routing?.worktreeId ??
    existing?.worktreeId ??
    findAgentPaneWorktreeId(state, paneKey) ??
    undefined
  const ownerHostId = getExecutionHostIdForWorktree(state, ownerWorktreeId)
  const existingOwnerConnectionId = normalizeExecutionHostConnectionId(
    ownerHostId,
    existing?.connectionId
  )
  const incomingOwnerConnectionId = normalizeExecutionHostConnectionId(
    ownerHostId,
    routing?.connectionId === undefined ? existing?.connectionId : routing.connectionId
  )
  const { history, lastCompletedAssistantMessage, stateObservedAt, ...sessionName } =
    resolveSessionNameLiveEntryState(existing, payload, metadata, terminalTitle, updatedAt)
  const identity = resolveAgentStatusIdentity({
    existing:
      existing &&
      sameAgentStatusTerminalOwner(
        { connectionId: existingOwnerConnectionId, worktreeId: existing.worktreeId },
        {
          connectionId: incomingOwnerConnectionId,
          worktreeId: routing?.worktreeId ?? existing.worktreeId
        }
      )
        ? { ...existing, agentPresence: metadata?.paneOwner }
        : undefined,
    incoming: payload.agentType,
    incomingSession: metadata?.providerSession?.id,
    now: updatedAt
  })
  const commandCodeNewTurn =
    existing !== undefined &&
    isCommandCodeNewTurnWhileWorking({
      agentType: identity.agentType,
      previousState: existing.state,
      incomingState: payload.state,
      previousPrompt: existing.prompt,
      incomingPrompt: payload.prompt,
      previousPromptInteractionKey: existing.promptInteractionKey,
      incomingPromptInteractionKey: payload.promptInteractionKey
    })
  const promptInteractionKey =
    payload.promptInteractionKey ??
    (payload.prompt === existing?.prompt ? existing?.promptInteractionKey : undefined)
  const liveTiming = resolveAgentStatusLiveEntryTiming(
    existing,
    identity.agentType,
    {
      payload,
      timing,
      routing,
      metadata,
      updatedAt,
      executionHostId: ownerHostId
    },
    commandCodeNewTurn
  )
  const { turnStartedAt, turnEnd } = liveTiming
  // Fork (session-names): a provider session replacement also starts its own state clock.
  const stateStartedAt = sessionName.stateStartedAt(
    timing?.stateStartedAt,
    commandCodeNewTurn ||
      (timing?.stateStartedAt === undefined && liveTiming.stateStartedAt === updatedAt)
  )
  if (
    existing &&
    shouldSuppressInheritedTerminalStatus({
      inheritedFromActivePane: identity.inheritedFromActivePane
    })
  ) {
    return { entry: null, reason: 'suppressed-inherited-terminal' }
  }
  const runtimeOrchestration = canonicalOrchestrationForRow(state, paneKey)
  const runtimeMergedOrchestration = runtimeOrchestration
    ? mergeCurrentOrchestrationContext(existing?.orchestration, runtimeOrchestration)
    : undefined
  const payloadMergedOrchestration = payload.orchestration
    ? mergeCurrentOrchestrationContext(
        runtimeMergedOrchestration ?? existing?.orchestration,
        payload.orchestration
      )
    : undefined
  const orchestration =
    payloadMergedOrchestration ??
    runtimeMergedOrchestration ??
    (payload.state === 'done' ? existing?.orchestration : undefined)
  const conversation = localAgentConversationAcceptance(args, identity.agentType)
  const predecessorEligible = canReuseStatusProviderSession(existing, {
    agentType: identity.agentType,
    state: payload.state
  })
  const existingProviderSession = predecessorEligible ? existing.providerSession : undefined
  const providerSession =
    metadata?.providerSession ?? (!conversation.reset ? existingProviderSession : undefined)
  const providerSessionChanged =
    Boolean(metadata?.providerSession && existingProviderSession) &&
    !agentProviderSessionsEqual(
      identity.agentType,
      metadata?.providerSession,
      existingProviderSession
    )
  const statusTabId = routing?.tabId ?? existing?.tabId ?? getTabIdFromPaneKey(paneKey) ?? undefined
  const statusTerminalHandle = routing?.terminalHandle ?? existing?.terminalHandle
  const registryEntry = state.agentLaunchConfigByPaneKey[paneKey]
  const registryMatched = registryEntryMatchesStatus({
    entry: registryEntry,
    paneKey,
    agentType: identity.agentType,
    tabId: statusTabId,
    terminalHandle: statusTerminalHandle,
    launchToken: metadata?.launchToken,
    providerSession,
    existingProviderSession,
    providerSessionChanged
  })
  const matchedRegistryLaunchConfig = registryMatched ? registryEntry?.launchConfig : undefined
  const retainsResumableRecoveryIdentity = statusRetainsResumableIdentity(
    { agentType: identity.agentType, state: payload.state },
    providerSession
  )
  // Local main's note-or-null or a paired host's frame fact; an OSC update says nothing.
  const launchAttested = ownerLaunchAttested(metadata?.launchConfig, existing, identity.agentType)
  const launchConfigSource = invocationLaunchConfig({
    statement: metadata?.launchConfig,
    launchAttested,
    registry: matchedRegistryLaunchConfig,
    record: state.sleepingAgentSessionsByPaneKey[paneKey],
    agentType: identity.agentType,
    providerSession
  })
  const mainAgent = resolveAgentStatusLiveEntryMainAgent(existing, payload, identity.agentType)
  const programStatus =
    payload.programStatus === undefined ? existing?.programStatus : payload.programStatus
  // Only the host names conversations. Its row naming the conversation is authoritative, a missing
  // stamp included (a settled miss clears a pending null); an ID-less local update keeps the
  // id only for the very same agent, owner and provider key (locator included).
  const keepsExistingId =
    existing?.orcaSessionId !== undefined &&
    existing.agentType === identity.agentType &&
    (routing?.connectionId === undefined ||
      incomingOwnerConnectionId === existingOwnerConnectionId) &&
    agentProviderSessionsEqual(identity.agentType, existing.providerSession, providerSession)
  const orcaSessionId =
    metadata?.providerSession || metadata?.orcaSessionId !== undefined
      ? metadata.orcaSessionId
      : keepsExistingId
        ? existing?.orcaSessionId
        : undefined
  const entry: AgentStatusEntry = {
    state: payload.state,
    workingMode: payload.workingMode,
    prompt: payload.prompt,
    updatedAt,
    // Clockless OSC/launch writes are fresh evidence; never inherit prior observation time.
    ...(timing?.evidenceObservedAt !== undefined
      ? { evidenceObservedAt: timing.evidenceObservedAt }
      : {}),
    ...(metadata?.structuredHostOwned === true ? { structuredHostOwned: true as const } : {}),
    stateStartedAt,
    stateObservedAt,
    ...(turnStartedAt !== undefined ? { turnStartedAt } : {}),
    ...turnEnd,
    agentType: identity.agentType,
    model:
      payload.model ?? (existing?.agentType === identity.agentType ? existing.model : undefined),
    ...(payload.modelSwitchCommand ? { modelSwitchCommand: payload.modelSwitchCommand } : {}),
    paneKey,
    terminalHandle: statusTerminalHandle,
    worktreeId:
      routing?.worktreeId ??
      existing?.worktreeId ??
      findAgentPaneWorktreeId(state, paneKey) ??
      undefined,
    ...(routing?.connectionId !== undefined
      ? { connectionId: routing.connectionId }
      : existing?.connectionId !== undefined
        ? { connectionId: existing.connectionId }
        : state.sleepingAgentSessionsByPaneKey[paneKey]?.connectionId !== undefined
          ? { connectionId: state.sleepingAgentSessionsByPaneKey[paneKey].connectionId }
          : {}),
    tabId: statusTabId,
    terminalTitle: sessionName.terminalTitle,
    stateHistory: history,
    toolName: payload.toolName,
    toolInput: payload.toolInput,
    interactivePrompt: payload.interactivePrompt,
    lastAssistantMessage: payload.lastAssistantMessage,
    lastAssistantMessageIsToolOutput: payload.lastAssistantMessageIsToolOutput,
    ...(lastCompletedAssistantMessage ? { lastCompletedAssistantMessage } : {}),
    orchestration,
    ...(payload.subagentObservation ? { subagentObservation: payload.subagentObservation } : {}),
    ...liveEntryChildFields(existing, payload),
    ...(mainAgent ? { mainAgent } : {}),
    ...(providerSession ? { providerSession } : {}),
    ...(orcaSessionId !== undefined ? { orcaSessionId } : {}),
    ...(launchAttested !== undefined ? { launchAttested } : {}),
    ...(metadata?.terminalResumeEligible === false
      ? { terminalResumeEligible: false as const }
      : {}),
    // A status that reuses the pane's session keeps that session's tmux host.
    ...(metadata?.executionHost === 'shared' ||
    (!metadata?.providerSession && providerSession && existing?.executionHost === 'shared')
      ? { executionHost: 'shared' as const }
      : {}),
    ...(promptInteractionKey ? { promptInteractionKey } : {}),
    ...(payload.restoredUnconfirmed ? { restoredUnconfirmed: true } : {}),
    ...(payload.paneSleep ? { paneSleep: payload.paneSleep } : {}),
    acceptedStatusSeq: (existing?.acceptedStatusSeq ?? 0) + 1,
    ...(payload.observation ? { observation: payload.observation } : {}),
    ...(programStatus ? { programStatus } : {}),
    interrupted: payload.interrupted,
    sessionBoundary:
      payload.sessionBoundary ??
      (existing?.state === 'done' &&
      payload.state === 'done' &&
      payload.lastAssistantMessage === undefined &&
      payload.prompt === existing.prompt
        ? existing.sessionBoundary
        : undefined)
  }
  entry.firstStateStartedAt = conversationSessionStartedAt(
    entry,
    existing,
    conversation,
    conversation.source
  )
  const facts = deriveAgentStatusLiveFacts({
    state,
    paneKey,
    entry,
    existing,
    launchConfigSource,
    retainsResumableRecoveryIdentity,
    commandCodeNewTurn,
    updatedAt
  })
  return {
    entry,
    conversationSource: conversation.source,
    existing,
    ...facts,
    launchConfigSource,
    providerSession,
    providerSessionChanged,
    registryEntry,
    registryMatched,
    retainsResumableRecoveryIdentity,
    commandCodeNewTurn
  }
}
