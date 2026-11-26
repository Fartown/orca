import type { RuntimeMobileSessionTerminalClientTab } from '../../../shared/remote-runtime/session-graph/runtime-mobile-session-tab-contracts'
import type { AiVaultSessionTitle } from '../../../shared/ai-vault/contracts/ai-vault-session-title'
import type { AgentStatusEntry } from '../../../shared/agent-status/contracts/agent-status-types'
import { generatedTitleSourceText } from '../../../shared/agent-status/presentation/agent-generated-tab-title-rules'
import { deriveGeneratedTabTitle } from '../../../shared/agent-status/presentation/agent-tab-title'
import { agentProviderSessionsEqual } from '../../../shared/agent-session/lifecycle/resume/agent-provider-session-equality'
import { makePaneKey } from '../../../shared/workspace-layout/stable-pane-id'
import type {
  TerminalLayoutSnapshot,
  TerminalTab
} from '../../../shared/workspace-layout/terminal-tab-types'

/** An explicit host rename is manual evidence, not an unverified Provider name. */
export function mirrorHostManualName(
  slot: AiVaultSessionTitle | null | undefined,
  manual: string | null | undefined
): AiVaultSessionTitle | null | undefined {
  return slot && manual !== undefined ? { ...slot, manualTitle: manual?.trim() || null } : slot
}

export function previousMirroredLeafPtyId(
  leafId: string,
  existingTab: Pick<TerminalTab, 'ptyId'> | undefined,
  existingLayout: Pick<TerminalLayoutSnapshot, 'activeLeafId' | 'ptyIdsByLeafId'> | undefined
): string | null {
  const layoutPtyId = existingLayout?.ptyIdsByLeafId?.[leafId]
  if (layoutPtyId) {
    return layoutPtyId
  }
  if (!existingLayout?.activeLeafId || existingLayout.activeLeafId === leafId) {
    return existingTab?.ptyId ?? null
  }
  return null
}

export function hasMirroredTerminalBindingChanged(
  previousPtyId: string | null | undefined,
  nextPtyId: string | null | undefined
): boolean {
  return Boolean(previousPtyId && nextPtyId && previousPtyId !== nextPtyId)
}

export function collectReplacedMirroredTerminalPaneKeys(
  existingTabs: readonly Pick<TerminalTab, 'id' | 'ptyId'>[],
  existingLayoutsByTabId: Readonly<Record<string, TerminalLayoutSnapshot>>,
  mirroredTerminalTabs: readonly {
    tab: Pick<TerminalTab, 'id'>
    layout: Pick<TerminalLayoutSnapshot, 'ptyIdsByLeafId'>
  }[]
): ReadonlySet<string> {
  const existingById = new Map(existingTabs.map((tab) => [tab.id, tab]))
  const replaced = new Set<string>()
  for (const { tab, layout } of mirroredTerminalTabs) {
    const existingTab = existingById.get(tab.id)
    const existingLayout = existingLayoutsByTabId[tab.id]
    for (const [leafId, nextPtyId] of Object.entries(layout.ptyIdsByLeafId ?? {})) {
      const previousPtyId = previousMirroredLeafPtyId(leafId, existingTab, existingLayout)
      if (hasMirroredTerminalBindingChanged(previousPtyId, nextPtyId)) {
        replaced.add(makePaneKey(tab.id, leafId))
      }
    }
  }
  return replaced
}

export function hostAgentStatusSupersedesClientSession(
  existing:
    | (Pick<AgentStatusEntry, 'agentType' | 'providerSession'> &
        Partial<Pick<AgentStatusEntry, 'state'>>)
    | undefined,
  hostEntry:
    | (Pick<
        AgentStatusEntry,
        'agentType' | 'providerSession' | 'sessionBoundary' | 'restoredUnconfirmed'
      > &
        Partial<Pick<AgentStatusEntry, 'state'>>)
    | null
    | undefined,
  existingConversation?: Pick<AgentStatusEntry, 'providerSession'> & {
    agent?: AgentStatusEntry['agentType']
  }
): boolean {
  if (!existing || !hostEntry || hostEntry.restoredUnconfirmed === true) {
    return false
  }
  const agentChanged = Boolean(
    existing.agentType &&
    existing.agentType !== 'unknown' &&
    hostEntry.agentType &&
    hostEntry.agentType !== 'unknown' &&
    existing.agentType !== hostEntry.agentType
  )
  if (agentChanged) {
    return true
  }
  const clientSession =
    existing.providerSession ??
    (existingConversation && existingConversation.agent === existing.agentType
      ? existingConversation.providerSession
      : undefined)
  const sameProviderSession = Boolean(
    clientSession &&
    hostEntry.providerSession &&
    agentProviderSessionsEqual(hostEntry.agentType, clientSession, hostEntry.providerSession)
  )
  if (sameProviderSession) {
    return false
  }
  if (clientSession && hostEntry.providerSession) {
    return true
  }
  if (hostEntry.sessionBoundary !== true) {
    return false
  }
  // A stale idle SessionStart carrying a session id cannot wipe a working client OSC turn that cleared its prior id on done->working.
  return !(
    !clientSession &&
    hostEntry.providerSession &&
    hostEntry.state === 'done' &&
    existing.state !== undefined &&
    existing.state !== 'done'
  )
}

type MirrorSlot = AiVaultSessionTitle | null | undefined

export function mirroredSessionNameOwnership(
  surface: Pick<
    RuntimeMobileSessionTerminalClientTab,
    'leafId' | 'agentStatus' | 'aiVaultTitle' | 'resolvesSessionTitle'
  >,
  previousSlot: MirrorSlot,
  previousLeafId: string | null | undefined,
  boundTerminalChanged = false
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
  const terminalBindingBroken =
    boundTerminalChanged &&
    !(
      id &&
      previousSlot?.sessionId === id &&
      (!status?.agentType ||
        status.agentType === 'unknown' ||
        status.agentType === previousSlot.agent)
    )
  const retainPreviousName =
    !unownedBoundary &&
    !terminalBindingBroken &&
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
  const baseHostSlotConflicts = conflicts(published) || Boolean(unownedBoundary && published)
  let sessionTitle: MirrorSlot = null
  if (authoritative) {
    if (!baseHostSlotConflicts && published?.title.trim()) {
      sessionTitle = published
    }
  } else if (retainPreviousName && previousSlot) {
    sessionTitle = previousSlot
  } else if (id && published?.sessionId === id && status?.agentType === published.agent) {
    // A saved headless slot can seed the client only when the current pane identifies its owner.
    sessionTitle = published
  }
  // A headless host's cached slot without a matching live owner cannot leak its saved title or task.
  const unownedHeadlessSlot = Boolean(
    !authoritative &&
    published &&
    (!sessionTitle ||
      published.sessionId !== sessionTitle.sessionId ||
      published.agent !== sessionTitle.agent)
  )
  const hostSlotConflicts = baseHostSlotConflicts || unownedHeadlessSlot
  return { retainPreviousName, sessionTitle, hostSlotConflicts }
}

export function resolveMirroredGeneratedTitle(
  surface: Pick<
    RuntimeMobileSessionTerminalClientTab,
    'agentStatus' | 'generatedTitle' | 'resolvesSessionTitle'
  >,
  existing: Pick<TerminalTab, 'generatedTitle'> | undefined,
  ownership: {
    retainPreviousName: boolean
    hostSlotConflicts: boolean
  }
): {
  generatedTitle: string | undefined
  rejectedHostGeneratedTitle: string | undefined
} {
  const authoritative = surface.resolvesSessionTitle === true
  const hostGeneratedTitle = surface.generatedTitle?.trim() || undefined
  const existingGeneratedTitle = existing?.generatedTitle?.trim() || undefined
  const retainClientTitle = ownership.retainPreviousName && !authoritative
  if (!hostGeneratedTitle || ownership.hostSlotConflicts) {
    return {
      generatedTitle: retainClientTitle ? existingGeneratedTitle : undefined,
      rejectedHostGeneratedTitle: ownership.hostSlotConflicts ? hostGeneratedTitle : undefined
    }
  }
  if (authoritative) {
    return { generatedTitle: hostGeneratedTitle, rejectedHostGeneratedTitle: undefined }
  }
  const livePromptMatchesGeneratedTitle = Boolean(
    surface.agentStatus?.prompt &&
    deriveGeneratedTabTitle(generatedTitleSourceText(surface.agentStatus)) === hostGeneratedTitle
  )
  const staleCarryover =
    !ownership.retainPreviousName &&
    Boolean(existingGeneratedTitle) &&
    hostGeneratedTitle === existingGeneratedTitle &&
    !livePromptMatchesGeneratedTitle
  // On non-authoritative hosts, a repeated slotless generatedTitle after retirement has no owner unless a live session ID or matching prompt proves it.
  const hostGeneratedTitleOwned =
    !staleCarryover &&
    (!existing ||
      (retainClientTitle && Boolean(existingGeneratedTitle)) ||
      Boolean(surface.agentStatus?.providerSession?.id) ||
      livePromptMatchesGeneratedTitle)
  if (hostGeneratedTitleOwned) {
    return { generatedTitle: hostGeneratedTitle, rejectedHostGeneratedTitle: undefined }
  }
  return {
    generatedTitle: retainClientTitle ? existingGeneratedTitle : undefined,
    rejectedHostGeneratedTitle: hostGeneratedTitle
  }
}
