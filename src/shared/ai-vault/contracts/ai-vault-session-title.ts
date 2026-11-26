import type { AiVaultAgent, AiVaultSessionTitleKind } from './ai-vault-types'
import type { ExecutionHostId } from '../../execution-host/execution-host'
import type {
  ProviderNameEvidence,
  SessionNameEvidence
} from '../../session-names/session-name-contract'

export const AI_VAULT_SESSION_TITLE_REQUEST_MAX_COUNT = 64

export type AiVaultSessionTitle = {
  agent: Extract<AiVaultAgent, 'claude' | 'codex'>
  sessionId: string
  title: string
  /** Absent from older hosts and saved tabs: unclassified, ranked like a fallback. */
  kind?: AiVaultSessionTitleKind
  /** Optional because persisted tabs and paired peers upgrade independently. */
  source?: 'provider' | 'conversation-override'
  providerName?: ProviderNameEvidence
  generatedTitle?: string | null
  manualTitle?: string | null
}

/** A tab's provider title names only the pane running that session, not every pane in the tab. */
export function aiVaultTitleOfSession(
  title: AiVaultSessionTitle | null | undefined,
  agent: string | null | undefined,
  sessionId: string | undefined
): AiVaultSessionTitle | null {
  return title && title.agent === agent && title.sessionId === sessionId ? title : null
}

export type AiVaultSessionTitleRequest = {
  agent: AiVaultSessionTitle['agent']
  sessionId: string
  transcriptPath?: string
}

export type AiVaultSessionTitlesArgs = {
  executionHostScope?: ExecutionHostId
  requests: AiVaultSessionTitleRequest[]
}

export type AiVaultSessionTitlesResult = {
  titles: AiVaultSessionTitle[]
  nameEvidence?: SessionNameEvidence[]
}

export function isAiVaultTitleAgent(
  agent: string | null | undefined
): agent is AiVaultSessionTitle['agent'] {
  return agent === 'claude' || agent === 'codex'
}

export { sessionNameSlotEqual as sameAiVaultSessionTitle } from '../../session-names/session-name-slot'
