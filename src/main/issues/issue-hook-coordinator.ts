import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import type { AgentHookServer } from '../agent-hooks/server'
import {
  IssueHookSnapshotLiveCoordinator,
  type IssueHookObservedEvent
} from './issue-hook-snapshot-live-coordinator'
import type {
  IssueHookEvidenceReconciler,
  IssueHookEvidenceSnapshot
} from './issue-hook-evidence-reconciliation'
import type { RoundRecordHookEvent, RoundRecordIngestor } from './round-record-ingestor'

export type IssueAgentHookSource = Pick<
  AgentHookServer,
  | 'getStatusSnapshot'
  | 'getProviderSessionIdentities'
  | 'getHydratedAuthorityCommitments'
  | 'getCurrentAuthorityObservations'
  | 'subscribeEnrichedStatus'
  | 'subscribeStatusChanges'
  | 'subscribeProviderSessionChanges'
  | 'subscribePaneStatusClear'
>

export type BufferedHookEvent = RoundRecordHookEvent & IssueHookObservedEvent

export function currentEvidencePaneKeys(source: IssueAgentHookSource): ReadonlySet<string> {
  return new Set([
    ...source.getStatusSnapshot().map((status) => status.paneKey),
    ...source.getProviderSessionIdentities().map((identity) => identity.paneKey),
    ...source.getCurrentAuthorityObservations().map((observation) => observation.paneKey)
  ])
}

export function createIssueHookCoordinator(
  source: IssueAgentHookSource,
  ingestor: RoundRecordIngestor,
  evidenceReconciler: IssueHookEvidenceReconciler
): IssueHookSnapshotLiveCoordinator<IssueHookEvidenceSnapshot, BufferedHookEvent> {
  return new IssueHookSnapshotLiveCoordinator<IssueHookEvidenceSnapshot, BufferedHookEvent>({
    subscribe: (listener) =>
      source.subscribeEnrichedStatus((event) => listener(toBufferedLiveHookEvent(event))),
    readSnapshot: async () => readIssueHookSnapshot(source),
    ingestSnapshot: async (snapshot) => {
      await evidenceReconciler.reconcile(snapshot)
      for (const status of snapshot.statuses) {
        await ingestor.ingest(toBufferedSnapshotEvent(status))
      }
    },
    ingestEvent: (event) => ingestor.ingest(event).then(() => undefined),
    snapshotEventKeys: (snapshot) => snapshot.statuses.map(hookEventKey),
    eventKey: hookEventKey,
    onIngestError: (error) => {
      console.error('[issues] live hook ingestion failed:', error)
    }
  })
}

export function readIssueHookSnapshot(source: IssueAgentHookSource): IssueHookEvidenceSnapshot {
  return {
    statuses: source.getStatusSnapshot(),
    providerIdentities: source.getProviderSessionIdentities(),
    hydratedAuthorities: source.getHydratedAuthorityCommitments(),
    currentAuthorities: source.getCurrentAuthorityObservations()
  }
}

function toBufferedSnapshotEvent(event: AgentStatusIpcPayload): BufferedHookEvent {
  return {
    paneKey: event.paneKey,
    tabId: event.tabId,
    worktreeId: event.worktreeId,
    connectionId: event.connectionId,
    launchToken: event.launchToken,
    providerSession: event.providerSession,
    providerSessionOnly: event.providerSessionOnly,
    restoredUnconfirmed: event.restoredUnconfirmed ? true : undefined,
    isReplay: true,
    hasExplicitPrompt: false,
    promptInteractionKey: event.promptInteractionKey,
    stateStartedAt: event.stateStartedAt,
    receivedAt: event.receivedAt,
    observedAt: event.receivedAt,
    payload: {
      state: event.state,
      agentType: event.agentType,
      prompt: event.prompt,
      interactivePrompt: event.interactivePrompt,
      lastAssistantMessage: event.lastAssistantMessage,
      sessionBoundary: event.sessionBoundary
    }
  }
}

function toBufferedLiveHookEvent(event: unknown): BufferedHookEvent {
  const row = event as {
    paneKey: string
    tabId?: string
    worktreeId?: string
    connectionId: string | null
    launchToken?: string
    providerSession?: AgentStatusIpcPayload['providerSession']
    providerSessionOnly?: boolean
    hookEventName?: string
    restoredUnconfirmed?: true
    hasExplicitPrompt?: boolean
    promptInteractionKey?: string
    providerPromptId?: string
    providerTurnId?: string
    receivedAt: number
    stateStartedAt: number
    payload: AgentStatusIpcPayload
  }
  return {
    paneKey: row.paneKey,
    tabId: row.tabId,
    worktreeId: row.worktreeId,
    connectionId: row.connectionId,
    launchToken: row.launchToken,
    providerSession: row.providerSession,
    providerSessionOnly: row.providerSessionOnly,
    hookEventName: row.hookEventName,
    restoredUnconfirmed: row.restoredUnconfirmed,
    isReplay: false,
    hasExplicitPrompt: row.hasExplicitPrompt,
    promptInteractionKey: row.promptInteractionKey,
    providerPromptId: row.providerPromptId,
    providerTurnId: row.providerTurnId,
    stateStartedAt: row.stateStartedAt,
    receivedAt: row.receivedAt,
    observedAt: row.receivedAt,
    payload: {
      state: row.payload.state,
      agentType: row.payload.agentType,
      prompt: row.payload.prompt,
      interactivePrompt: row.payload.interactivePrompt,
      lastAssistantMessage: row.payload.lastAssistantMessage,
      sessionBoundary: row.payload.sessionBoundary
    }
  }
}

function hookEventKey(
  event: Pick<BufferedHookEvent, 'paneKey' | 'receivedAt' | 'stateStartedAt'>
): string {
  return `${event.paneKey}:${event.stateStartedAt}:${event.receivedAt}`
}
