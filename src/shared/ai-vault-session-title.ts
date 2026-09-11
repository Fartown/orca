import type { AiVaultAgent } from './ai-vault-types'
import type { ExecutionHostId } from './execution-host'
import type {
  ProviderNameEvidence,
  SessionNameEvidence
} from './session-names/session-name-contract'

export const AI_VAULT_SESSION_TITLE_REQUEST_MAX_COUNT = 64

export type AiVaultSessionTitle = {
  agent: Extract<AiVaultAgent, 'claude' | 'codex'>
  sessionId: string
  title: string
  /** Optional because persisted tabs and paired peers upgrade independently. */
  source?: 'provider' | 'conversation-override'
  providerName?: ProviderNameEvidence
  generatedTitle?: string | null
  manualTitle?: string | null
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
