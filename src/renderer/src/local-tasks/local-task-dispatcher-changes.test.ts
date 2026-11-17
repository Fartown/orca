import { beforeEach, expect, it, vi } from 'vitest'
import type { LocalTaskChangeScope } from '../../../shared/local-tasks/local-task-types'
import type { LocalTaskEndpointKey } from './local-task-endpoints'

type Listener = (scopes: readonly LocalTaskChangeScope[] | null) => void
const fixture = vi.hoisted(() => {
  const source: { endpoint: LocalTaskEndpointKey } = { endpoint: 'runtime:mini' }
  return {
    ...source,
    epoch: 0,
    contact: true,
    listeners: new Map<string, Listener>(),
    sources: new Set<() => void>(),
    read: vi.fn(),
    apply: vi.fn(),
    retain: vi.fn(),
    released: vi.fn()
  }
})
vi.mock('./local-task-dispatcher-client', () => ({
  localTaskDispatcherClientFor: (endpoint: string) => ({
    readPreferences: () => fixture.read(endpoint)
  })
}))
vi.mock('./local-task-self-changes', () => ({
  subscribeLocalTaskChanges: (endpoint: string, listener: Listener) => {
    fixture.listeners.set(endpoint, listener)
    return () => fixture.listeners.delete(endpoint)
  }
}))
vi.mock('./local-task-library-viewers', () => ({
  retainLocalTaskLibraryEndpoint: (endpoint: string) => {
    fixture.retain(endpoint)
    return () => fixture.released(endpoint)
  }
}))
vi.mock('./local-task-dispatcher-source', () => ({
  getLocalTaskDispatcherEndpoint: () => fixture.endpoint,
  getLocalTaskDispatcherEpoch: () => fixture.epoch,
  isLocalTaskDispatcherSourceCurrent: (endpoint: string, epoch: number) =>
    fixture.contact && endpoint === fixture.endpoint && epoch === fixture.epoch,
  subscribeLocalTaskDispatcherSource: (listener: () => void) => {
    fixture.sources.add(listener)
    return () => fixture.sources.delete(listener)
  },
  applyLocalTaskDispatcherPreferences: fixture.apply
}))
import { subscribeLocalTaskDispatcherChanges } from './local-task-dispatcher-changes'

beforeEach(() => {
  fixture.endpoint = 'runtime:mini'
  fixture.epoch = 0
  fixture.contact = true
  fixture.listeners.clear()
  fixture.sources.clear()
  fixture.read.mockReset()
  fixture.apply.mockReset()
  fixture.retain.mockClear()
  fixture.released.mockClear()
})
function sourceChanged(): void {
  fixture.epoch += 1
  for (const listener of fixture.sources) {
    listener()
  }
}

it('moves its shared subscription and endpoint demand, discarding preferences returned by the old source', async () => {
  let release: (value: Record<string, string>) => void = () => {}
  const oldRead = new Promise<Record<string, string>>((resolve) => {
    release = resolve
  })
  fixture.read.mockImplementation((endpoint: string) =>
    endpoint === 'runtime:mini' ? oldRead : Promise.resolve({ 'dispatcher.paneKey': 'other-pane' })
  )
  const listener = vi.fn()
  const stop = subscribeLocalTaskDispatcherChanges(listener, () => {}, true)
  fixture.endpoint = 'runtime:other'
  sourceChanged()
  await vi.waitFor(() =>
    expect(fixture.apply).toHaveBeenCalledExactlyOnceWith('runtime:other', {
      'dispatcher.paneKey': 'other-pane'
    })
  )
  release({ 'dispatcher.paneKey': 'late-pane' })
  await oldRead
  expect(fixture.apply).toHaveBeenCalledTimes(1)
  expect([...fixture.listeners.keys()]).toEqual(['runtime:other'])
  expect(fixture.released).toHaveBeenCalledExactlyOnceWith('runtime:mini')
  stop()
  expect(fixture.released.mock.calls).toEqual([['runtime:mini'], ['runtime:other']])
  expect(fixture.listeners.size).toBe(0)
})

it('does not apply preferences or notify its consumer after being closed', async () => {
  let release: (value: Record<string, string>) => void = () => {}
  const reading = new Promise<Record<string, string>>((resolve) => {
    release = resolve
  })
  fixture.read.mockReturnValue(reading)
  const listener = vi.fn()
  const stop = subscribeLocalTaskDispatcherChanges(listener, () => {}, true)
  const notices = listener.mock.calls.length
  stop()
  release({ 'dispatcher.paneKey': 'late-pane' })
  await reading
  expect(fixture.apply).not.toHaveBeenCalled()
  expect(listener).toHaveBeenCalledTimes(notices)
})

it('reads only when shared contact is restored and keeps one stream demand through contact epochs', async () => {
  fixture.contact = false
  fixture.read.mockResolvedValue({})
  const stop = subscribeLocalTaskDispatcherChanges(
    () => {},
    () => {},
    true
  )
  fixture.listeners.get('runtime:mini')?.(null)
  expect(fixture.read).not.toHaveBeenCalled()
  fixture.contact = true
  sourceChanged()
  await vi.waitFor(() => expect(fixture.apply).toHaveBeenCalledTimes(1))
  expect(fixture.read).toHaveBeenCalledExactlyOnceWith('runtime:mini')
  expect(fixture.retain).toHaveBeenCalledTimes(1)
  expect(fixture.released).not.toHaveBeenCalled()
  stop()
})
