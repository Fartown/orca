import { useEffect, useRef } from 'react'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { toast } from 'sonner'
import type { GoalEditorDraftSummary } from '../../../shared/goals/goal-editor-draft-contract'
import { translate } from '@/i18n/i18n'
import { goalRuntimeClient, type GoalRuntimeClient } from './goal-runtime-client'

const DRAFT_POLL_MS = 2000

export const goalEditorDraftsStore = createStore<{
  items: GoalEditorDraftSummary[]
  error: string | null
  routeExecutionHostId: ExecutionHostId
  deletedIds: ReadonlySet<string>
  refreshNudge: number
}>(() => ({
  items: [],
  error: null,
  routeExecutionHostId: 'local',
  deletedIds: new Set(),
  refreshNudge: 0
}))

/** Read drafts once now, e.g. right after starting a generation, so its progress is tracked. */
export function requestGoalEditorDraftsRefresh(): void {
  goalEditorDraftsStore.setState((state) => ({ refreshNudge: state.refreshNudge + 1 }))
}

export type GoalEditorDraftDemand = {
  inContact: boolean
  panelVisible: boolean
}

export function useGoalEditorDraftSync(
  client: GoalRuntimeClient = goalRuntimeClient,
  demand: GoalEditorDraftDemand = { inContact: true, panelVisible: true }
): void {
  const generating = useStore(goalEditorDraftsStore, (s) =>
    s.items.some((item) => item.generation?.status === 'generating')
  )
  const nudge = useStore(goalEditorDraftsStore, (s) => s.refreshNudge)
  const statuses = useRef(new Map<string, string>())
  // Set by the reset effect, which runs before the first read.
  const connectedAt = useRef(0)
  // Why: the list is only shown in the Goals panel; otherwise it is watched just to announce a
  // running generation's result. An unreachable host is never read.
  const polling = demand.inContact && (demand.panelVisible || generating)

  useEffect(() => {
    goalEditorDraftsStore.setState({
      items: [],
      error: null,
      routeExecutionHostId: client.routeExecutionHostId,
      deletedIds: new Set()
    })
    statuses.current = new Map()
    connectedAt.current = Date.now()
  }, [client])

  useEffect(() => {
    if (!demand.inContact) {
      return
    }
    let disposed = false
    let pending = false
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
          const previous = statuses.current.get(attempt.draftId)
          const finishedSinceConnect = !previous && (attempt.finishedAt ?? 0) >= connectedAt.current
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
          statuses.current.set(attempt.draftId, attempt.status)
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
    // One read on activation or nudge learns whether a generation is running.
    void refresh()
    if (!polling) {
      return () => {
        disposed = true
      }
    }
    const timer = setInterval(() => void refresh(), DRAFT_POLL_MS)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [client, demand.inContact, nudge, polling])
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
