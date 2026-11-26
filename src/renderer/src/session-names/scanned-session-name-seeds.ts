import {
  isAiVaultTitleAgent,
  type AiVaultSessionTitle
} from '../../../shared/ai-vault/contracts/ai-vault-session-title'
import type { AiVaultSession } from '../../../shared/ai-vault/contracts/ai-vault-types'
import type { ExecutionHostId } from '../../../shared/execution-host/execution-host'
import { canonicalSessionTitleKey } from '../lib/canonical-session-titles'
import { hasIndependentScannedSessionIdentity } from './scanned-session-name-identity'
import type { SessionNameRequest } from './session-name-read-snapshot'

export function collectScannedSessionNameSeeds(
  sessions: readonly AiVaultSession[],
  records: ReadonlyMap<string, AiVaultSessionTitle>
) {
  const byHost = new Map<ExecutionHostId, AiVaultSessionTitle[]>()
  const refreshes: SessionNameRequest[] = []
  for (const session of sessions) {
    if (!isAiVaultTitleAgent(session.agent) || !hasIndependentScannedSessionIdentity(session)) {
      continue
    }
    const key = canonicalSessionTitleKey(session.executionHostId, session.agent, session.sessionId)
    const previous = records.get(key)
    // A changed scan requests confirmation; it cannot overwrite a newer exact read.
    if (previous) {
      if (
        (session.providerName?.kind === 'named' &&
          (previous.providerName?.kind !== 'named' ||
            previous.providerName.title !== session.providerName.title)) ||
        (!previous.generatedTitle && session.generatedTitle)
      ) {
        refreshes.push({
          executionHostId: session.executionHostId,
          agent: session.agent,
          sessionId: session.sessionId,
          transcriptPath: session.filePath
        })
      }
      continue
    }
    const titles = byHost.get(session.executionHostId) ?? []
    titles.push({
      agent: session.agent,
      sessionId: session.sessionId,
      title: session.title,
      providerName: session.providerName,
      generatedTitle: session.generatedTitle
    })
    byHost.set(session.executionHostId, titles)
  }
  return { byHost, refreshes }
}
