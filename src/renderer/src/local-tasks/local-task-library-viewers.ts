import { useEffect } from 'react'
import { createStore } from 'zustand/vanilla'

/**
 * How many surfaces that add or pick a task project's tasks on any host are on screen (the Local
 * task page, Settings → Local Tasks, a Local tasks source tab's host). While one is, paired Orcas'
 * libraries are streamed even when they reported no project.
 */
export const localTaskLibraryViewerStore = createStore<{ viewers: number }>(() => ({ viewers: 0 }))

export function useLocalTaskLibraryViewer(enabled = true): void {
  useEffect(() => {
    if (!enabled) {
      return
    }
    localTaskLibraryViewerStore.setState((state) => ({ viewers: state.viewers + 1 }))
    return () => localTaskLibraryViewerStore.setState((state) => ({ viewers: state.viewers - 1 }))
  }, [enabled])
}
