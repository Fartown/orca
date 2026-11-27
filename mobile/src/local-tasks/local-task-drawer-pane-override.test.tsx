import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BridgeInitRoute } from '../mobile-web-shell/bridge/protocol/bridge-init-route'
import type { MobileSessionTab } from '../session/tabs/mobile-session-tabs'

vi.mock('../navigation/workspace-execution-host', () => ({
  useWorkspaceExecutionHost: () => 'local'
}))
vi.mock('../navigation/workspace-route-handoff', () => ({
  useWorkspaceRouteHandoff: () => ({ push: vi.fn() })
}))

type RouteUpdateListener = (route: BridgeInitRoute | null) => void

const bridge = vi.hoisted(() => {
  const held: {
    route: BridgeInitRoute | null
    listeners: RouteUpdateListener[]
    cleared: { param: string; value: string }[]
  } = { route: null, listeners: [], cleared: [] }
  return held
})

const pageUrl = vi.hoisted(() => {
  const url: {
    params: { paneKey?: string }
    setParams: (next: { paneKey?: string }) => void
  } = {
    params: {},
    setParams: (next) => {
      url.params = { ...url.params, ...next }
    }
  }
  return url
})
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => pageUrl.params,
  useNavigation: () => pageUrl
}))

vi.mock('../transport/connection/client-context.web', () => ({
  usePageBridgeClient: () => ({
    getShellSession: () => ({ route: bridge.route }),
    onRouteUpdate: (listener: RouteUpdateListener) => {
      bridge.listeners.push(listener)
      return () => {
        bridge.listeners = bridge.listeners.filter((held) => held !== listener)
      }
    },
    clearRouteParam: (param: string, value: string) => {
      bridge.cleared.push({ param, value })
      return true
    }
  })
}))

import { useNotificationPaneNavigation } from '../session/tabs/use-notification-pane-navigation'

// Use a real leaf id; invalid keys would test only the closed-pane path.
const LEAF = '11111111-1111-4111-8111-111111111111'

const TABS: MobileSessionTab[] = [
  {
    type: 'terminal',
    id: 'first',
    parentTabId: 'tab-a',
    leafId: LEAF,
    title: 'first',
    terminal: 'pty-a',
    isActive: true
  },
  {
    type: 'terminal',
    id: 'second',
    parentTabId: 'tab-b',
    leafId: LEAF,
    title: 'second',
    terminal: 'pty-b',
    isActive: false
  }
]

const switched: MobileSessionTab[] = []

function Probe({ paneKeyOverride }: { paneKeyOverride: string }): null {
  useNotificationPaneNavigation({
    sessionTabs: TABS,
    terminalsLoaded: true,
    switchSessionTab: (tab) => switched.push(tab),
    worktreeId: 'wt-1',
    paneKeyOverride
  })
  return null
}

beforeEach(() => {
  bridge.route = null
  bridge.listeners = []
  bridge.cleared.length = 0
  switched.length = 0
  pageUrl.params = {}
})

describe('the task drawer session pane', () => {
  it('uses an explicit drawer pane without consuming or following the page route', () => {
    bridge.route = { pathname: '/h/host-1/local-tasks', params: { paneKey: `tab-a:${LEAF}` } }
    pageUrl.params = { paneKey: `tab-a:${LEAF}` }
    act(() => {
      create(createElement(Probe, { paneKeyOverride: `tab-b:${LEAF}` }))
    })
    expect(switched.map((tab) => tab.id)).toEqual(['second'])
    expect(bridge.cleared).toEqual([])
    expect(pageUrl.params.paneKey).toBe(`tab-a:${LEAF}`)
    expect(bridge.listeners).toHaveLength(0)
  })
})
