import {
  buildAgentSessionContinuationPrompt,
  type AgentSessionContinuationRequest
} from '../../../../../../shared/agent-session/conversation-context/agent-session-continuation'
import { AI_VAULT_SESSION_HANDOFF_TIMEOUT_MS } from '../../../../../../shared/ai-vault/contracts/ai-vault-session-handoff'
import {
  prepareAiVaultSessionContinuation as prepareSharedAiVaultSessionContinuation,
  type AiVaultSessionContinuationTarget
} from '../../../../../../shared/ai-vault/resume/ai-vault-session-continuation'
import type { AiVaultSession } from '../../../../../../shared/ai-vault/contracts/ai-vault-types'
import { withTimeout } from '../../../../../../shared/concurrency/promise-timeout-fallback'
import { getScannedSessionDisplayName } from '@/session-names/session-name-display'

type HistoryContinuationTarget = AiVaultSessionContinuationTarget & { session: AiVaultSession }

/** A database row's host saves this one conversation first; null when nothing usable came back. */
export async function loadDatabaseAiVaultSessionContinuation(
  target: HistoryContinuationTarget
): Promise<AgentSessionContinuationRequest | null> {
  const { session } = target
  const saved = await withTimeout(
    window.api.aiVault.prepareSessionHandoff({
      agent: session.agent,
      filePath: session.filePath,
      sessionId: session.sessionId,
      executionHostId: session.executionHostId
    }),
    AI_VAULT_SESSION_HANDOFF_TIMEOUT_MS,
    {}
  )
  const request = prepareAiVaultSessionContinuation({
    ...target,
    savedTranscriptPath: saved.transcriptPath
  })
  return buildAgentSessionContinuationPrompt(request.source, 'focused') ? request : null
}

/** A desktop hand-off names its source by the row's public display name, not the scanner's title. */
export function prepareAiVaultSessionContinuation(
  args: HistoryContinuationTarget & { savedTranscriptPath?: string }
): AgentSessionContinuationRequest {
  return prepareSharedAiVaultSessionContinuation({
    ...args,
    session: { ...args.session, title: getScannedSessionDisplayName(args.session) }
  })
}
