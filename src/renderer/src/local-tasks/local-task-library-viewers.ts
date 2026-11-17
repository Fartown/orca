import { useEffect } from 'react'
import { createStore } from 'zustand/vanilla'

/**
 * How many surfaces that add or pick a task project's tasks on any host are on screen (the Local
 * task page, Settings → Local Tasks, a Local tasks source tab's host). While one is, paired Orcas'
 * libraries are streamed even when they reported no project.
 */
export const localTaskLibraryViewerStore = createStore<{
  viewers: number
  endpoints: ReadonlySet<string>
}>(() => ({ viewers: 0, endpoints: new Set() }))
const endpointViewers = new Map<string, number>()

export function retainLocalTaskLibraryEndpoint(endpoint: string): () => void {
  endpointViewers.set(endpoint, (endpointViewers.get(endpoint) ?? 0) + 1)
  localTaskLibraryViewerStore.setState({ endpoints: new Set(endpointViewers.keys()) })
  return () => {
    const count = (endpointViewers.get(endpoint) ?? 1) - 1
    if (count === 0) {
      endpointViewers.delete(endpoint)
    } else {
      endpointViewers.set(endpoint, count)
    }
    localTaskLibraryViewerStore.setState({ endpoints: new Set(endpointViewers.keys()) })
  }
}

export function useLocalTaskLibraryViewer(enabled = true): void {
  useEffect(() => {
    if (!enabled) {
      return
    }
    localTaskLibraryViewerStore.setState((state) => ({ viewers: state.viewers + 1 }))
    return () => localTaskLibraryViewerStore.setState((state) => ({ viewers: state.viewers - 1 }))
  }, [enabled])
}
