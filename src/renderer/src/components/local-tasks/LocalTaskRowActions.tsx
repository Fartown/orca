import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CheckCheck, Eye, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { localTaskAttentionKindLabel } from '@/local-tasks/local-task-attention-copy'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import type { LocalTaskBandRow } from '@/local-tasks/local-task-needs-you-band'
import { openLocalTaskItemSession } from '@/local-tasks/local-task-needs-you-actions'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'
import { openLocalTaskSession } from '@/local-tasks/local-task-session-reveal'
import { useLocalTaskWorkspaceLink } from '@/local-tasks/local-task-link-selectors'
import { runLocalTaskStart, useLocalTaskStartState } from '@/local-tasks/local-task-work-actions'
import { isLocalTaskRowWritable, useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import type { LocalTaskSessionLink } from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import { LocalTaskSnoozeMenu } from './LocalTaskSnoozeMenu'

/* The Needs you row's badge and actions, and Start on a task with no workspace yet. */

export function LocalTaskRowBandBadge({ band }: { band: LocalTaskBandRow }): React.JSX.Element {
  const item = band.items.find((candidate) => candidate.kind !== 'unread-done') ?? band.items[0]
  return band.group === 'review' ? (
    <span className="shrink-0 rounded-sm bg-status-success-background px-1.5 text-2xs leading-4 text-status-success">
      {translate('localTasks.row.awaitingAcceptance', 'Awaiting acceptance')}
    </span>
  ) : (
    <span className="shrink-0 rounded-sm bg-status-warning-background px-1.5 text-2xs leading-4 text-status-warning">
      {item ? localTaskAttentionKindLabel(item.kind) : null}
    </span>
  )
}

export function stopRowClick(event: React.SyntheticEvent): void {
  event.stopPropagation()
}

export function LocalTaskRowBandActions({
  band,
  lead
}: {
  band: LocalTaskBandRow
  lead: LocalTaskSessionLink | null
}): React.JSX.Element {
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const now = useNow(60_000)
  const writable = useLocalTasksDomain(
    useShallow((state) =>
      band.items.filter((item) => isLocalTaskRowWritable(state, item.taskSessionId))
    )
  )
  const preview = (): void => {
    const item = band.items[0]
    if (band.group === 'waiting' && item) {
      openLocalTaskItemSession(item)
    } else if (lead) {
      openLocalTaskSession(lead)
    }
  }
  return (
    <span
      className="flex shrink-0 items-center gap-1"
      onClick={stopRowClick}
      onKeyDown={stopRowClick}
    >
      <Button
        variant="outline"
        size="xs"
        disabled={band.group === 'review' ? !lead : band.items.length === 0}
        onClick={preview}
      >
        <Eye className="size-3.5" />
        {translate('localTasks.row.preview', 'Preview')}
      </Button>
      {band.group === 'waiting' ? (
        <LocalTaskSnoozeMenu
          items={writable}
          open={snoozeOpen}
          onOpenChange={setSnoozeOpen}
          now={now}
          label={translate('localTasks.row.remindLater', 'Remind me later')}
        />
      ) : (
        <Button
          variant="outline"
          size="xs"
          onClick={() => localTaskPageStore.getState().openDetail(band.task.id)}
        >
          <CheckCheck className="size-3.5" />
          {translate('localTasks.row.goAccept', 'Review')}
        </Button>
      )}
    </span>
  )
}

export function LocalTaskRowStartCell({ task, index }: { task: LocalTask; index: LocalTaskIndex }) {
  const project = index.projectsById.get(task.projectId)
  const ownLink = useLocalTaskWorkspaceLink(task.id)
  const start = useLocalTaskStartState(project, ownLink)
  if (!project || start.mode === 'hidden') {
    return null
  }
  return (
    <span onClick={stopRowClick} onKeyDown={stopRowClick}>
      <Button
        variant="ghost"
        size="xs"
        disabled={start.reason !== null}
        title={start.reason ?? undefined}
        onClick={() => runLocalTaskStart(task, project, ownLink)}
      >
        <Play className="size-3" />
        {translate('localTasks.row.start', 'Start')}
      </Button>
    </span>
  )
}

/** An ordinary row offers Preview of its lead session only while the pointer is on it. */
export function LocalTaskRowHoverPreview({
  lead
}: {
  lead: LocalTaskSessionLink
}): React.JSX.Element {
  return (
    <span
      className="shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100"
      onClick={stopRowClick}
      onKeyDown={stopRowClick}
    >
      <Button variant="ghost" size="xs" onClick={() => openLocalTaskSession(lead)}>
        <Eye className="size-3.5" />
        {translate('localTasks.row.preview', 'Preview')}
      </Button>
    </span>
  )
}
