import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import { isCodexThreadTitleGenerationPrompt } from '../../shared/codex-thread-title-generation'
import type {
  AgentHookAuthorityEvidence,
  AgentHookProviderSessionIdentity
} from '../agent-hooks/server'
import type { ConversationHookIdentityIngestor } from './conversation-hook-identity-ingestor'

export type IssueHookEvidenceSnapshot = {
  statuses: AgentStatusIpcPayload[]
  providerIdentities: AgentHookProviderSessionIdentity[]
  hydratedAuthorities: readonly AgentHookAuthorityEvidence[]
  currentAuthorities: readonly AgentHookAuthorityEvidence[]
}

export class IssueHookEvidenceReconciler {
  constructor(private readonly identityIngestor: ConversationHookIdentityIngestor) {}

  async reconcile(snapshot: IssueHookEvidenceSnapshot): Promise<void> {
    const statusesByPane = new Map(snapshot.statuses.map((status) => [status.paneKey, status]))
    for (const provider of snapshot.providerIdentities) {
      const status = statusesByPane.get(provider.paneKey)
      const match = matchingAuthority(snapshot, provider, status)
      if (!status || !match || !status.agentType) {
        continue
      }
      if (
        status.agentType === 'codex' &&
        !provider.transcriptPath &&
        isCodexThreadTitleGenerationPrompt(status.prompt)
      ) {
        continue
      }
      const { authority, restoredUnconfirmed } = match
      const providerSession =
        status.providerSession?.id === provider.sessionId
          ? {
              ...status.providerSession,
              ...(provider.transcriptPath ? { transcriptPath: provider.transcriptPath } : {})
            }
          : {
              key: 'session_id' as const,
              id: provider.sessionId,
              ...(provider.transcriptPath ? { transcriptPath: provider.transcriptPath } : {})
            }
      await this.identityIngestor.ingest({
        paneKey: provider.paneKey,
        tabId: authority.tabId ?? status.tabId ?? null,
        worktreeId: provider.worktreeId ?? authority.worktreeId ?? status.worktreeId,
        connectionId: authority.connectionId,
        providerSession,
        ...(restoredUnconfirmed ? { restoredUnconfirmed: true as const } : {}),
        isReplay: true,
        payload: { state: status.state, agentType: status.agentType },
        receivedAt: Math.max(status.receivedAt, authority.observedAt)
      })
    }
  }
}

function matchingAuthority(
  snapshot: IssueHookEvidenceSnapshot,
  provider: AgentHookProviderSessionIdentity,
  status: AgentStatusIpcPayload | undefined
): { authority: AgentHookAuthorityEvidence; restoredUnconfirmed: boolean } | undefined {
  const current = snapshot.currentAuthorities.find((authority) => {
    if (authority.paneKey !== provider.paneKey) {
      return false
    }
    if (status && authority.connectionId !== status.connectionId) {
      return false
    }
    const expectedWorktreeId = provider.worktreeId ?? status?.worktreeId
    return (
      !authority.worktreeId || !expectedWorktreeId || authority.worktreeId === expectedWorktreeId
    )
  })
  if (current) {
    return { authority: current, restoredUnconfirmed: false }
  }
  const hydrated = snapshot.hydratedAuthorities.find((authority) => {
    if (authority.paneKey !== provider.paneKey) {
      return false
    }
    if (status && authority.connectionId !== status.connectionId) {
      return false
    }
    const expectedWorktreeId = provider.worktreeId ?? status?.worktreeId
    return (
      !authority.worktreeId || !expectedWorktreeId || authority.worktreeId === expectedWorktreeId
    )
  })
  return hydrated ? { authority: hydrated, restoredUnconfirmed: true } : undefined
}
