import type { ConversationTitleSource } from '../../shared/issues/types'

export type ConversationTitleState = {
  title: string | null
  titleSource: ConversationTitleSource | null
}

export type ConversationTitleWrite = {
  title: string | null
  titleSource: ConversationTitleSource
}

export type ConversationTitleDecision =
  | { kind: 'write'; title: string | null; titleSource: ConversationTitleSource | null }
  | { kind: 'unchanged' }
  | { kind: 'rejected'; reason: 'user-frozen' | 'already-minted' }

/**
 * The single gate every conversation title write goes through.
 *
 * Rules: a user-set name freezes out automatic sources; automatic sources may
 * keep overwriting each other (follow mode); minting happens at most once.
 * Clearing (`user` + null title) resets to the unnamed state, which re-enables
 * automatic follow.
 */
export function applyConversationTitleAuthority(
  current: ConversationTitleState,
  target: ConversationTitleWrite
): ConversationTitleDecision {
  if (target.titleSource === 'user') {
    // Clearing a name undoes any manual freeze and re-opens automatic follow.
    const next: ConversationTitleState =
      target.title === null
        ? { title: null, titleSource: null }
        : { title: target.title, titleSource: 'user' }
    return sameState(current, next) ? { kind: 'unchanged' } : { kind: 'write', ...next }
  }
  if (current.titleSource === 'user') {
    return { kind: 'rejected', reason: 'user-frozen' }
  }
  if (target.title === null) {
    // Automatic sources never erase a name; failure must not degrade state.
    return { kind: 'unchanged' }
  }
  if (target.titleSource === 'minted') {
    // A replayed attach re-mints the same string: idempotent, not an error.
    if (sameState(current, { title: target.title, titleSource: 'minted' })) {
      return { kind: 'unchanged' }
    }
    if (current.title !== null && current.titleSource !== null) {
      return { kind: 'rejected', reason: 'already-minted' }
    }
    return { kind: 'write', title: target.title, titleSource: 'minted' }
  }
  // Provider follow: overwrites minted and earlier provider values.
  return sameState(current, { title: target.title, titleSource: 'provider' })
    ? { kind: 'unchanged' }
    : { kind: 'write', title: target.title, titleSource: 'provider' }
}

// Why: a source-only transition (same text, minted -> provider) must count as a
// change, otherwise the follow state machine wedges on identical strings.
function sameState(left: ConversationTitleState, right: ConversationTitleState): boolean {
  return left.title === right.title && left.titleSource === right.titleSource
}
