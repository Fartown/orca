import { useEffect } from 'react'
import { createStore } from 'zustand/vanilla'

/**
 * How many surfaces that can add a task project to any host are on screen (the Local task page,
 * Settings → Local Tasks). While one is, paired Orcas' libraries are streamed even when empty.
 */
export const localTaskLibraryViewerStore = createStore<{ viewers: number }>(() => ({ viewers: 0 }))

export function useLocalTaskLibraryViewer(): void {
  useEffect(() => {
    localTaskLibraryViewerStore.setState((state) => ({ viewers: state.viewers + 1 }))
    return () => localTaskLibraryViewerStore.setState((state) => ({ viewers: state.viewers - 1 }))
  }, [])
}
