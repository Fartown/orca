import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_TASKS_RUNTIME_CAPABILITY } from '../../../src/shared/local-tasks/local-tasks-capability'
import type { ConnectionState } from '../transport/types'

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 }
}))
vi.mock('lucide-react-native', () => ({ ListChecks: 'ListChecks' }))

import { HostStatusGatesContext } from '../components/host-protocol-gates-context'
import { hostScreenStyles } from '../host-screen/host-screen-styles'
import { localTaskHostHeaderActions } from './LocalTasksHostEntryButton'

let renderer: ReactTestRenderer | null = null
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

function render(args: {
  statusReadable: boolean
  capabilities: string[]
  connState?: ConnectionState
  embedded?: boolean
}) {
  const controller = {
    hostId: 'h',
    connState: args.connState ?? 'connected',
    hostCapabilities: args.capabilities,
    embedded: args.embedded ?? false,
    actions: { navigateFromHostList: () => {} }
  }
  const gates = {
    hostCapabilities: args.capabilities,
    floatingWorkspaceEnabled: false,
    desktopAppVersion: null,
    compatVerdict: { kind: 'ok' as const },
    hostProtocolWindow: { protocolVersion: undefined, minCompatibleMobileVersion: undefined },
    statusPending: !args.statusReadable,
    statusReadable: args.statusReadable
  }
  act(() => {
    renderer = create(
      createElement(
        HostStatusGatesContext.Provider,
        { value: gates },
        localTaskHostHeaderActions(controller)
      )
    )
  })
  const tree = renderer?.toJSON()
  return tree && !Array.isArray(tree) ? tree : null
}

describe("the host screen header's local tasks button", () => {
  it('holds its place while the status is unread, so its neighbours never move', () => {
    const slot = render({ statusReadable: false, capabilities: [] })
    act(() => renderer?.unmount())
    const button = render({ statusReadable: true, capabilities: [LOCAL_TASKS_RUNTIME_CAPABILITY] })
    expect(slot?.props.accessibilityElementsHidden).toBe(true)
    expect(slot?.props.style).toBe(hostScreenStyles.searchToggle)
    expect(button?.props.accessibilityRole).toBe('button')
    expect([button?.props.style].flat()[0]).toBe(hostScreenStyles.searchToggle)
    act(() => renderer?.unmount())
    expect(render({ statusReadable: true, capabilities: [] })).toBeNull()
  })

  it('dims out of contact exactly as Accounts and Tasks beside it do', () => {
    const toolbar = render({
      statusReadable: true,
      capabilities: [LOCAL_TASKS_RUNTIME_CAPABILITY],
      connState: 'disconnected'
    })
    expect([toolbar?.props.style].flat()).not.toContain(hostScreenStyles.toolbarIconDisabled)
    act(() => renderer?.unmount())
    const sidebar = render({
      statusReadable: true,
      capabilities: [LOCAL_TASKS_RUNTIME_CAPABILITY],
      connState: 'disconnected',
      embedded: true
    })
    expect([sidebar?.props.style].flat()).toContain(hostScreenStyles.toolbarIconDisabled)
  })
})
