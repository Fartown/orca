import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'

export type LocalTaskSessionPanelMode = 'closed' | 'narrow' | 'wide'

type LocalTaskSessionPanelState = {
  mode: LocalTaskSessionPanelMode
  sessionLinkId: string | null
  taskId: string | null
  requestToken: string | null
  open: (link: LocalTaskSessionLink, mode?: Exclude<LocalTaskSessionPanelMode, 'closed'>) => void
  switchSession: (link: LocalTaskSessionLink) => void
  close: () => void
  setMode: (mode: Exclude<LocalTaskSessionPanelMode, 'closed'>) => void
}

let nextRequest = 0

export const localTaskSessionPanelStore = createStore<LocalTaskSessionPanelState>((set) => ({
  mode: 'closed',
  sessionLinkId: null,
  taskId: null,
  requestToken: null,
  open: (link, mode = 'narrow') =>
    set((state) => ({
      mode,
      sessionLinkId: link.id,
      taskId: link.taskId,
      requestToken:
        state.sessionLinkId === link.id && state.mode !== 'closed'
          ? state.requestToken
          : `local-task-session:${++nextRequest}`
    })),
  switchSession: (link) =>
    set((state) =>
      state.mode === 'closed'
        ? state
        : {
            sessionLinkId: link.id,
            requestToken:
              state.sessionLinkId === link.id
                ? state.requestToken
                : `local-task-session:${++nextRequest}`
          }
    ),
  close: () => set({ mode: 'closed', sessionLinkId: null, taskId: null, requestToken: null }),
  setMode: (mode) => set((state) => (state.mode === 'closed' ? state : { mode }))
}))

export function useLocalTaskSessionPanel<T>(selector: (state: LocalTaskSessionPanelState) => T): T {
  return useStore(localTaskSessionPanelStore, selector)
}

export function localTaskSessionPanelHasTerminal(): boolean {
  return localTaskSessionPanelStore.getState().mode !== 'closed'
}
