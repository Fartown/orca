import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { createLocalTasksApi } from './local-tasks-api'
import { useLocalTaskEvents } from './use-local-tasks-library'

vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove: () => {} }) } }))

describe('mobile local task activity', () => {
  it('keeps earlier events on refresh failure and retries only the events request', async () => {
    let reads = 0
    const sendRequest = vi.fn(async (method: string) => {
      if (method !== 'localTasks.events.list') {
        throw new Error(`unexpected ${method}`)
      }
      reads += 1
      if (reads === 2) {
        throw new Error('events failed')
      }
      return { id: method, ok: true as const, result: { events: [] } }
    })
    const api = createLocalTasksApi({ sendRequest })
    let model: ReturnType<typeof useLocalTaskEvents> | undefined
    function Probe(props: { version: number }) {
      model = useLocalTaskEvents(api, 'task', props.version)
      return null
    }
    let renderer: ReactTestRenderer | undefined
    await act(async () => {
      renderer = create(createElement(Probe, { version: 0 }))
    })
    expect(model).toMatchObject({ loaded: true, events: [], error: false })
    await act(async () => {
      renderer?.update(createElement(Probe, { version: 1 }))
    })
    expect(model).toMatchObject({ loaded: true, events: [], error: true })
    await act(async () => model?.retry())
    expect(model).toMatchObject({ loaded: true, events: [], error: false })
    expect(sendRequest).toHaveBeenCalledTimes(3)
    await act(async () => renderer?.unmount())
  })
})
