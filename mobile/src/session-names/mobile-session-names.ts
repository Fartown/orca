import type { AiVaultSession } from '../../../src/shared/ai-vault/contracts/ai-vault-types'
import { resolveScannedSessionDisplayName } from '../../../src/shared/session-names/scanned-session-display-name'
import type { RuntimeWorktreeAgentRow } from '../../../src/shared/worktree/catalog/runtime-worktree-contracts'

/** Mobile workspace rows use the desktop's published verdict title first, then the host's conversation name. */
export function resolveMobileWorktreeAgentRowName(row: RuntimeWorktreeAgentRow): string {
  const verdictTitle = row.activity?.listed === true ? row.activity.title.trim() : ''
  return verdictTitle || row.conversationName?.trim() || ''
}

export function resolveMobileHistorySessionTitle(
  session: Pick<
    AiVaultSession,
    'id' | 'agent' | 'sessionId' | 'title' | 'providerName' | 'generatedTitle'
  > & { subagent?: AiVaultSession['subagent'] }
): string {
  return resolveScannedSessionDisplayName(session)
}
