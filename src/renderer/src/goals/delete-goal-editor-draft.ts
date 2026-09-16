import { translate } from '@/i18n/i18n'
import { flushGoalDraftSession, forgetGoalDraftSession } from './goal-editor-draft-session'
import { removeDeletedGoalDraft } from './goal-editor-drafts-sync'
import type { GoalRuntimeClient } from './goal-runtime-client'
import { goalDomainStore } from './goals-domain-store'

export async function deleteGoalEditorDraft(
  id: string,
  client: GoalRuntimeClient,
  onStopping: () => void
): Promise<void> {
  await flushGoalDraftSession(id, client)
  const record = await client.getEditorDraft(id)
  for (let attempt = 0; attempt < 15; attempt++) {
    const result = await client.deleteEditorDraft({
      editorDraftId: id,
      expectedRevision: record?.revision ?? 0
    })
    if (result.status === 'deleted') {
      forgetGoalDraftSession(id, client)
      removeDeletedGoalDraft(id, client)
      const state = goalDomainStore.getState()
      if (
        state.routeExecutionHostId === client.routeExecutionHostId &&
        state.editor.prefill?.draftId === id
      ) {
        state.closeEditor()
      }
      return
    }
    if (result.status === 'unverifiable') {
      throw new Error(
        translate(
          'goals.drafts.deleteUnverifiable',
          'Cannot confirm that generation stopped. The draft is kept; reconnect and retry.'
        )
      )
    }
    onStopping()
    await new Promise<void>((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(
    translate(
      'goals.drafts.deleteStillStopping',
      'Generation is still stopping. The draft is kept; retry shortly.'
    )
  )
}
