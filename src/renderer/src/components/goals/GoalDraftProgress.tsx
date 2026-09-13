import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { GoalAcceptanceDraft } from '../../../../shared/goals/goal-acceptance-draft-contract'
import { goalDraftStatusLabel } from '@/goals/goal-draft-status-copy'

export function GoalDraftProgress({
  result,
  error,
  generating,
  saving,
  saveError,
  onRetrySave
}: {
  result: GoalAcceptanceDraft | null
  error: string | null
  generating: boolean
  saving: boolean
  saveError: string | null
  onRetrySave: () => void
}): React.JSX.Element {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!generating) {
      return
    }
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [generating])
  return (
    <div
      className="space-y-1 rounded-md border border-border p-3 text-xs"
      data-testid="goal-draft-progress"
    >
      <p role="status">
        {error
          ? translate('goals.drafts.reconnecting', 'Status unavailable · reconnecting')
          : goalDraftStatusLabel(result, generating)}
      </p>
      {generating && result?.startedAt ? (
        <p className="text-muted-foreground">
          {translate('goals.drafts.elapsed', 'Elapsed')}{' '}
          {Math.max(0, Math.floor((now - result.startedAt) / 1000))}s
          {result.lastActivityAt
            ? ` · ${translate('goals.drafts.lastActivity', 'Last activity')} ${Math.max(0, Math.floor((now - result.lastActivityAt) / 1000))}s`
            : ''}
        </p>
      ) : null}
      {generating ? (
        <p className="text-muted-foreground">{activityLabel(result?.activity)}</p>
      ) : null}
      <p className="text-muted-foreground">
        {translate(
          'goals.drafts.backgroundHint',
          'You can close this editor. Generation continues in the background; find the result in Goal drafts.'
        )}
      </p>
      <p className="text-muted-foreground">
        {saving
          ? translate('goals.drafts.saving', 'Saving draft…')
          : saveError
            ? translate('goals.drafts.unsaved', 'Draft not saved')
            : translate('goals.drafts.saved', 'Draft saved locally')}
      </p>
      {error || result?.error || saveError ? (
        <p role="alert" className="break-words text-destructive">
          {saveError || error || result?.error}
        </p>
      ) : null}
      {saveError ? (
        <Button type="button" variant="outline" size="xs" onClick={onRetrySave}>
          {translate('goals.drafts.retrySave', 'Retry saving')}
        </Button>
      ) : null}
    </div>
  )
}

function activityLabel(activity: GoalAcceptanceDraft['activity']): string {
  switch (activity) {
    case 'connected':
      return translate('goals.drafts.connected', 'Guard connected; waiting for its next activity.')
    case 'tool':
      return translate(
        'goals.drafts.tool',
        'Guard is using a tool to inspect the workspace or referenced material.'
      )
    case 'tool_done':
      return translate(
        'goals.drafts.toolDone',
        'A tool finished; waiting for the guard’s next activity.'
      )
    case 'writing':
      return translate('goals.drafts.writing', 'Guard returned output; preparing the document.')
    case undefined:
    case 'starting':
      return translate(
        'goals.drafts.starting',
        'Starting the guard; waiting for its first activity.'
      )
  }
}
