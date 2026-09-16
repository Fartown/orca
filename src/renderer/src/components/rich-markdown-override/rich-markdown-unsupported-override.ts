import type { MarkdownRichModeUnsupportedReason } from '../editor/markdown-rich-mode'

/**
 * The code-mode gates a user may knowingly lift. Each one is a round-trip
 * rewrite risk, not a crash, so the trade is theirs to make. `'other'` carries
 * no banner copy and stays blocked.
 */
export const OVERRIDABLE_RICH_MARKDOWN_UNSUPPORTED_REASONS: readonly MarkdownRichModeUnsupportedReason[] =
  ['html-or-jsx', 'reference-links', 'footnotes']

export type RichMarkdownUnsupportedOverrideState = {
  /** Message the fallback banner shows; null once rich mode is allowed through. */
  unsupportedMessage: string | null
  /** The user accepted the rewrite risk, so rich mode owns an unsafe document. */
  overrideActive: boolean
}

/**
 * Why message-keyed rather than reason-keyed: the render model only carries the
 * resolved message, and every overridable reason resolves to a non-null one
 * while `'other'` resolves to null — pinned by this module's test.
 *
 * `overridden` is the per-file rich-mode override the size fallback already
 * stores. One flag covers both gates on purpose: a large document holding HTML
 * trips them together, and asking the user twice for one decision buys nothing.
 */
export function resolveRichMarkdownUnsupportedOverride({
  unsupportedMessage,
  overridden
}: {
  unsupportedMessage: string | null
  overridden: boolean
}): RichMarkdownUnsupportedOverrideState {
  if (unsupportedMessage === null || !overridden) {
    return { unsupportedMessage, overrideActive: false }
  }
  return { unsupportedMessage: null, overrideActive: true }
}
