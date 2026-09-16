import { useEffect } from 'react'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { createStore } from 'zustand/vanilla'
import { toast } from 'sonner'
import type { GoalEditorDraftSummary } from '../../../shared/goals/goal-editor-draft-contract'
import { translate } from '@/i18n/i18n'
import { goalRuntimeClient, type GoalRuntimeClient } from './goal-runtime-client'

export const goalEditorDraftsStore = createStore<{
  items: GoalEditorDraftSummary[]
  error: string | null
  routeExecutionHostId: ExecutionHostId
  deletedIds: ReadonlySet<string>
}>(() => ({ items: [], error: null, routeExecutionHostId: 'local', deletedIds: new Set() }))

export function useGoalEditorDraftSync(client: GoalRuntimeClient = goalRuntimeClient): void {
  useEffect(() => {
    goalEditorDraftsStore.setState({
      items: [],
      error: null,
      routeExecutionHostId: client.routeExecutionHostId,
      deletedIds: new Set()
    })
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
        const result = await client.listEditorDrafts()
        if (disposed) {
          return
        }
        const deletedIds = goalEditorDraftsStore.getState().deletedIds
        const items = result.items.filter((item) => !deletedIds.has(item.editorDraftId))
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
  }, [client])
}

export function removeDeletedGoalDraft(id: string, client: GoalRuntimeClient): void {
  goalEditorDraftsStore.setState((state) => {
    if (state.routeExecutionHostId !== client.routeExecutionHostId) {
      return state
    }
    return {
      items: state.items.filter((item) => item.editorDraftId !== id),
      deletedIds: new Set([...state.deletedIds, id])
    }
  })
}
