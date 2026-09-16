import { describe, expect, it } from 'vitest'
import { resolveMarkdownRichModeUnsupportedMessage } from '../editor/markdown-rich-mode'
import {
  OVERRIDABLE_RICH_MARKDOWN_UNSUPPORTED_REASONS,
  resolveRichMarkdownUnsupportedOverride
} from './rich-markdown-unsupported-override'

describe('resolveRichMarkdownUnsupportedOverride', () => {
  it('keeps the banner and stays inactive while the user has not overridden', () => {
    expect(
      resolveRichMarkdownUnsupportedOverride({ unsupportedMessage: 'blocked', overridden: false })
    ).toEqual({ unsupportedMessage: 'blocked', overrideActive: false })
  })

  it('clears the banner and reports an active override once the user opted in', () => {
    expect(
      resolveRichMarkdownUnsupportedOverride({ unsupportedMessage: 'blocked', overridden: true })
    ).toEqual({ unsupportedMessage: null, overrideActive: true })
  })

  it('does not report an override on a document with no unsupported syntax', () => {
    // Why: the same per-file flag also lifts the size gate, so a clean large
    // document must not claim rich mode is holding unsafe content.
    expect(
      resolveRichMarkdownUnsupportedOverride({ unsupportedMessage: null, overridden: true })
    ).toEqual({ unsupportedMessage: null, overrideActive: false })
  })
})

describe('message-keyed override equivalence', () => {
  it('resolves every overridable reason to a non-null banner message', () => {
    for (const reason of OVERRIDABLE_RICH_MARKDOWN_UNSUPPORTED_REASONS) {
      expect(resolveMarkdownRichModeUnsupportedMessage(reason)).toEqual(expect.any(String))
    }
  })

  it('resolves the non-overridable reasons to no message, so they never reach the button', () => {
    expect(resolveMarkdownRichModeUnsupportedMessage('other')).toBeNull()
    expect(resolveMarkdownRichModeUnsupportedMessage(null)).toBeNull()
  })
})
