import { describe, expect, it } from 'vitest'
import { applyConversationTitleAuthority } from './conversation-title-authority'

describe('conversation title authority', () => {
  it('mints once into an unnamed row and never re-mints', () => {
    expect(
      applyConversationTitleAuthority(
        { title: null, titleSource: null },
        { title: 'Claude a1b2c3d4', titleSource: 'minted' }
      )
    ).toEqual({ kind: 'write', title: 'Claude a1b2c3d4', titleSource: 'minted' })
    expect(
      applyConversationTitleAuthority(
        { title: 'Claude a1b2c3d4', titleSource: 'minted' },
        { title: 'Claude ffffffff', titleSource: 'minted' }
      )
    ).toEqual({ kind: 'rejected', reason: 'already-minted' })
    expect(
      applyConversationTitleAuthority(
        { title: 'Real name', titleSource: 'provider' },
        { title: 'Claude a1b2c3d4', titleSource: 'minted' }
      )
    ).toEqual({ kind: 'rejected', reason: 'already-minted' })
  })

  it('follows provider renames over minted and earlier provider values', () => {
    expect(
      applyConversationTitleAuthority(
        { title: 'Claude a1b2c3d4', titleSource: 'minted' },
        { title: 'Fix the flaky test', titleSource: 'provider' }
      )
    ).toEqual({ kind: 'write', title: 'Fix the flaky test', titleSource: 'provider' })
    expect(
      applyConversationTitleAuthority(
        { title: 'Fix the flaky test', titleSource: 'provider' },
        { title: 'Fix flaky sidebar test', titleSource: 'provider' }
      )
    ).toEqual({ kind: 'write', title: 'Fix flaky sidebar test', titleSource: 'provider' })
  })

  it('promotes source even when the text is identical (source-only transition)', () => {
    expect(
      applyConversationTitleAuthority(
        { title: 'Claude a1b2c3d4', titleSource: 'minted' },
        { title: 'Claude a1b2c3d4', titleSource: 'provider' }
      )
    ).toEqual({ kind: 'write', title: 'Claude a1b2c3d4', titleSource: 'provider' })
    expect(
      applyConversationTitleAuthority(
        { title: 'Same', titleSource: 'provider' },
        { title: 'Same', titleSource: 'provider' }
      )
    ).toEqual({ kind: 'unchanged' })
  })

  it('freezes a user name against every automatic source, allows re-rename', () => {
    const frozen = { title: 'My name', titleSource: 'user' as const }
    expect(
      applyConversationTitleAuthority(frozen, { title: 'AI name', titleSource: 'provider' })
    ).toEqual({ kind: 'rejected', reason: 'user-frozen' })
    expect(
      applyConversationTitleAuthority(frozen, { title: 'Claude a1b2c3d4', titleSource: 'minted' })
    ).toEqual({ kind: 'rejected', reason: 'user-frozen' })
    expect(
      applyConversationTitleAuthority(frozen, { title: 'Renamed again', titleSource: 'user' })
    ).toEqual({ kind: 'write', title: 'Renamed again', titleSource: 'user' })
    expect(
      applyConversationTitleAuthority(frozen, { title: 'My name', titleSource: 'user' })
    ).toEqual({ kind: 'unchanged' })
  })

  it('clearing undoes the freeze and re-opens automatic follow', () => {
    expect(
      applyConversationTitleAuthority(
        { title: 'My name', titleSource: 'user' },
        { title: null, titleSource: 'user' }
      )
    ).toEqual({ kind: 'write', title: null, titleSource: null })
    // Clearing an already-unnamed row is a no-op, matching today's behavior.
    expect(
      applyConversationTitleAuthority(
        { title: null, titleSource: null },
        { title: null, titleSource: 'user' }
      )
    ).toEqual({ kind: 'unchanged' })
    // After clearing, provider follow works again.
    expect(
      applyConversationTitleAuthority(
        { title: null, titleSource: null },
        { title: 'AI name', titleSource: 'provider' }
      )
    ).toEqual({ kind: 'write', title: 'AI name', titleSource: 'provider' })
  })

  it('automatic sources never erase an existing name', () => {
    expect(
      applyConversationTitleAuthority(
        { title: 'Something', titleSource: 'provider' },
        { title: null, titleSource: 'provider' }
      )
    ).toEqual({ kind: 'unchanged' })
  })

  it('null-source rows accept provider writes (migration marks real manual names as user)', () => {
    expect(
      applyConversationTitleAuthority(
        { title: 'Unclassified', titleSource: null },
        { title: 'AI name', titleSource: 'provider' }
      )
    ).toEqual({ kind: 'write', title: 'AI name', titleSource: 'provider' })
  })
})
