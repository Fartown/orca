import { beforeEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ setPreference: vi.fn(async () => {}) }))
const appStore = vi.hoisted(() => {
  let state: { taskPageData: { taskSource?: string } } = { taskPageData: { taskSource: 'github' } }
  const listeners = new Set<(next: typeof state, previous: typeof state) => void>()
  return {
    getState: () => state,
    setState: (patch: typeof state) => {
      const previous = state
      state = { ...state, ...patch }
      for (const listener of listeners) {
        listener(state, previous)
      }
    },
    subscribe: (listener: (next: typeof state, previous: typeof state) => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
})
vi.mock('@/store', () => ({ useAppStore: appStore }))
vi.mock('./local-tasks-runtime-client', () => ({
  localTasksClient: { setPreference: fixture.setPreference }
}))

import {
  activateLocalTaskSource,
  bindLocalTaskSourceActivation
} from './local-task-source-activation'
import { localTaskPageStore } from './local-task-page-store'

beforeEach(() => {
  appStore.setState({ taskPageData: { taskSource: 'github' } })
  localTaskPageStore.setState({ localActive: false })
  fixture.setPreference.mockClear()
})

it('clears the upstream source on Local activation and ignores a replay of the same source', () => {
  const release = bindLocalTaskSourceActivation()
  activateLocalTaskSource()
  expect(appStore.getState().taskPageData.taskSource).toBeUndefined()
  expect(localTaskPageStore.getState().localActive).toBe(true)
  appStore.setState({ taskPageData: { taskSource: 'github' } })
  expect(localTaskPageStore.getState().localActive).toBe(false)
  localTaskPageStore.getState().setLocalActive(true)
  appStore.setState({ taskPageData: { taskSource: 'github' } })
  expect(localTaskPageStore.getState().localActive).toBe(true)
  release()
})
