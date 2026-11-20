import type { AiVaultSessionTitle } from '../ai-vault/contracts/ai-vault-session-title'
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
  // A peer without evidence fields (upstream builds) still classifies its title; trust only its explicit 'named'.
  const peerNamed = slot && !slot.providerName && !slot.source && slot.kind === 'named'
  return {
    providerTitle:
      slot?.providerName?.kind === 'named'
        ? slot.providerName.title
        : peerNamed
          ? (legacyTitle ?? null)
          : null,
    userTitle: slot?.manualTitle ?? (slot?.source === 'conversation-override' ? slot.title : null),
    generatedTitle:
      slot?.generatedTitle ??
      (slot && !peerNamed && !slot.providerName && slot.source !== 'conversation-override'
        ? legacyTitle
        : null)
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
    left?.kind === right?.kind &&
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
  // Upstream readers of `kind` rank a session's own name (manual or provider) above quick-command labels.
  const named =
    resolved.source === 'user' ||
    resolved.source === 'provider' ||
    resolved.source === 'provider-snapshot'
  return {
    ...slot,
    title: resolved.title,
    kind: named ? 'named' : 'fallback',
    source: resolved.source === 'user' ? 'conversation-override' : 'provider'
  }
}
