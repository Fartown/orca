import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import { deriveGeneratedTabTitle } from '../../../shared/agent-tab-title'
import { isOrcaDispatchPrompt } from '../lib/agent-row-primary-text'
import type { AiVaultTitleRequest } from '../lib/ai-vault-tab-title-requests'
import type { AppState } from '../store/types'

export function firstSessionNamePrompt(entry: AgentStatusEntry): string | null {
  const sessionId = entry.providerSession?.id
  const history = sessionId
    ? entry.stateHistory.filter(
        (item) =>
          item.sessionName?.agentType === entry.agentType &&
          item.sessionName?.providerSession?.id === sessionId
      )
    : []
  return (
    [...history, { prompt: entry.prompt, startedAt: entry.stateStartedAt }]
      .toSorted((a, b) => a.startedAt - b.startedAt)
      .find((item) => !isOrcaDispatchPrompt(item.prompt) && deriveGeneratedTabTitle(item.prompt))
      ?.prompt ?? null
  )
}

export function projectSessionPromptTitles(state: AppState, requests: AiVaultTitleRequest[]): void {
  if (state.settings?.tabAutoGenerateTitle !== true) {
    return
  }
  for (const request of requests) {
    const entry = request.paneKey
      ? (state.agentStatusByPaneKey[request.paneKey] ??
        state.retainedAgentsByPaneKey[request.paneKey]?.entry)
      : undefined
    if (
      !entry ||
      entry.agentType !== request.agent ||
      entry.providerSession?.id !== request.providerSession.id
    ) {
      continue
    }
    const prompt = firstSessionNamePrompt(entry)
    if (prompt) {
      state.setGeneratedTabTitleFromAgentPrompt(entry.paneKey, prompt)
    }
  }
}
