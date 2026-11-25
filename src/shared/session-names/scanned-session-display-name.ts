import type { AiVaultSessionTitle } from '../ai-vault/contracts/ai-vault-session-title'
import type { AiVaultSession } from '../ai-vault/contracts/ai-vault-types'
import { mintAgentSessionFallbackTitle } from '../agent-session-fallback-title'
import { resolveSessionDisplayTitle } from '../session-display-title'

/** Claude child transcripts may carry their parent's resumable session ID. */
export function hasIndependentScannedSessionIdentity(
  session: Pick<AiVaultSession, 'sessionId'> & { subagent?: AiVaultSession['subagent'] }
): boolean {
  return !session.subagent || session.subagent.parentSessionId !== session.sessionId
}

/** Shared public display name for scanned History rows across desktop and mobile. */
export function resolveScannedSessionDisplayName(
  session: Pick<
    AiVaultSession,
    'id' | 'agent' | 'sessionId' | 'title' | 'providerName' | 'generatedTitle'
  > & { subagent?: AiVaultSession['subagent'] },
  options: {
    cached?: Pick<AiVaultSessionTitle, 'providerName' | 'generatedTitle'>
    userTitle?: string | null
  } = {}
): string {
  const independentIdentity = hasIndependentScannedSessionIdentity(session)
  const providerName =
    (independentIdentity ? options.cached?.providerName : undefined) ?? session.providerName
  const cachedGenerated = independentIdentity ? options.cached?.generatedTitle : undefined
  return (
    resolveSessionDisplayTitle({
      providerTitle: providerName?.kind === 'named' ? providerName.title : null,
      userTitle: independentIdentity ? options.userTitle : null,
      generatedTitle:
        cachedGenerated ?? session.generatedTitle ?? (!providerName ? session.title : null),
      identityFallbackTitle: mintAgentSessionFallbackTitle(
        session.agent,
        independentIdentity ? session.sessionId : session.id
      )
    })?.title ?? session.title
  )
}
