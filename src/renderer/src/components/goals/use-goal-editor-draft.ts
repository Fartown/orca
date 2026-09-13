import { useEffect, useState, useSyncExternalStore } from 'react'
import { newClientOperationId } from '@/goals/goal-client-operation'
import { goalDomainStore, type GoalEditorPrefill } from '@/goals/goals-domain-store'
import type {
  DraftSessionSnapshot,
  GoalEditorDraftSession
} from '@/goals/goal-editor-draft-session'
import { openGoalDraftSession } from '@/goals/goal-editor-draft-session'
import {
  goalDraftContext,
  type GoalEditorDraftContent
} from '../../../../shared/goals/goal-editor-draft-contract'
import { EMPTY_GOAL_DRAFT, draftFromDetail, targetFromPrefill } from './goal-editor-draft'

const EMPTY_CONTENT: GoalEditorDraftContent = {
  fields: EMPTY_GOAL_DRAFT,
  target: { worktreeId: null, paneKey: null },
  goalId: null,
  documentContext: null,
  generation: null,
  operationId: '',
  archived: false
}
const EMPTY_SNAPSHOT: DraftSessionSnapshot = { content: EMPTY_CONTENT, saving: false, error: null }
const subscribeEmpty = (): (() => void) => () => {}

export function useGoalEditorDraft(editor: { open: boolean; prefill: GoalEditorPrefill | null }) {
  const [session, setSession] = useState<GoalEditorDraftSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const snapshot = useSyncExternalStore(
    session?.subscribe ?? subscribeEmpty,
    session?.getSnapshot ?? (() => EMPTY_SNAPSHOT)
  )

  useEffect(() => {
    if (!editor.open) {
      return
    }
    let disposed = false
    setLoading(true)
    setSession(null)
    setError(null)
    const prefill = editor.prefill
    const saved = prefill?.goalId ? goalDomainStore.getState().detailsById[prefill.goalId] : null
    const fields = saved ? draftFromDetail(saved) : { ...EMPTY_GOAL_DRAFT }
    const target = saved
      ? { worktreeId: saved.binding.worktree, paneKey: saved.binding.terminal }
      : targetFromPrefill(prefill)
    void openGoalDraftSession(
      prefill?.draftId ?? {
        ...EMPTY_CONTENT,
        fields,
        target,
        goalId: prefill?.goalId ?? null,
        documentContext: saved ? goalDraftContext(fields, target.worktreeId) : null,
        editorDraftId: newClientOperationId(),
        operationId: newClientOperationId(),
        revision: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    )
      .then((opened) => {
        if (!disposed) {
          setSession(opened)
        }
      })
      .catch((caught) => {
        if (!disposed) {
          setError(String(caught))
        }
      })
      .finally(() => {
        if (!disposed) {
          setLoading(false)
        }
      })
    return () => {
      disposed = true
    }
  }, [editor.open, editor.prefill])

  return { session, ...snapshot, loading, error: error ?? snapshot.error }
}
