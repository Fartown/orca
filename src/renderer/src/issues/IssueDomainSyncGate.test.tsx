// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hosts = vi.hoisted(() => {
  const state: { ids: string[] } = { ids: [] }
  return { state }
})
const sync = vi.hoisted(() => ({ update: vi.fn(), stop: vi.fn() }))

vi.mock('../components/sidebar/use-sidebar-host-scope-options', () => ({
  // A fresh array on every render, as the real hook returns on any host status change.
  useSidebarHostScopeOptions: () => ({ hostOptions: hosts.state.ids.map((id) => ({ id })) })
}))
vi.mock('./issue-domain-sync', () => ({ startIssueDomainSync: () => sync }))
vi.mock('./conversation-canonical-titles', () => ({
  registerConversationCanonicalTitles: () => () => {}
}))

import { IssueDomainSyncGate } from './IssueDomainSyncGate'

describe('IssueDomainSyncGate', () => {
  let root: Root

  beforeEach(() => {
    sync.update.mockReset()
    sync.stop.mockReset()
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    document.body.replaceChildren()
  })

  it('hands the sync a new host set only when the set itself changes', () => {
    hosts.state.ids = ['local', 'runtime:env-a']
    act(() => root.render(createElement(IssueDomainSyncGate)))
    for (let i = 0; i < 5; i += 1) {
      act(() => root.render(createElement(IssueDomainSyncGate)))
    }
    expect(sync.update).toHaveBeenCalledTimes(1)
    expect(sync.update).toHaveBeenLastCalledWith({
      routes: ['local', 'runtime:env-a'],
      filter: 'all',
      issuesVisible: false
    })

    hosts.state.ids = ['local', 'runtime:env-a', 'ssh:target-a']
    act(() => root.render(createElement(IssueDomainSyncGate)))
    expect(sync.update).toHaveBeenCalledTimes(2)

    act(() => root.unmount())
    expect(sync.stop).toHaveBeenCalledTimes(1)
    root = createRoot(document.body.appendChild(document.createElement('div')))
  })
})
