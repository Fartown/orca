import type { ProviderNameEvidence } from '../../shared/session-names/session-name-contract'

/** A rename wins over Claude's generated name, which wins over the agent name. */
export function claudeSessionNameEvidence(titles: {
  customTitle: string | null | undefined
  aiTitle: string | null
  agentName: string | null
}): ProviderNameEvidence {
  const title = titles.customTitle ?? titles.aiTitle ?? titles.agentName
  if (!title) {
    return { kind: 'absent' }
  }
  return {
    kind: 'named',
    title,
    field: titles.customTitle
      ? 'custom-title.customTitle'
      : titles.aiTitle
        ? 'ai-title.aiTitle'
        : 'agent-name.agentName'
  }
}
