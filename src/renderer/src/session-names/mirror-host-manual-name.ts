import type { RuntimeMobileSessionTerminalClientTab } from '../../../shared/remote-runtime/session-graph/runtime-mobile-session-tab-contracts'
import type { AiVaultSessionTitle } from '../../../shared/ai-vault/contracts/ai-vault-session-title'

/** An explicit host rename is manual evidence, not an unverified Provider name. */
export function mirrorHostManualName(
  slot: AiVaultSessionTitle | null | undefined,
  manual: string | null | undefined
): AiVaultSessionTitle | null | undefined {
  return slot && manual !== undefined ? { ...slot, manualTitle: manual?.trim() || null } : slot
}

type MirrorSlot = AiVaultSessionTitle | null | undefined

export function mirroredSessionNameOwnership(
  surface: Pick<
    RuntimeMobileSessionTerminalClientTab,
    'leafId' | 'agentStatus' | 'aiVaultTitle' | 'resolvesSessionTitle'
  >,
  previousSlot: MirrorSlot,
  previousLeafId: string | null | undefined
) {
  const status = surface.agentStatus
  const id = status?.providerSession?.id
  const conflicts = (slot: MirrorSlot): boolean =>
    Boolean(
      slot &&
      ((id && id !== slot.sessionId) ||
        (status?.agentType && status.agentType !== 'unknown' && status.agentType !== slot.agent))
    )
  const published = surface.aiVaultTitle
  const authoritative = surface.resolvesSessionTitle === true
  const unownedBoundary = status?.sessionBoundary === true && !id
  const hostSlotConflicts = conflicts(published) || Boolean(unownedBoundary && published)
  const retainPreviousName =
    !unownedBoundary &&
    (!id || previousSlot?.sessionId === id) &&
    (!previousLeafId || previousLeafId === surface.leafId) &&
    !(authoritative && !published?.title.trim()) &&
    !conflicts(previousSlot) &&
    !(
      previousSlot &&
      authoritative &&
      published &&
      (published.agent !== previousSlot.agent || published.sessionId !== previousSlot.sessionId)
    )
  let sessionTitle: MirrorSlot = null
  if (authoritative) {
    if (!hostSlotConflicts && published?.title.trim()) {
      sessionTitle = published
    }
  } else if (retainPreviousName && previousSlot) {
    sessionTitle = previousSlot
  } else if (id && published?.sessionId === id && status?.agentType === published.agent) {
    // A saved headless slot can seed the client only when the current pane identifies its owner.
    sessionTitle = published
  }
  return { retainPreviousName, sessionTitle, hostSlotConflicts }
}
