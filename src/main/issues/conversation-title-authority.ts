export type ConversationTitleState = {
  userTitle: string | null
  providerTitle: string | null
}

export type ConversationTitleTarget =
  | { kind: 'user'; title: string | null }
  | { kind: 'provider'; title: string }

export type ConversationTitleDecision =
  | { kind: 'unchanged' }
  | { kind: 'write-user'; title: string | null }
  | { kind: 'write-provider'; title: string }

/** Keeps user override and Provider snapshot independent. */
export function applyConversationTitleAuthority(
  current: ConversationTitleState,
  target: ConversationTitleTarget
): ConversationTitleDecision {
  if (target.kind === 'user') {
    return current.userTitle === target.title
      ? { kind: 'unchanged' }
      : { kind: 'write-user', title: target.title }
  }
  return current.providerTitle === target.title
    ? { kind: 'unchanged' }
    : { kind: 'write-provider', title: target.title }
}
