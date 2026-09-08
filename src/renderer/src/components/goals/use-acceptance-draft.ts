import type { GoalAcceptanceDraft } from '../../../../shared/goals/goal-acceptance-draft-contract'
import { useEffect, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { newClientOperationId } from '@/goals/goal-client-operation'
import { goalRuntimeClient } from '@/goals/goal-runtime-client'
import type { GoalBinding } from '../../../../shared/goals/goal-control-contract'

export function useAcceptanceDraft(open: boolean, context: string) {
  const active = useRef<string | null>(null)
  const cancelled = useRef<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setGenerating(false)
    setError(null)
    return () => {
      const id = active.current
      active.current = null
      if (id) {
        void goalRuntimeClient.cancelAcceptanceDraft(id).catch(() => {})
      }
    }
  }, [open, context])

  const generate = async (input: {
    objective: string
    judge: 'claude' | 'codex'
    acceptanceContext?: string
    resolveBinding: () => Promise<GoalBinding>
    onDocument: (document: string) => void
  }): Promise<void> => {
    const draftId = newClientOperationId()
    active.current = draftId
    setGenerating(true)
    setError(null)
    try {
      const binding = await input.resolveBinding()
      if (active.current !== draftId) {
        return
      }
      let result: GoalAcceptanceDraft | null = await goalRuntimeClient.draftAcceptance({
        draftId,
        binding,
        objective: input.objective,
        judge: input.judge,
        acceptanceContext: input.acceptanceContext
      })
      while (
        active.current === draftId &&
        cancelled.current !== draftId &&
        result?.status === 'generating'
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        if (active.current !== draftId) {
          break
        }
        result = await goalRuntimeClient.getAcceptanceDraft(draftId)
      }
      if (active.current !== draftId) {
        await goalRuntimeClient.cancelAcceptanceDraft(draftId)
        return
      }
      if (cancelled.current === draftId) {
        return
      }
      if (result?.status === 'ready' && result.document) {
        input.onDocument(result.document)
      } else if (result?.status !== 'cancelled') {
        throw new Error(
          result?.error ||
            translate(
              'goals.editor.draftLost',
              'The document could not be retrieved. Generate it again.'
            )
        )
      }
    } catch (caught) {
      void goalRuntimeClient.cancelAcceptanceDraft(draftId).catch(() => {})
      if (active.current === draftId && cancelled.current !== draftId) {
        setError(caught instanceof Error ? caught.message : String(caught))
      }
    } finally {
      if (active.current === draftId && cancelled.current !== draftId) {
        active.current = null
        setGenerating(false)
      }
    }
  }

  const cancel = async (): Promise<void> => {
    const id = active.current
    if (!id) {
      return
    }
    cancelled.current = id
    try {
      const result = await goalRuntimeClient.cancelAcceptanceDraft(id)
      if (result?.status === 'failed') {
        throw new Error(result.error || 'Could not cancel generation.')
      }
      if (active.current === id) {
        active.current = null
        setGenerating(false)
      }
    } catch (caught) {
      if (active.current === id) {
        active.current = null
        setGenerating(false)
        setError(caught instanceof Error ? caught.message : String(caught))
      }
    }
  }

  return { generating, error, generate, cancel }
}
