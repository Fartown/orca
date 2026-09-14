import type { HookListenerState } from '../agent-hook-listener/listener-state'
import type { AgentProviderSessionMetadata } from '../agent-session-resume'
import { isCodexThreadTitleGenerationPrompt } from '../codex-thread-title-generation'

const MAX_TITLE_TASKS_PER_PANE = 64

/**
 * Codex runs internal turns (thread titles, conversation recaps) as throwaway sessions on
 * the user's own pane. They never write a rollout, so a missing transcript — not the prompt
 * wording — is what marks them; rejecting only SessionStart let a recap Stop rename the pane.
 */
export function shouldRejectUnbackedCodexSessionEvent(
  state: HookListenerState,
  paneKey: string,
  incoming: AgentProviderSessionMetadata | null | undefined
): boolean {
  const previous = state.lastStatusByPaneKey.get(paneKey)
  // No pane memory: a real session whose first event precedes its rollout must still be
  // able to claim the pane on its next, transcript-backed event.
  return Boolean(
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
