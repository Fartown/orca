import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

/** Which link dialog is open; opened from the task page, a workspace menu or a session chip. */
export type LocalTaskLinkDialog =
  | { kind: 'session'; taskId: string }
  | { kind: 'pick-workspace'; taskId: string }
  | { kind: 'pick-task'; worktreeId: string; hostId: string }

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
