import { useEffect } from 'react'
import { createStore } from 'zustand/vanilla'
import { toast } from 'sonner'
import type { GoalEditorDraftSummary } from '../../../shared/goals/goal-editor-draft-contract'
import { translate } from '@/i18n/i18n'
import { goalRuntimeClient } from './goal-runtime-client'

export const goalEditorDraftsStore = createStore<{
  items: GoalEditorDraftSummary[]
  error: string | null
}>(() => ({ items: [], error: null }))

export function useGoalEditorDraftSync(): void {
  useEffect(() => {
    let disposed = false
    let pending = false
    const statuses = new Map<string, string>()
    const connectedAt = Date.now()
    const refresh = async (): Promise<void> => {
      if (pending) {
        return
      }
      pending = true
      try {
        const { items } = await goalRuntimeClient.listEditorDrafts()
        if (disposed) {
          return
        }
        for (const item of items) {
          const attempt = item.generation
          if (!attempt) {
            continue
          }
          const previous = statuses.get(attempt.draftId)
          const finishedSinceConnect = !previous && (attempt.finishedAt ?? 0) >= connectedAt
          if (
            (previous === 'generating' || finishedSinceConnect) &&
            attempt.status !== 'generating'
          ) {
            toast(
              attempt.status === 'ready'
                ? translate(
                    'goals.drafts.readyNotification',
                    'Acceptance document ready. Open Goal drafts to review it.'
                  )
                : translate(
                    'goals.drafts.endedNotification',
                    'Document generation ended. Open Goal drafts for details.'
                  )
            )
          }
          statuses.set(attempt.draftId, attempt.status)
        }
        goalEditorDraftsStore.setState({ items, error: null })
      } catch (error) {
        if (!disposed) {
          goalEditorDraftsStore.setState({
            error: error instanceof Error ? error.message : String(error)
          })
        }
      } finally {
        pending = false
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 2000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [])
}
