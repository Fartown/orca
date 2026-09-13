import { useEffect, useRef, useState } from 'react'
import { goalRuntimeClient } from '@/goals/goal-runtime-client'
import { newClientOperationId } from '@/goals/goal-client-operation'
import type { GoalEditorDraftSession } from '@/goals/goal-editor-draft-session'
import type { GoalAcceptanceDraft } from '../../../../shared/goals/goal-acceptance-draft-contract'
import { canApplyGeneratedDocument } from '../../../../shared/goals/goal-editor-draft-contract'

export function useAcceptanceDraft(
  session: GoalEditorDraftSession | null,
  attemptId: string | null
) {
  const [result, setResult] = useState<GoalAcceptanceDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const startLock = useRef(false)
  const currentSession = useRef(session)
  currentSession.current = session

  useEffect(() => {
    setResult(null)
    setError(null)
    if (!attemptId || !session) {
      return
    }
    let disposed = false
    let polling = false
    const poll = async (): Promise<void> => {
      if (polling) {
        return
      }
      polling = true
      try {
        const latest = await goalRuntimeClient.getAcceptanceDraft(attemptId)
        if (disposed) {
          return
        }
        setResult(latest)
        setError(
          latest ? null : 'The task has not been confirmed yet. Reconnecting; your draft is saved.'
        )
        if (
          latest?.status === 'ready' &&
          latest.document &&
          canApplyGeneratedDocument(session.getSnapshot().content, latest.draftId)
        ) {
          session.change((content) => ({
            ...content,
            fields: { ...content.fields, acceptanceDocument: latest.document! },
            documentContext: content.generation!.context,
            generation: { ...content.generation!, applied: true }
          }))
        }
      } catch (caught) {
        if (!disposed) {
          setError(caught instanceof Error ? caught.message : String(caught))
        }
      } finally {
        polling = false
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), 1000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [session, attemptId])

  const generate = async (input: {
    objective: string
    judge: 'claude' | 'codex'
    context: string
    acceptanceContext?: string
    worktree: string
  }): Promise<void> => {
    if (!session || startLock.current || result?.status === 'generating') {
      return
    }
    startLock.current = true
    setStarting(true)
    setError(null)
    try {
      const previous = session.getSnapshot().content.generation
      const retry = previous && !result && previous.request
      const draftId = retry ? previous.draftId : newClientOperationId()
      const request = retry
        ? previous.request!
        : {
            worktree: input.worktree,
            objective: input.objective,
            judge: input.judge,
            acceptanceContext: input.acceptanceContext
          }
      if (!retry) {
        session.change((content) => ({
          ...content,
          generation: {
            draftId,
            context: input.context,
            baseDocument: content.fields.acceptanceDocument,
            requestedAt: Date.now(),
            applied: false,
            request
          }
        }))
      }
      await session.flush()
      const next = await goalRuntimeClient.draftAcceptance({ draftId, ...request })
      if (currentSession.current === session) {
        setResult(next)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      startLock.current = false
      setStarting(false)
    }
  }
  const cancel = async (): Promise<void> => {
    if (!attemptId) {
      return
    }
    try {
      setResult(await goalRuntimeClient.cancelAcceptanceDraft(attemptId))
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }
  const currentResult = result?.draftId === attemptId ? result : null
  return {
    result: currentResult,
    error,
    unresolved: Boolean(attemptId && !currentResult),
    generating: starting || currentResult?.status === 'generating',
    generate,
    cancel
  }
}
