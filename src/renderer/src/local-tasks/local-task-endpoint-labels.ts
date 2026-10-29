import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import { getMixedHostContextLabels } from '../../../shared/worktree/host-context-labels'
import { localTaskIdEndpoint, type LocalTaskEndpointKey } from './local-task-endpoints'
import { useLocalTasksDomain } from './local-tasks-domain-store'

/**
 * Host names for libraries, only once projects come from more than one Orca: each library numbers
 * its own refs, so `SHOP-12` can exist twice (the rule of `getMixedHostContextLabels`).
 */
export function localTaskEndpointLabels(
  endpoints: readonly LocalTaskEndpointKey[],
  labelOf: (endpoint: LocalTaskEndpointKey) => string
): ReadonlyMap<string, string> | undefined {
  return getMixedHostContextLabels(endpoints, {
    getHostId: (endpoint) => endpoint,
    getIdentity: (endpoint) => endpoint,
    sources: { hostLabelById: new Map(endpoints.map((endpoint) => [endpoint, labelOf(endpoint)])) }
  })
}

/** The host label to show beside a row of this id, or undefined while one Orca holds them all. */
export function useLocalTaskEndpointLabels(): ReadonlyMap<string, string> | undefined {
  const endpoints = useLocalTasksDomain(
    useShallow((state) => [
      ...new Set(state.projects.map((project) => localTaskIdEndpoint(project.id)))
    ])
  )
  const labels = useAppStore(
    useShallow((state) =>
      endpoints.map((endpoint) => selectExecutionHostDisplayLabel(state, endpoint))
    )
  )
  return useMemo(
    () =>
      localTaskEndpointLabels(
        endpoints,
        (endpoint) => labels[endpoints.indexOf(endpoint)] ?? endpoint
      ),
    [endpoints, labels]
  )
}

export function localTaskHostLabelFor(
  labels: ReadonlyMap<string, string> | undefined,
  clientId: string
): string | null {
  return labels?.get(localTaskIdEndpoint(clientId)) ?? null
}
