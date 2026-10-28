import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { startLocalTasksChangeFeed } from './local-tasks-change-feed'
import { useLocalTasksLibrary, type LocalTasksLibrary } from './use-local-tasks-library'

vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove: () => {} }) } }))
vi.mock('./local-tasks-change-feed', () => ({ startLocalTasksChangeFeed: vi.fn(() => () => {}) }))

describe('mobile local task recovery controls', () => {
  it('retries only the failed read and re-subscribes only on the explicit action', async () => {
    let projectReads = 0
    let taskReads = 0
    const client: RpcClient = {
      sendRequest: async (method) => {
        if (method === 'localTasks.projects.list') {
          projectReads += 1
          if (projectReads === 1) {
            throw new Error('project failed')
          }
          return { id: method, ok: true, result: { projects: [] } }
        }
        if (method === 'localTasks.tasks.list') {
          taskReads += 1
          return { id: method, ok: true, result: { tasks: [] } }
        }
        if (method === 'localTasks.status') {
          return {
            id: method,
            ok: true,
            result: { taskHost: true, state: 'ready', revision: 1, reason: null, taskHostId: 'h' }
          }
        }
        throw new Error(`unexpected ${method}`)
      },
      subscribe: () => () => {},
      updateTerminalSubscriptionViewport: () => {},
      getState: () => 'connected',
      getReconnectAttempt: () => 0,
      getLastConnectedAt: () => null,
      onStateChange: () => () => {},
      notifyForeground: () => {},
      close: () => {}
    }
    let model: LocalTasksLibrary | undefined
    function Probe(props: { enabled: boolean }) {
      model = useLocalTasksLibrary(client, props.enabled, 'host')
      return null
    }
    let renderer: ReactTestRenderer | undefined
    await act(async () => {
      renderer = create(createElement(Probe, { enabled: true }))
    })
    expect(startLocalTasksChangeFeed).toHaveBeenCalledTimes(1)
    await act(async () => model?.reload())
    expect(model?.error).toBe('project failed')
    expect(taskReads).toBe(1)
    await act(async () => model?.retryFailed())
    expect(projectReads).toBe(2)
    expect(taskReads).toBe(1)
    expect(startLocalTasksChangeFeed).toHaveBeenCalledTimes(1)
    await act(async () => model?.resubscribe())
    expect(startLocalTasksChangeFeed).toHaveBeenCalledTimes(2)
    await act(async () => renderer?.update(createElement(Probe, { enabled: false })))
    await act(async () => {
      model?.retryFailed()
      model?.resubscribe()
    })
    expect(projectReads).toBe(2)
    expect(startLocalTasksChangeFeed).toHaveBeenCalledTimes(2)
    await act(async () => renderer?.unmount())
  })
})
