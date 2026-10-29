import {
  ChevronDown,
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
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import { normalizeExecutionHostId } from '../../../../shared/execution-host'
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
import {
  runLocalTaskStart,
  useLocalTaskStartChoices,
  useLocalTaskStartState
} from '@/local-tasks/local-task-work-actions'
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
  return <>{label ?? fallback ?? hostId}</>
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

function LinkedWorkspace({
  link,
  writable,
  canRestart,
  onRestart
}: {
  link: LocalTaskWorkspaceLink
  writable: boolean
  canRestart: boolean
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
              {canRestart ? (
                <Button variant="outline" size="xs" onClick={onRestart}>
                  <Play className="size-3" />
                  {translate('localTasks.links.restart', 'Start again')}
                </Button>
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
                {translate('localTasks.links.useExisting', 'Use existing workspace')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <Row label={translate('localTasks.links.host', 'Host')}>
        <HostLabel hostId={hostId} fallback={link.hostLabelSnapshot} />
        {!inContact ? (
          <span className="ml-1 text-muted-foreground">
            {translate('localTasks.links.notConnected', '(not connected)')}
          </span>
        ) : null}
      </Row>
      {branch ? (
        <Row label={translate('localTasks.links.branch', 'Branch')}>
          <span className="font-mono">{branch}</span>
        </Row>
      ) : null}
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
          {translate(
            'localTasks.links.workspaceUnverifiable',
            'The workspace cannot be reached now.'
          )}
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

function StartActions({
  task,
  project,
  ownLink,
  writable,
  inherited
}: {
  task: LocalTask
  project: LocalTaskProject | undefined
  ownLink: LocalTaskWorkspaceLink | null
  writable: boolean
  /** The task works in an ancestor's workspace, so Start makes it one of its own. */
  inherited: boolean
}): React.JSX.Element {
  const start = useLocalTaskStartState(project, ownLink)
  const choices = useLocalTaskStartChoices(start.mode === 'create' ? project : undefined)
  const run = (orcaProjectId?: string): void => {
    if (project) {
      runLocalTaskStart(task, project, ownLink, orcaProjectId ? { orcaProjectId } : {})
    }
  }
  const startLabel = inherited
    ? translate('localTasks.links.startOwn', 'Start separately')
    : translate('localTasks.links.start', 'Start')
  const startDisabled = !writable || start.reason !== null
  return (
    <div className="flex flex-wrap gap-1.5">
      {start.mode === 'create' ? (
        <span className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button size="xs" disabled={startDisabled} onClick={() => run()}>
                  <Play className="size-3" />
                  {startLabel}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              <span className="flex items-center gap-2">
                {start.reason ??
                  (choices[0]
                    ? translate('localTasks.links.startIn', '{{action}} in {{repo}}', {
                        action: startLabel,
                        repo: choices[0].label
                      })
                    : startLabel)}
                {start.reason ? null : <ShortcutKeyCombo keys={['I']} />}
              </span>
            </TooltipContent>
          </Tooltip>
          {choices.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={startDisabled}>
                <Button
                  variant="outline"
                  size="icon-xs"
                  aria-label={translate(
                    'localTasks.links.startInRepo',
                    'Start in another repository'
                  )}
                >
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>
                  {translate('localTasks.links.startInRepo', 'Start in another repository')}
                </DropdownMenuLabel>
                {choices.map((choice) => (
                  <DropdownMenuItem
                    key={choice.orcaProjectId}
                    onSelect={() => run(choice.orcaProjectId)}
                  >
                    <GitBranch />
                    {choice.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </span>
      ) : null}
      <Button
        variant="outline"
        size="xs"
        disabled={!writable}
        onClick={() =>
          localTaskLinkDialogStore.getState().open({ kind: 'pick-workspace', taskId: task.id })
        }
      >
        <Link2 className="size-3" />
        {translate('localTasks.links.useExisting', 'Use existing workspace')}
      </Button>
    </div>
  )
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
          canRestart={writable && start.mode === 'create' && start.reason === null}
          onRestart={() => project && runLocalTaskStart(task, project, ownLink)}
        />
      ) : (
        <>
          {workspace ? (
            <>
              <p className="text-xs text-muted-foreground">
                {translate('localTasks.links.inheritedWorkspace', 'Uses the workspace of {{ref}}', {
                  ref: inheritedFrom?.ref ?? '?'
                })}
              </p>
              <LinkedWorkspace
                link={workspace}
                writable={false}
                canRestart={false}
                onRestart={() => {}}
              />
            </>
          ) : null}
          <StartActions
            task={task}
            project={project}
            ownLink={null}
            writable={writable}
            inherited={workspace !== null}
          />
        </>
      )}
    </section>
  )
}
