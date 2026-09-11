import type { HookListenerState } from '../agent-hook-listener/listener-state'
import type { AgentProviderSessionMetadata } from '../agent-session-resume'
import { isCodexThreadTitleGenerationPrompt } from '../codex-thread-title-generation'

const MAX_TITLE_TASKS_PER_PANE = 64

export function shouldRejectUnbackedCodexStart(
  state: HookListenerState,
  paneKey: string,
  eventName: unknown,
  incoming: AgentProviderSessionMetadata | null | undefined
): boolean {
  const previous = state.lastStatusByPaneKey.get(paneKey)
  // Ephemeral title tasks start before exposing their prompt, without a transcript.
  return Boolean(
    eventName === 'SessionStart' &&
    incoming &&
    !incoming.transcriptPath &&
    previous?.source === 'codex' &&
    previous.providerSession?.transcriptPath &&
    previous.providerSession.id !== incoming.id
  )
}

export function shouldRejectCodexTitleTask(
  state: HookListenerState,
  paneKey: string,
  sessionId: string | undefined,
  explicitPrompt: string | undefined
): boolean {
  const known = state.codexTitleTaskSessionsByPaneKey.get(paneKey)
  if (sessionId && known?.has(sessionId)) {
    return true
  }
  if (!isCodexThreadTitleGenerationPrompt(explicitPrompt)) {
    return false
  }
  if (sessionId) {
    const sessions = known ?? new Set<string>()
    sessions.add(sessionId)
    if (sessions.size > MAX_TITLE_TASKS_PER_PANE) {
      sessions.delete(sessions.values().next().value!)
    }
    state.codexTitleTaskSessionsByPaneKey.set(paneKey, sessions)
  }
  // The task's later Stop has no prompt, but must not reclaim the user's pane either.
  return true
}
