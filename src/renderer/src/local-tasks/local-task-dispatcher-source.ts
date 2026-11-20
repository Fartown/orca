import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { useAppStore } from '@/store'
import { buildRuntimeClientEventEnvironmentKey } from '@/hooks/ipc-events/runtime-events/runtime-environment-subscription-selection'
import { parseExecutionHostId } from '../../../shared/execution-host/execution-host'
import { isLocalTaskHostInContact } from './local-task-host-contact'
import type { LocalTaskEndpointKey } from './local-task-endpoints'
import { localTasksDomainStore, selectLocalTasksPartition } from './local-tasks-domain-store'
import { LOCAL_TASK_DISPATCHER_HOST_PREFERENCE_KEY } from './local-task-preference-keys'

export { LOCAL_TASK_DISPATCHER_HOST_PREFERENCE_KEY } from './local-task-preference-keys'
const EMPTY_PREFERENCES: Record<string, string | null> = {}

type DispatcherState = {
  endpoint: LocalTaskEndpointKey
  epoch: number
  initialized: boolean
  paneKey: string | null
  worktreeId: string | null
  opening: boolean
  preferencesByEndpoint: Readonly<Record<string, Record<string, string | null>>>
}

export const localTaskDispatcherStore = createStore<DispatcherState>(() => ({
  endpoint: 'local',
  epoch: 0,
  initialized: false,
  paneKey: null,
  worktreeId: null,
  opening: false,
  preferencesByEndpoint: {}
}))

export function getLocalTaskDispatcherEndpoint(): LocalTaskEndpointKey {
  return localTaskDispatcherStore.getState().endpoint
}

export function getLocalTaskDispatcherEpoch(): number {
  return localTaskDispatcherStore.getState().epoch
}

export function useLocalTaskDispatcherEndpoint(): LocalTaskEndpointKey {
  return useStore(localTaskDispatcherStore, (state) => state.endpoint)
}

export function selectLocalTaskDispatcherEndpoint(endpoint: LocalTaskEndpointKey): void {
  localTaskDispatcherStore.setState((state) =>
    state.endpoint === endpoint
      ? { initialized: true }
      : {
          endpoint,
          initialized: true,
          epoch: state.epoch + 1,
          paneKey: null,
          worktreeId: null,
          opening: false
        }
  )
}

export function initialiseLocalTaskDispatcherSource(): void {
  if (localTaskDispatcherStore.getState().initialized) {
    return
  }
  const preferences = selectLocalTasksPartition(
    localTasksDomainStore.getState(),
    'local'
  )?.preferences
  if (!preferences || !Object.hasOwn(preferences, LOCAL_TASK_DISPATCHER_HOST_PREFERENCE_KEY)) {
    return
  }
  const parsed = parseExecutionHostId(preferences[LOCAL_TASK_DISPATCHER_HOST_PREFERENCE_KEY])
  selectLocalTaskDispatcherEndpoint(parsed?.kind === 'runtime' ? parsed.id : 'local')
}

export function isLocalTaskDispatcherSourceCurrent(
  endpoint: LocalTaskEndpointKey,
  epoch: number
): boolean {
  return (
    getLocalTaskDispatcherEndpoint() === endpoint &&
    getLocalTaskDispatcherEpoch() === epoch &&
    isLocalTaskHostInContact(useAppStore.getState(), endpoint)
  )
}

export function subscribeLocalTaskDispatcherSource(listener: () => void): () => void {
  return localTaskDispatcherStore.subscribe((state, previous) => {
    if (state.endpoint !== previous.endpoint || state.epoch !== previous.epoch) {
      listener()
    }
  })
}

export function getLocalTaskDispatcherPreferences(
  endpoint = getLocalTaskDispatcherEndpoint()
): Record<string, string | null> {
  return endpoint === 'local'
    ? (selectLocalTasksPartition(localTasksDomainStore.getState(), 'local')?.preferences ??
        EMPTY_PREFERENCES)
    : (localTaskDispatcherStore.getState().preferencesByEndpoint[endpoint] ?? EMPTY_PREFERENCES)
}

export function applyLocalTaskDispatcherPreferences(
  endpoint: LocalTaskEndpointKey,
  preferences: Record<string, string | null>
): void {
  localTaskDispatcherStore.setState((state) => ({
    preferencesByEndpoint: { ...state.preferencesByEndpoint, [endpoint]: preferences }
  }))
}

/** Shared connection verdicts invalidate all outstanding work, including a disconnect/reconnect. */
export function bindLocalTaskDispatcherSourceContact(): () => void {
  let endpoint = getLocalTaskDispatcherEndpoint()
  const connectionKey = (): string =>
    endpoint === 'local'
      ? 'local'
      : buildRuntimeClientEventEnvironmentKey([endpoint.slice('runtime:'.length)])
  let inContact = isLocalTaskHostInContact(useAppStore.getState(), endpoint)
  let key = connectionKey()
  const unsubscribeSource = subscribeLocalTaskDispatcherSource(() => {
    endpoint = getLocalTaskDispatcherEndpoint()
    inContact = isLocalTaskHostInContact(useAppStore.getState(), endpoint)
    key = connectionKey()
  })
  const unsubscribeApp = useAppStore.subscribe((state) => {
    const next = isLocalTaskHostInContact(state, endpoint)
    const nextKey = connectionKey()
    if (next === inContact && nextKey === key) {
      return
    }
    inContact = next
    key = nextKey
    localTaskDispatcherStore.setState((current) => ({
      epoch: current.epoch + 1,
      opening: false,
      ...(next && endpoint !== 'local'
        ? {
            paneKey: null,
            worktreeId: null,
            preferencesByEndpoint: { ...current.preferencesByEndpoint, [endpoint]: {} }
          }
        : {})
    }))
  })
  return () => {
    unsubscribeApp()
    unsubscribeSource()
  }
}
