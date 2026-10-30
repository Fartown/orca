import { useMemo } from 'react'
import {
  FileDiff,
  Folder,
  GitBranch,
  Link2,
  MoreHorizontal,
  Play,
  SquareArrowOutUpRight,
  Unlink
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { getWorkspaceStatusVisualMeta } from '@/components/sidebar/workspace-status'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import { cn } from '@/lib/utils'
import { normalizeExecutionHostId } from '../../../../shared/execution-host'
import {
  getWorkspaceStatus,
  withDefaultWorkspaceStatuses
} from '../../../../shared/workspace-statuses'
import type { Worktree } from '../../../../shared/worktree/types'
import type { LocalTaskWorkspaceLink } from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
import { useLocalTaskHostInContact } from '@/local-tasks/local-task-host-contact'
import { localTaskLinkDialogStore } from '@/local-tasks/local-task-link-dialog-store'
import {
  localTaskBranchName,
  unlinkLocalTaskWorkspace
} from '@/local-tasks/local-task-workspace-linking'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { useLocalTaskRowWriteReason } from '@/local-tasks/local-task-write-reason'
import { runLocalTaskStart, useLocalTaskStartState } from '@/local-tasks/local-task-work-actions'
import { LocalTaskActionTooltip } from './LocalTaskActionTooltip'
import { LocalTaskStartActions } from './LocalTaskStartActions'
import {
  LocalTaskReviewBadge,
  localTaskChecksLabel,
  localTaskReviewStateLabel,
  useLocalTaskReview,
  useLocalTaskWorkspace,
  useLocalTaskWorkspaceHostId
} from './LocalTaskProgress'

function openWorkspace(worktree: Worktree, hostId: string | null): void {
  const executionHostId = normalizeExecutionHostId(hostId)
  activateAndRevealWorkspace(worktree.id, executionHostId ? { executionHostId } : undefined)
}

function openChanges(worktree: Worktree, hostId: string | null): void {
  openWorkspace(worktree, hostId)
  const state = useAppStore.getState()
  state.setRightSidebarTab('source-control')
  state.setRightSidebarOpen(true)
}

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0 truncate text-foreground">{children}</div>
    </div>
  )
}

function HostLabel({
  hostId,
  fallback
}: {
  hostId: string
  fallback: string | null
}): React.JSX.Element {
  const label = useAppStore((state) => {
    const id = normalizeExecutionHostId(hostId)
    return id ? selectExecutionHostDisplayLabel(state, id) : null
  })
  const text = label ?? fallback ?? hostId
  // Why the title: the row truncates a long host name, so hovering shows it whole.
  return (
    <span className="min-w-0 truncate" title={text}>
      {text}
    </span>
  )
}

function ChangeStats({ worktreeId }: { worktreeId: string }): React.JSX.Element | null {
  // Why cached only: the task page never starts a compare; it shows what source control already has.
  const summary = useAppStore((state) => state.gitBranchCompareSummaryByWorktree[worktreeId])
  if (summary?.status !== 'ready') {
    return null
  }
  return (
    <Row label={translate('localTasks.links.changes', 'Changes')}>
      {translate('localTasks.links.changedFiles', '{{count}} files vs {{base}}', {
        count: summary.changedFiles,
        base: summary.baseRef
      })}
      {summary.commitsAhead !== undefined ? (
        <span className="ml-1 font-mono text-2xs text-muted-foreground">
          ↑{summary.commitsAhead}
          {summary.commitsBehind !== undefined ? ` ↓${summary.commitsBehind}` : ''}
        </span>
      ) : null}
    </Row>
  )
}

/**
 * The workspace's own status, as the sidebar board shows it; read only here, since a task's status
 * and its workspace's are kept apart (REQ-012). Out of contact it is only the last copy read.
 */
function WorkspaceStatusRow({
  worktree,
  inContact
}: {
  worktree: Worktree
  inContact: boolean
}): React.JSX.Element | null {
  const statuses = useAppStore((state) => state.workspaceStatuses)
  const status = useMemo(() => {
    const known = withDefaultWorkspaceStatuses(statuses)
    const id = getWorkspaceStatus(worktree, known)
    return known.find((candidate) => candidate.id === id) ?? null
  }, [statuses, worktree])
  if (!status) {
    return null
  }
  const meta = getWorkspaceStatusVisualMeta(status)
  return (
    <Row label={translate('localTasks.links.workspaceStatus', 'Status')}>
      <span
        className={cn('flex min-w-0 items-center gap-1.5', !inContact && 'opacity-60')}
        title={
          inContact ? undefined : translate('localTasks.links.state.unverifiable', 'Can’t confirm')
        }
      >
        <meta.icon className={cn('size-3.5 shrink-0', meta.tone)} />
        <span className="truncate">{status.label}</span>
      </span>
    </Row>
  )
}

function LinkedWorkspace({
  link,
  writable,
  restart,
  onRestart
}: {
  link: LocalTaskWorkspaceLink
  writable: boolean
  /** Offered once the workspace is gone and Start can create one; greyed with its reason. */
  restart: { reason: string | null } | null
  onRestart: () => void
}): React.JSX.Element {
  const located = useLocalTaskWorkspace(link)
  const worktree = located !== null && typeof located !== 'string' ? located : null
  const hostId = useLocalTaskWorkspaceHostId(worktree) ?? link.hostId
  const inContact = useLocalTaskHostInContact(hostId)
  const review = useLocalTaskReview(worktree)
  const Icon = link.kind === 'folder' ? Folder : GitBranch
  const name = worktree?.displayName ?? link.nameSnapshot ?? link.worktreeId ?? ''
  const branch = (worktree ? localTaskBranchName(worktree) : null) ?? link.branchSnapshot
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/60 p-2.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground" title={name}>
          {name}
        </span>
        {writable ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={translate('localTasks.links.workspaceActions', 'Workspace actions')}
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void unlinkLocalTaskWorkspace(link.taskId)}>
                <Unlink />
                {translate('localTasks.links.unlinkWorkspace', 'Unlink workspace')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {located === 'missing' ? (
        <div className="flex flex-col gap-2 text-xs text-muted-foreground">
          <span className="text-destructive">
            {translate('localTasks.links.workspaceGone', 'The workspace was deleted.')}
          </span>
          {writable ? (
            <div className="flex flex-wrap gap-1.5">
              {restart ? (
                <LocalTaskActionTooltip reason={restart.reason}>
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={restart.reason !== null}
                    onClick={onRestart}
                  >
                    <Play className="size-3" />
                    {translate('localTasks.links.restart', 'Start work again')}
                  </Button>
                </LocalTaskActionTooltip>
              ) : null}
              <Button
                variant="outline"
                size="xs"
                onClick={() =>
                  localTaskLinkDialogStore
                    .getState()
                    .open({ kind: 'pick-workspace', taskId: link.taskId })
                }
              >
                <Link2 className="size-3" />
                {translate('localTasks.links.useExisting', 'Link an existing workspace')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <Row label={translate('localTasks.links.host', 'Host')}>
        {/* Why split: a long host name truncates, never the "(not connected)" after it. */}
        <span className="flex min-w-0">
          <HostLabel hostId={hostId} fallback={link.hostLabelSnapshot} />
          {!inContact ? (
            <span className="ml-1 shrink-0 text-muted-foreground">
              {translate('localTasks.links.notConnected', '(not connected)')}
            </span>
          ) : null}
        </span>
      </Row>
      {branch ? (
        <Row label={translate('localTasks.links.branch', 'Branch')}>
          <span className="font-mono">{branch}</span>
        </Row>
      ) : null}
      {worktree ? <WorkspaceStatusRow worktree={worktree} inContact={inContact} /> : null}
      {review ? (
        <Row label={getReviewRowLabel(review.provider)}>
          <span className="flex min-w-0 items-center gap-1.5">
            <LocalTaskReviewBadge review={review} inContact={inContact} />
            <span className="truncate text-muted-foreground">
              {inContact
                ? [localTaskReviewStateLabel(review), localTaskChecksLabel(review.status)]
                    .filter(Boolean)
                    .join(' · ')
                : translate('localTasks.links.state.unverifiable', 'Can’t confirm')}
            </span>
          </span>
        </Row>
      ) : null}
      {worktree ? <ChangeStats worktreeId={worktree.id} /> : null}
      {located === 'unverifiable' && inContact ? (
        <span className="text-xs text-muted-foreground">
          {translate('localTasks.links.workspaceUnverifiable', 'Can’t confirm the workspace now.')}
        </span>
      ) : null}
      {worktree ? (
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="xs" onClick={() => openWorkspace(worktree, hostId)}>
            <SquareArrowOutUpRight className="size-3" />
            {translate('localTasks.links.openWorkspace', 'Open workspace')}
          </Button>
          {link.kind === 'git-worktree' ? (
            <Button variant="outline" size="xs" onClick={() => openChanges(worktree, hostId)}>
              <FileDiff className="size-3" />
              {translate('localTasks.links.viewChanges', 'View changes')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function getReviewRowLabel(provider: string): string {
  return provider === 'gitlab'
    ? translate('localTasks.links.mergeRequest', 'MR')
    : translate('localTasks.links.pullRequest', 'PR')
}

/**
 * The detail's 工作区 card (REQ-009, REQ-011, REQ-012) for a task of any level. A task with no
 * workspace of its own shows the nearest ancestor's it works in, and can still start its own.
 */
export function LocalTaskWorkspaceCard({
  task,
  project,
  ownLink,
  workspace,
  index,
  writable
}: {
  task: LocalTask
  project: LocalTaskProject | undefined
  ownLink: LocalTaskWorkspaceLink | null
  /** Its own link, else the nearest ancestor's. */
  workspace: LocalTaskWorkspaceLink | null
  index: LocalTaskIndex
  writable: boolean
}): React.JSX.Element {
  const start = useLocalTaskStartState(project, ownLink)
  const writeReason = useLocalTaskRowWriteReason(task.id)
  const inheritedFrom = workspace && !ownLink ? index.tasksById.get(workspace.taskId) : undefined
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">
        {translate('localTasks.links.workspace', 'Workspace')}
      </h3>
      {ownLink ? (
        <LinkedWorkspace
          link={ownLink}
          writable={writable}
          restart={start.mode === 'create' ? { reason: start.reason } : null}
          onRestart={() => project && runLocalTaskStart(task, project, ownLink)}
        />
      ) : (
        <>
          {workspace ? (
            <>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'localTasks.links.inheritedWorkspace',
                  'Uses the workspace of “{{title}}”',
                  {
                    title: inheritedFrom?.title ?? '?'
                  }
                )}
              </p>
              <LinkedWorkspace
                link={workspace}
                writable={false}
                restart={null}
                onRestart={() => {}}
              />
            </>
          ) : null}
          <LocalTaskStartActions
            task={task}
            project={project}
            ownLink={null}
            writeReason={writeReason}
            inherited={workspace !== null}
          />
        </>
      )}
    </section>
  )
}
