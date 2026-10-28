import { createElement, useEffect, useState } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { MobileLocalTasksScreen } from './MobileLocalTasksScreen'

const fixture = vi.hoisted(
  (): {
    connection: string
    mounts: number
    error: string | null
    streamEnded: boolean
    retries: number
    resubscriptions: number
  } => ({
    connection: 'connected',
    mounts: 0,
    error: null,
    streamEnded: false,
    retries: 0,
    resubscriptions: 0
  })
)
vi.mock('react-native', () => ({
  ActivityIndicator: 'activity',
  Pressable: 'pressable',
  Text: 'text',
  View: 'view'
}))
vi.mock('expo-router', () => ({ useLocalSearchParams: () => ({ hostId: 'h' }) }))
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0 }) }))
vi.mock('lucide-react-native', () => ({ ChevronLeft: 'left', Monitor: 'monitor' }))
vi.mock('./local-tasks-styles', () => ({ localTaskStyles: {} }))
vi.mock('../components/host-protocol-gates-context', () => ({
  useOptionalHostProtocolGates: () => ({
    statusPending: false,
    statusReadable: true,
    hostCapabilities: ['local-tasks.v1']
  })
}))
vi.mock('../navigation/route-handoff', () => ({ useRouteHandoff: () => ({ back: () => {} }) }))
vi.mock('../navigation/route-param-reader', () => ({ firstParam: (value: string) => value }))
vi.mock('../transport/host-client-hooks', () => ({
  useHostClient: () => ({
    client: fixture.connection === 'connected' ? {} : null,
    state: fixture.connection
  })
}))
vi.mock('../transport/host-store', () => ({ loadHosts: async () => [{ id: 'h', name: 'desk' }] }))
vi.mock('./use-local-tasks-library', () => ({
  useLocalTasksLibrary: () => ({
    api: {},
    status: null,
    loaded: true,
    error: fixture.error,
    streamEnded: fixture.streamEnded,
    retryFailed: () => {
      fixture.retries += 1
    },
    resubscribe: () => {
      fixture.resubscriptions += 1
    }
  })
}))
vi.mock('./local-tasks-library-screen', () => ({
  LocalTasksLibraryScreen: (props: { readOnly: boolean }) => {
    const [draft] = useState('retained draft')
    useEffect(() => {
      fixture.mounts += 1
    }, [])
    return createElement('library', { draft, readOnly: props.readOnly })
  }
}))

describe('loaded mobile local task screen', () => {
  it('keeps the library component and its draft mounted while reconnecting', async () => {
    fixture.connection = 'connected'
    fixture.mounts = 0
    fixture.error = null
    fixture.streamEnded = false
    let renderer: ReactTestRenderer | undefined
    await act(async () => {
      renderer = create(createElement(MobileLocalTasksScreen))
    })
    fixture.connection = 'reconnecting'
    await act(async () => {
      renderer?.update(createElement(MobileLocalTasksScreen))
    })
    expect(renderer?.root.findByProps({ draft: 'retained draft' }).props.draft).toBe(
      'retained draft'
    )
    expect(renderer?.root.findByProps({ draft: 'retained draft' }).props.readOnly).toBe(true)
    expect(fixture.mounts).toBe(1)
    await act(async () => renderer?.unmount())
  })

  it('retries a failed read from a loaded form without remounting it', async () => {
    fixture.connection = 'connected'
    fixture.error = 'read failed'
    fixture.streamEnded = false
    fixture.retries = 0
    fixture.resubscriptions = 0
    fixture.mounts = 0
    let renderer: ReactTestRenderer | undefined
    await act(async () => {
      renderer = create(createElement(MobileLocalTasksScreen))
    })
    await act(async () =>
      renderer?.root.findByProps({ testID: 'local-tasks-notice-action' }).props.onPress()
    )
    expect(fixture.retries).toBe(1)
    expect(fixture.resubscriptions).toBe(0)
    expect(fixture.mounts).toBe(1)
    expect(renderer?.root.findByProps({ draft: 'retained draft' }).props.draft).toBe(
      'retained draft'
    )
    await act(async () => renderer?.unmount())
  })

  it('re-subscribes only on an explicit stream-end action', async () => {
    fixture.connection = 'connected'
    fixture.error = null
    fixture.streamEnded = true
    fixture.retries = 0
    fixture.resubscriptions = 0
    let renderer: ReactTestRenderer | undefined
    await act(async () => {
      renderer = create(createElement(MobileLocalTasksScreen))
    })
    expect(fixture.resubscriptions).toBe(0)
    await act(async () =>
      renderer?.root.findByProps({ testID: 'local-tasks-notice-action' }).props.onPress()
    )
    expect(fixture.resubscriptions).toBe(1)
    expect(fixture.retries).toBe(0)
    await act(async () => renderer?.unmount())
  })

  it('offers no host read or re-subscribe action while disconnected', async () => {
    fixture.connection = 'reconnecting'
    fixture.error = 'earlier read failed'
    fixture.streamEnded = true
    fixture.retries = 0
    fixture.resubscriptions = 0
    let renderer: ReactTestRenderer | undefined
    await act(async () => {
      renderer = create(createElement(MobileLocalTasksScreen))
    })
    expect(renderer?.root.findAllByProps({ testID: 'local-tasks-notice-action' })).toHaveLength(0)
    expect(fixture.retries).toBe(0)
    expect(fixture.resubscriptions).toBe(0)
    await act(async () => renderer?.unmount())
  })
})
