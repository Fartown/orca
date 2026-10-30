import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_TASKS_RUNTIME_CAPABILITY } from '../../../src/shared/local-tasks/local-tasks-capability'
import type { TaskProvider } from '../../../src/shared/task-providers'
import type { PickerOption } from '../components/PickerModal'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState, RpcResponse } from '../transport/types'

type PageEnv = { client: RpcClient | null; state: ConnectionState; capabilities: string[] }

const env = vi.hoisted((): PageEnv => ({ client: null, state: 'connected', capabilities: [] }))

vi.mock('../tasks/mobile-tasks-dependencies', () => ({ ListTodo: 'ListTodo' }))
vi.mock('../components/host-protocol-gates-context', () => ({
  useOptionalHostProtocolGates: () => ({
    hostCapabilities: env.capabilities,
    statusPending: false,
    statusReadable: true
  })
}))

import {
  LOCAL_TASK_SOURCE_OPTION,
  useLocalTaskSourceOptions,
  withLocalTaskSource
} from './local-task-source-option'

/** A desktop's library, answering `localTasks.status` and counting what the page asked. */
function desktop(status: { projectCount: number; sourceHidden?: boolean }) {
  const calls: string[] = []
  const client: RpcClient = {
    sendRequest: async (method: string): Promise<RpcResponse> => {
      calls.push(method)
      return {
        id: method,
        ok: true,
        result: {
          taskHost: true,
          state: 'ready',
          reason: null,
          revision: 1,
          taskHostId: 'h',
          ...status
        }
      }
    },
    subscribe: () => () => {},
    updateTerminalSubscriptionViewport: () => {},
    getState: () => 'connected',
    getReconnectAttempt: () => 0,
    getLastConnectedAt: () => 1,
    onStateChange: () => () => {},
    notifyForeground: () => {},
    close: () => {}
  }
  return { client, calls }
}

let renderer: ReactTestRenderer | null = null
beforeEach(() => {
  Object.assign(env, {
    client: null,
    state: 'connected',
    capabilities: [LOCAL_TASKS_RUNTIME_CAPABILITY]
  })
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

/** The Local rows the Task Source picker is given once the page has settled. */
async function sourceOptions(): Promise<PickerOption[]> {
  let options: PickerOption[] = []
  function Probe() {
    options = useLocalTaskSourceOptions({ client: env.client, connState: env.state })
    return null
  }
  await act(async () => {
    renderer = create(createElement(Probe))
  })
  for (let turn = 0; turn < 4; turn += 1) {
    await act(async () => {
      await Promise.resolve()
    })
  }
  act(() => renderer?.unmount())
  renderer = null
  return options
}

describe("the Task Source picker's Local row", () => {
  it('is offered by a host with local tasks, even before its first project', async () => {
    const empty = desktop({ projectCount: 0 })
    env.client = empty.client
    const options = await sourceOptions()
    expect(options.map(({ value, label, disabled }) => ({ value, label, disabled }))).toEqual([
      { value: LOCAL_TASK_SOURCE_OPTION, label: 'Local tasks', disabled: false }
    ])
    expect(empty.calls).toEqual(['localTasks.status'])
  })

  it('goes once the desktop hides local tasks, and is never offered by a host without them', async () => {
    const hidden = desktop({ projectCount: 2, sourceHidden: true })
    env.client = hidden.client
    expect(await sourceOptions()).toEqual([])

    const older = desktop({ projectCount: 2 })
    env.client = older.client
    env.capabilities = []
    expect(await sourceOptions()).toEqual([])
    expect(older.calls).toEqual([])
  })

  it('is dimmed out of contact and asks nothing then', async () => {
    const away = desktop({ projectCount: 2 })
    env.client = away.client
    env.state = 'reconnecting'
    const options = await sourceOptions()
    expect(options.map(({ disabled, subtitle }) => ({ disabled, subtitle }))).toEqual([
      { disabled: true, subtitle: 'This host’s Orca is not connected' }
    ])
    expect(away.calls).toEqual([])
  })

  it('opens the local tasks page without making it the saved source', () => {
    const push = vi.fn()
    const selectProvider = vi.fn<(provider: TaskProvider) => void>()
    const onSelect = withLocalTaskSource({ hostId: 'host a', router: { push } }, selectProvider)

    onSelect(LOCAL_TASK_SOURCE_OPTION)
    expect(push).toHaveBeenCalledWith('/h/host%20a/local-tasks')
    expect(selectProvider).not.toHaveBeenCalled()

    onSelect('linear')
    expect(selectProvider).toHaveBeenCalledWith('linear')
    expect(push).toHaveBeenCalledTimes(1)
  })
})
