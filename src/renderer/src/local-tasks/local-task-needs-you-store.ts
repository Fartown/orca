import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { LocalTaskAttentionItem } from '../../../shared/local-tasks/local-task-link-types'
import { localTaskItemClientKey } from './local-task-needs-you-rows'

export type LocalTaskReplyDraft = {
  text: string
  /** The item as it was when the box opened, so the box survives the item leaving the list. */
  item: LocalTaskAttentionItem
}

/**
 * Window-local state of the Needs you view; nothing here is a fact about a session. Drafts live
 * only in this window, as a chat composer's do on the phone: a reply is sent once or kept here.
 */
export type LocalTaskNeedsYouState = {
  /** Open reply boxes by `localTaskItemClientKey`. */
  drafts: Record<string, LocalTaskReplyDraft>
  /** The task row whose snooze menu is open (H). */
  snoozeTaskId: string | null
  openReply: (item: LocalTaskAttentionItem) => void
  setDraftText: (item: LocalTaskAttentionItem, text: string) => void
  closeReply: (item: LocalTaskAttentionItem) => void
  setSnoozeTaskId: (taskId: string | null) => void
}

export const localTaskNeedsYouStore = createStore<LocalTaskNeedsYouState>((set) => ({
  drafts: {},
  snoozeTaskId: null,
  openReply: (item) =>
    set((state) => {
      const key = localTaskItemClientKey(item)
      return state.drafts[key] ? state : { drafts: { ...state.drafts, [key]: { text: '', item } } }
    }),
  setDraftText: (item, text) =>
    set((state) => {
      const key = localTaskItemClientKey(item)
      const draft = state.drafts[key]
      return draft ? { drafts: { ...state.drafts, [key]: { ...draft, text } } } : state
    }),
  closeReply: (item) =>
    set((state) => {
      const key = localTaskItemClientKey(item)
      if (!state.drafts[key]) {
        return state
      }
      const drafts = { ...state.drafts }
      delete drafts[key]
      return { drafts }
    }),
  setSnoozeTaskId: (snoozeTaskId) => set({ snoozeTaskId })
}))

export function useLocalTaskNeedsYou<T>(selector: (state: LocalTaskNeedsYouState) => T): T {
  return useStore(localTaskNeedsYouStore, selector)
}
