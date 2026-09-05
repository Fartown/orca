import { describe, expect, it } from 'vitest'
import { resolveSessionDisplayTitle } from './session-display-title'

describe('resolveSessionDisplayTitle', () => {
  it('uses one stable priority across all title sources', () => {
    const candidates = {
      userTitle: 'User name',
      providerTitle: 'Current Provider name',
      providerTitleSnapshot: 'Provider snapshot',
      generatedTitle: 'Generated name',
      liveTitle: 'Live name',
      identityFallbackTitle: 'Codex 01a0420e'
    }

    expect(resolveSessionDisplayTitle(candidates)).toEqual({ title: 'User name', source: 'user' })
    expect(resolveSessionDisplayTitle({ ...candidates, userTitle: null })).toEqual({
      title: 'Current Provider name',
      source: 'provider'
    })
    expect(
      resolveSessionDisplayTitle({ ...candidates, userTitle: null, providerTitle: null })
    ).toEqual({ title: 'Provider snapshot', source: 'provider-snapshot' })
    expect(
      resolveSessionDisplayTitle({
        ...candidates,
        userTitle: null,
        providerTitle: null,
        providerTitleSnapshot: null
      })
    ).toEqual({ title: 'Generated name', source: 'generated' })
  })

  it('uses meaningful live title before the identity fallback', () => {
    expect(
      resolveSessionDisplayTitle({
        liveTitle: 'Live name',
        identityFallbackTitle: 'Claude abc12345'
      })
    ).toEqual({ title: 'Live name', source: 'live' })
  })

  it('demotes Provider identity fallbacks below generated and live titles', () => {
    expect(
      resolveSessionDisplayTitle({
        providerTitle: 'Codex 01a0420e',
        providerTitleSnapshot: 'Codex 01a0420e',
        generatedTitle: 'Investigate title projection',
        identityFallbackTitle: 'Codex 01a0420e'
      })
    ).toEqual({ title: 'Investigate title projection', source: 'generated' })
  })

  it('keeps an explicit user title even when it equals the fallback text', () => {
    expect(
      resolveSessionDisplayTitle({
        userTitle: 'Codex 01a0420e',
        providerTitle: 'Provider name',
        identityFallbackTitle: 'Codex 01a0420e'
      })
    ).toEqual({ title: 'Codex 01a0420e', source: 'user' })
  })

  it('trims candidates and returns null when every candidate is blank', () => {
    expect(resolveSessionDisplayTitle({ providerTitle: '  Provider name  ' })).toEqual({
      title: 'Provider name',
      source: 'provider'
    })
    expect(resolveSessionDisplayTitle({ userTitle: ' ', liveTitle: '\n' })).toBeNull()
  })
})
