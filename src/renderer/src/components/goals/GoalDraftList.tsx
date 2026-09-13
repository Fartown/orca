import { useStore } from 'zustand'
import { translate } from '@/i18n/i18n'
import { goalDomainStore } from '@/goals/goals-domain-store'
import { goalEditorDraftsStore } from '@/goals/goal-editor-drafts-sync'
import { goalDraftStatusLabel } from '@/goals/goal-draft-status-copy'
import { requestGoalDetailRefresh } from '@/goals/GoalDomainSyncGate'

export function GoalDraftList(): React.JSX.Element | null {
  const items = useStore(goalEditorDraftsStore, (s) => s.items)
  const error = useStore(goalEditorDraftsStore, (s) => s.error)
  if (!items.length && !error) {
    return null
  }
  return (
    <section
      className="shrink-0 border-b border-border p-2"
      aria-label={translate('goals.drafts.title', 'Goal drafts')}
    >
      <p className="mb-1 text-xs font-semibold">
        {translate('goals.drafts.title', 'Goal drafts')} · {items.length}
      </p>
      {error ? (
        <p role="status" className="text-xs text-muted-foreground">
          {translate(
            'goals.drafts.listUnavailable',
            'Drafts are temporarily unavailable. Reconnecting…'
          )}
        </p>
      ) : null}
      <div className="scrollbar-sleek max-h-48 space-y-1 overflow-y-auto">
        {items.map((item) => (
          <button
            type="button"
            key={item.editorDraftId}
            data-goal-draft-id={item.editorDraftId}
            className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
            onClick={() => {
              if (item.goalId) {
                requestGoalDetailRefresh(item.goalId)
              }
              goalDomainStore.getState().openEditor({
                worktreeId: item.worktreeId,
                paneKey: null,
                draftId: item.editorDraftId,
                ...(item.goalId ? { goalId: item.goalId } : {})
              })
            }}
          >
            <span className="block truncate">
              {item.objectivePreview || translate('goals.drafts.untitled', 'Untitled goal draft')}
            </span>
            <span className="block text-muted-foreground">
              {error
                ? translate('goals.drafts.reconnecting', 'Status unavailable · reconnecting')
                : goalDraftStatusLabel(item.generation, false, item.hasDocument)}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
