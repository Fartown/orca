import type { AiVaultSessionTitle } from '../ai-vault-session-title'
import { mintAgentSessionFallbackTitle } from '../agent-session-fallback-title'
import {
  resolveSessionDisplayTitle,
  type SessionDisplayTitleCandidates
} from '../session-display-title'
import {
  providerNameEvidenceEqual,
  retainConfirmedProviderName,
  type SessionNameEvidence
} from './session-name-contract'

/** An old peer's mixed-source title is a fallback, never proof of a native name. */
export function sessionNameSlotCandidates(
  slot: AiVaultSessionTitle | null | undefined
): SessionDisplayTitleCandidates {
  const legacyTitle =
    slot?.title === (slot ? mintAgentSessionFallbackTitle(slot.agent, slot.sessionId) : '')
      ? null
      : slot?.title
  return {
    providerTitle: slot?.providerName?.kind === 'named' ? slot.providerName.title : null,
    userTitle: slot?.manualTitle ?? (slot?.source === 'conversation-override' ? slot.title : null),
    generatedTitle:
      slot?.generatedTitle ??
      (slot && !slot.providerName && slot.source !== 'conversation-override' ? legacyTitle : null)
  }
}

export function sessionNameSlotEqual(
  left: AiVaultSessionTitle | null | undefined,
  right: AiVaultSessionTitle | null | undefined
): boolean {
  return (
    left?.agent === right?.agent &&
    left?.sessionId === right?.sessionId &&
    left?.title === right?.title &&
    left?.source === right?.source &&
    left?.manualTitle === right?.manualTitle &&
    left?.generatedTitle === right?.generatedTitle &&
    providerNameEvidenceEqual(left?.providerName, right?.providerName)
  )
}

export function projectSessionNameSlot(args: {
  agent: AiVaultSessionTitle['agent']
  sessionId: string
  previous?: AiVaultSessionTitle | null
  title?: AiVaultSessionTitle
  evidence?: SessionNameEvidence
  manualTitle: string | null
}): AiVaultSessionTitle | null {
  const previous =
    args.previous?.agent === args.agent && args.previous.sessionId === args.sessionId
      ? args.previous
      : null
  const observation = args.evidence?.providerName ?? args.title?.providerName
  const providerName = observation
    ? retainConfirmedProviderName(previous?.providerName, observation)
    : previous?.providerName
  const legacyTitle =
    args.title?.title ?? (previous?.source !== 'conversation-override' ? previous?.title : null)
  const generatedTitle =
    args.evidence?.generatedTitle ??
    args.title?.generatedTitle ??
    previous?.generatedTitle ??
    (!providerName ? legacyTitle : undefined)
  const slot: AiVaultSessionTitle = {
    agent: args.agent,
    sessionId: args.sessionId,
    title: legacyTitle ?? '',
    ...(providerName ? { providerName } : {}),
    ...(generatedTitle !== undefined ? { generatedTitle } : {}),
    manualTitle: args.manualTitle
  }
  const resolved = resolveSessionDisplayTitle({
    ...sessionNameSlotCandidates(slot),
    identityFallbackTitle: mintAgentSessionFallbackTitle(args.agent, args.sessionId)
  })
  if (!resolved) {
    return null
  }
  return {
    ...slot,
    title: resolved.title,
    source: resolved.source === 'user' ? 'conversation-override' : 'provider'
  }
}
