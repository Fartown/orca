import { describe, expect, it } from 'vitest'
import { applyConversationTitleAuthority } from './conversation-title-authority'

describe('conversation title authority', () => {
  it('writes user overrides without replacing the Provider snapshot', () => {
    expect(
      applyConversationTitleAuthority(
        { userTitle: null, providerTitle: 'Provider name' },
        { kind: 'user', title: 'My name' }
      )
    ).toEqual({ kind: 'write-user', title: 'My name' })
    expect(
      applyConversationTitleAuthority(
        { userTitle: 'My name', providerTitle: 'Provider name' },
        { kind: 'user', title: 'My name' }
      )
    ).toEqual({ kind: 'unchanged' })
  })

  it('clears only the user override', () => {
    expect(
      applyConversationTitleAuthority(
        { userTitle: 'My name', providerTitle: 'Provider name' },
        { kind: 'user', title: null }
      )
    ).toEqual({ kind: 'write-user', title: null })
  })

  it('refreshes Provider snapshots even while a user override exists', () => {
    expect(
      applyConversationTitleAuthority(
        { userTitle: 'My name', providerTitle: 'Old Provider name' },
        { kind: 'provider', title: 'New Provider name' }
      )
    ).toEqual({ kind: 'write-provider', title: 'New Provider name' })
    expect(
      applyConversationTitleAuthority(
        { userTitle: 'My name', providerTitle: 'New Provider name' },
        { kind: 'provider', title: 'New Provider name' }
      )
    ).toEqual({ kind: 'unchanged' })
  })
})
