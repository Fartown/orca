import { describe, expect, it } from 'vitest'
import { ROUND_TEXT_PREVIEW_MAX_BYTES } from '../../shared/issues/constants'
import { getUtf8ByteLength } from '../../shared/utf8-byte-limits'
import { normalizeRoundTextPreview, preferStrongerRoundPreview } from './round-record-text'

describe('Round preview text', () => {
  it('always labels hook text as runtime-preview even when it fits', () => {
    expect(normalizeRoundTextPreview({ text: 'complete-looking hook text' }, 'hook')).toEqual({
      text: 'complete-looking hook text',
      completeness: 'runtime-preview'
    })
  })

  it('bounds UTF-8 text and lets reconciled preview strengthen runtime preview', () => {
    const bounded = normalizeRoundTextPreview({ text: '界'.repeat(10_000) }, 'hook')
    expect(getUtf8ByteLength(bounded.text ?? '')).toBeLessThanOrEqual(ROUND_TEXT_PREVIEW_MAX_BYTES)
    expect(
      preferStrongerRoundPreview(
        bounded,
        normalizeRoundTextPreview({ text: 'reconciled' }, 'reconciled')
      )
    ).toEqual({ text: 'reconciled', completeness: 'reconciled-preview' })
  })
})
