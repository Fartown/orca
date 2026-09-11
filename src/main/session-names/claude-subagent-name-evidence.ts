import type { ProviderNameEvidence } from '../../shared/session-names/session-name-contract'

/** A child transcript's explicit rename wins over its Provider-authored Task description. */
export function resolveClaudeSubagentNameEvidence(
  transcriptName: ProviderNameEvidence | undefined,
  description: string | null
): ProviderNameEvidence | undefined {
  return transcriptName?.kind === 'named' || !description
    ? transcriptName
    : { kind: 'named', title: description, field: 'subagent.meta.description' }
}
