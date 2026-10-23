import { launchAiVaultSessionInNewTab as launchHistory } from '@/lib/launch-ai-vault-session'
import { useAppStore } from '@/store'
import {
  recordTerminalLaunchOrigin,
  withTerminalLaunchOrigin,
  type TerminalLaunchOrigin
} from './launch-origin'

export function launchDroppedAiVaultSession(
  args: Parameters<typeof launchHistory>[0]
): ReturnType<typeof launchHistory> {
  return launchObservedHistory('ai-vault-drop-resume', args)
}

export function launchRevealedAiVaultSession(
  args: Parameters<typeof launchHistory>[0]
): ReturnType<typeof launchHistory> {
  return launchObservedHistory('ai-vault-reveal-resume', args)
}

function launchObservedHistory(
  origin: TerminalLaunchOrigin,
  args: Parameters<typeof launchHistory>[0]
): ReturnType<typeof launchHistory> {
  recordTerminalLaunchOrigin(origin, args, useAppStore.getState())
  const result = withTerminalLaunchOrigin(origin, () => launchHistory(args))
  if (result.tabId !== null) {
    recordTerminalLaunchOrigin(
      origin,
      { ...args, tabId: result.tabId, eventPhase: 'created' },
      useAppStore.getState()
    )
  }
  return result
}
