import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Folder, GitBranch } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useLocalTaskHostInContact } from '@/local-tasks/local-task-host-contact'
import type { LocalTaskWorkspaceLink } from '../../../../shared/local-tasks/local-task-link-types'
import { LocalTaskDiffStat } from './LocalTaskFactRows'
import { LocalTaskHostIcon, useLocalTaskHostLabel } from './LocalTaskHostLabel'
import { useLocalTaskWorkspaceDiff } from './use-local-task-workspace-diff'
import {
  LocalTaskReviewBadge,
  localTaskReviewStateLabel,
  useLocalTaskReview,
  useLocalTaskWorkspace,
  useLocalTaskWorkspaceHostId
} from './LocalTaskProgress'

function Dot(): React.JSX.Element {
  return <span aria-hidden>·</span>
}

/**
 * One line under the task's title: workspace · host · changes · PR, only what exists. The name
 * opens the workspace card; out of contact the host says so and the PR state is not shown as current.
 */
export function LocalTaskWorkspaceLine({
  link,
  inheritedFrom,
  popover
}: {
  link: LocalTaskWorkspaceLink
  /** The ancestor's title when the task works in its workspace. */
  inheritedFrom: string | null
  popover: React.ReactNode
}): React.JSX.Element {
  const located = useLocalTaskWorkspace(link)
  const worktree = located !== null && typeof located !== 'string' ? located : null
  const hostId = useLocalTaskWorkspaceHostId(worktree) ?? link.hostId
  const inContact = useLocalTaskHostInContact(hostId)
  const hostLabel = useLocalTaskHostLabel(hostId, link.hostLabelSnapshot)
  const review = useLocalTaskReview(worktree)
  const diff = useLocalTaskWorkspaceDiff(worktree?.id ?? null)
  const Icon = link.kind === 'folder' ? Folder : GitBranch
  const name =
    worktree?.displayName ??
    link.nameSnapshot ??
    link.branchSnapshot ??
    translate('localTasks.links.workspace', 'Workspace')
  return (
    <Popover>
      <PopoverAnchor asChild>
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          <Icon className="size-3.5 shrink-0" />
          <PopoverTrigger asChild>
            <button
              type="button"
              title={name}
              className="min-w-0 max-w-64 truncate rounded-sm font-medium text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-1 focus-visible:ring-ring"
            >
              {name}
            </button>
          </PopoverTrigger>
          <Dot />
          <span className="flex min-w-0 items-center gap-1">
            <LocalTaskHostIcon hostId={hostId} inContact={inContact} />
            <span className="min-w-0 truncate" title={hostLabel}>
              {hostLabel}
            </span>
            {!inContact ? (
              <span className="shrink-0 text-foreground">
                {translate('localTasks.links.notConnected', '(not connected)')}
              </span>
            ) : null}
          </span>
          {located === 'missing' ? (
            <>
              <Dot />
              <span className="text-destructive">
                {translate('localTasks.links.workspaceGone', 'The workspace was deleted.')}
              </span>
            </>
          ) : null}
          {diff ? (
            <>
              <Dot />
              <LocalTaskDiffStat diff={diff} />
            </>
          ) : null}
          {review ? (
            <>
              <Dot />
              <span className="flex items-center gap-1">
                <LocalTaskReviewBadge review={review} inContact={inContact} />
                {inContact ? <span>{localTaskReviewStateLabel(review)}</span> : null}
              </span>
            </>
          ) : null}
          {inheritedFrom !== null ? (
            <span className="ml-1 truncate">
              {translate(
                'localTasks.links.inheritedWorkspace',
                'Uses the workspace of “{{title}}”',
                { title: inheritedFrom }
              )}
            </span>
          ) : null}
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-80">
        {popover}
      </PopoverContent>
    </Popover>
  )
}
