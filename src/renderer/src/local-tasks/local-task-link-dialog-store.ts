import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

/**
 * Which task-side link dialog is open, from the task page. Linking from a workspace goes through
 * Orca's own workspace details instead (`local-task-workspace-details.ts`).
 */
export type LocalTaskLinkDialog =
  | { kind: 'session'; taskId: string }
  | { kind: 'pick-workspace'; taskId: string }

type LocalTaskLinkDialogState = {
  dialog: LocalTaskLinkDialog | null
  open: (dialog: LocalTaskLinkDialog) => void
  close: () => void
}

export const localTaskLinkDialogStore = createStore<LocalTaskLinkDialogState>((set) => ({
  dialog: null,
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: null })
}))

export function useLocalTaskLinkDialog(): LocalTaskLinkDialog | null {
  return useStore(localTaskLinkDialogStore, (state) => state.dialog)
}
