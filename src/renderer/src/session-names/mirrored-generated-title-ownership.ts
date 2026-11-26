import type { RuntimeMobileSessionTerminalClientTab } from '../../../shared/remote-runtime/session-graph/runtime-mobile-session-tab-contracts'
import type { AiVaultSessionTitle } from '../../../shared/ai-vault/contracts/ai-vault-session-title'
import {
  generatedTitleReplacesExisting,
  generatedTitleSourceText
} from '../../../shared/agent-status/presentation/agent-generated-tab-title-rules'
import { deriveGeneratedTabTitle } from '../../../shared/agent-status/presentation/agent-tab-title'
import { isEligibleSessionNamePrompt } from '../../../shared/session-names/session-name-candidate-quality'
import type { TerminalTab } from '../../../shared/workspace-layout/terminal-tab-types'

type MirrorSlot = AiVaultSessionTitle | null | undefined
export type MirrorSessionOwner = NonNullable<TerminalTab['generatedTitleOwner']>

function liveGeneratedTitleOwner(
  surface: Pick<RuntimeMobileSessionTerminalClientTab, 'agentStatus'>,
  sessionTitle: MirrorSlot
): MirrorSessionOwner | undefined {
  if (sessionTitle?.sessionId && sessionTitle.agent) {
    return { agent: sessionTitle.agent, sessionId: sessionTitle.sessionId }
  }
  const status = surface.agentStatus
  if (
    status &&
    status.restoredUnconfirmed !== true &&
    status.providerSession?.id &&
    status.agentType &&
    status.agentType !== 'unknown'
  ) {
    return { agent: status.agentType, sessionId: status.providerSession.id }
  }
  return undefined
}

export function resolveMirroredGeneratedTitle(
  surface: Pick<
    RuntimeMobileSessionTerminalClientTab,
    'agentStatus' | 'aiVaultTitle' | 'generatedTitle' | 'resolvesSessionTitle'
  >,
  existing: Pick<TerminalTab, 'generatedTitle' | 'generatedTitleOwner'> | undefined,
  ownership: {
    retainPreviousName: boolean
    sessionTitle: MirrorSlot
    hostSlotConflicts: boolean
  }
): {
  generatedTitle: string | undefined
  generatedTitleOwner: MirrorSessionOwner | undefined
  rejectedHostGeneratedTitle: string | undefined
} {
  const authoritative = surface.resolvesSessionTitle === true
  const hostGeneratedTitle = surface.generatedTitle?.trim() || undefined
  const existingGeneratedTitle = existing?.generatedTitle?.trim() || undefined
  const liveId = surface.agentStatus?.providerSession?.id
  const liveAgent =
    surface.agentStatus?.agentType && surface.agentStatus.agentType !== 'unknown'
      ? surface.agentStatus.agentType
      : undefined
  const existingOwnerConflicts = Boolean(
    existing?.generatedTitleOwner &&
    ((liveId && existing.generatedTitleOwner.sessionId !== liveId) ||
      (liveAgent && existing.generatedTitleOwner.agent !== liveAgent) ||
      (ownership.sessionTitle &&
        (existing.generatedTitleOwner.sessionId !== ownership.sessionTitle.sessionId ||
          existing.generatedTitleOwner.agent !== ownership.sessionTitle.agent)))
  )
  const retainClientTitle =
    ownership.retainPreviousName && !authoritative && !existingOwnerConflicts
  const owner = liveGeneratedTitleOwner(surface, ownership.sessionTitle)
  const retainedOwner =
    retainClientTitle && existingGeneratedTitle
      ? (existing?.generatedTitleOwner ?? owner)
      : undefined
  if (!hostGeneratedTitle || ownership.hostSlotConflicts) {
    return {
      generatedTitle: retainClientTitle ? existingGeneratedTitle : undefined,
      generatedTitleOwner: retainedOwner,
      rejectedHostGeneratedTitle: ownership.hostSlotConflicts ? hostGeneratedTitle : undefined
    }
  }
  if (authoritative) {
    return {
      generatedTitle: hostGeneratedTitle,
      generatedTitleOwner: owner,
      rejectedHostGeneratedTitle: undefined
    }
  }
  const unownedBoundary =
    surface.agentStatus?.sessionBoundary === true && !surface.agentStatus?.providerSession?.id
  const livePromptMatchesGeneratedTitle = Boolean(
    surface.agentStatus?.prompt &&
    surface.agentStatus.restoredUnconfirmed !== true &&
    deriveGeneratedTabTitle(generatedTitleSourceText(surface.agentStatus)) === hostGeneratedTitle
  )
  const publishedSlotOwnsGeneratedTitle = Boolean(
    surface.aiVaultTitle &&
    ownership.sessionTitle &&
    surface.aiVaultTitle.agent === ownership.sessionTitle.agent &&
    surface.aiVaultTitle.sessionId === ownership.sessionTitle.sessionId &&
    surface.aiVaultTitle.generatedTitle?.trim() === hostGeneratedTitle
  )
  const canReplaceExistingGeneratedTitle =
    !retainClientTitle ||
    !existingGeneratedTitle ||
    !isEligibleSessionNamePrompt(existingGeneratedTitle) ||
    Boolean(
      surface.agentStatus &&
      surface.agentStatus.restoredUnconfirmed !== true &&
      generatedTitleReplacesExisting(surface.agentStatus)
    )
  // On non-authoritative hosts, a bare generatedTitle string lacks session identity; only cold start, exact retained continuity, matching live prompt derivation, or a verified slot's generatedTitle proves field ownership.
  const exactRetainedMatch = retainClientTitle && existingGeneratedTitle === hostGeneratedTitle
  const hostGeneratedTitleOwned =
    (!existing && !unownedBoundary) ||
    exactRetainedMatch ||
    (canReplaceExistingGeneratedTitle &&
      (livePromptMatchesGeneratedTitle || publishedSlotOwnsGeneratedTitle))
  if (hostGeneratedTitleOwned) {
    return {
      generatedTitle: hostGeneratedTitle,
      generatedTitleOwner: exactRetainedMatch ? (existing?.generatedTitleOwner ?? owner) : owner,
      rejectedHostGeneratedTitle: undefined
    }
  }
  return {
    generatedTitle: retainClientTitle ? existingGeneratedTitle : undefined,
    generatedTitleOwner: retainedOwner,
    rejectedHostGeneratedTitle: hostGeneratedTitle
  }
}
