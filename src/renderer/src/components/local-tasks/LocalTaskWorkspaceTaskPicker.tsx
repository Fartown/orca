import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { normalizeExecutionHostId } from '../../../../shared/execution-host'
import { LOCAL_TASK_STATUS_CATEGORIES } from '../../../../shared/local-tasks/local-task-model'
import type { LocalTaskLinks } from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
import type { Worktree } from '../../../../shared/worktree/types'
import {
  localTaskLinkDialogStore,
  useLocalTaskLinkDialog
} from '@/local-tasks/local-task-link-dialog-store'
import { findLocalTaskLinkForWorkspace } from '@/local-tasks/local-task-link-selectors'
import {
  useLocalTasksDomain,
  useWritableLocalTaskEndpoints
} from '@/local-tasks/local-tasks-domain-store'
import {
  linkLocalTaskWorkspace,
  unlinkLocalTaskWorkspace
} from '@/local-tasks/local-task-workspace-linking'
import {
  localTaskEndpointOwnsHost,
  orcaProjectIdsForWorktree
} from '@/local-tasks/local-task-workspace-resolution'
import { localTaskIdEndpoint } from '@/local-tasks/local-task-endpoints'
import { LocalTaskStatusIcon } from './LocalTaskIcons'
import { useLocalTaskEscapeLayer } from './use-local-task-page-keys'

export type LocalTaskTaskChoice = {
  task: LocalTask
  /** Name of the workspace this task already has; such a task is shown but disabled. */
  linkedWorkspace: string | null
  /** Its project links the workspace's Orca project. */
  related: boolean
}

/**
 * Tasks of any level a workspace may join (REQ-011, D-008), from the library of the Orca serving
 * its host only: those of task projects linking the workspace's Orca project first, then the rest;
 * within each, open categories first, newest first.
 */
export function listLocalTaskChoicesForWorkspace(
  projectIds: ReadonlySet<string>,
  hostId: string,
  projects: readonly LocalTaskProject[],
  tasks: readonly LocalTask[],
  links: LocalTaskLinks
): LocalTaskTaskChoice[] {
  const eligible = new Map(
    projects
      .filter((project) => localTaskEndpointOwnsHost(localTaskIdEndpoint(project.id), hostId))
      .map((p) => [p.id, p])
  )
  const isRelated = (task: LocalTask): boolean =>
    eligible.get(task.projectId)?.repos.some((repoId) => projectIds.has(repoId)) === true
  const categoryRank = (task: LocalTask): number => {
    const category = eligible
      .get(task.projectId)
      ?.statuses.find((s) => s.id === task.statusId)?.category
    return category
      ? LOCAL_TASK_STATUS_CATEGORIES.indexOf(category)
      : LOCAL_TASK_STATUS_CATEGORIES.length
  }
  return tasks
    .filter((task) => eligible.has(task.projectId))
    .map((task) => {
      const link = links.workspaces.find((candidate) => candidate.taskId === task.id)
      return {
        task,
        linkedWorkspace: link
          ? (link.nameSnapshot ?? link.branchSnapshot ?? link.worktreeId ?? '')
          : null,
        related: isRelated(task)
      }
    })
    .sort(
      (left, right) =>
        Number(right.related) - Number(left.related) ||
        categoryRank(left.task) - categoryRank(right.task) ||
        right.task.number - left.task.number
    )
}

function TaskChoiceItem({
  choice,
  projects,
  writable,
  onPick
}: {
  choice: LocalTaskTaskChoice
  projects: readonly LocalTaskProject[]
  writable: boolean
  onPick: (task: LocalTask) => void
}): React.JSX.Element {
  const { task, linkedWorkspace } = choice
  const project = projects.find((candidate) => candidate.id === task.projectId)
  const status = project?.statuses.find((candidate) => candidate.id === task.statusId)
  return (
    <CommandItem
      value={`${task.ref} ${task.title}`}
      disabled={!writable || linkedWorkspace !== null}
      onSelect={() => onPick(task)}
    >
      {status ? <LocalTaskStatusIcon category={status.category} color={status.color} /> : null}
      <span className="w-16 shrink-0 truncate font-mono text-xs text-muted-foreground">
        {task.ref}
      </span>
      <span className="min-w-0 flex-1 truncate">{task.title}</span>
      {linkedWorkspace !== null ? (
        <span className="max-w-32 shrink-0 truncate text-2xs text-muted-foreground">
          {translate('localTasks.links.hasWorkspace', 'Has {{name}}', {
            name: linkedWorkspace
          })}
        </span>
      ) : null}
    </CommandItem>
  )
}

function PickerBody({
  worktree,
  hostId
}: {
  worktree: Worktree
  hostId: string
}): React.JSX.Element {
  const links = useLocalTasksDomain((state) => state.links)
  const tasks = useLocalTasksDomain((state) => state.tasks)
  const projects = useLocalTasksDomain((state) => state.projects)
  const writableEndpoints = useWritableLocalTaskEndpoints()
  const projectIdList = useAppStore(
    useShallow((state) => [...orcaProjectIdsForWorktree(state, worktree)].sort())
  )
  const projectIds = useMemo(() => new Set(projectIdList), [projectIdList])
  const choices = useMemo(
    () => listLocalTaskChoicesForWorkspace(projectIds, hostId, projects, tasks, links),
    [hostId, links, projectIds, projects, tasks]
  )
  const related = choices.filter((choice) => choice.related)
  const others = choices.filter((choice) => !choice.related)
  const current = findLocalTaskLinkForWorkspace(links, {
    id: worktree.id,
    hostId,
    ...(worktree.instanceId ? { instanceId: worktree.instanceId } : {})
  })
  const currentTask = current ? tasks.find((task) => task.id === current.taskId) : undefined
  const close = (): void => localTaskLinkDialogStore.getState().close()
  const pick = async (task: LocalTask): Promise<void> => {
    const normalized = normalizeExecutionHostId(hostId)
    const linked = await linkLocalTaskWorkspace(useAppStore.getState(), {
      taskId: task.id,
      worktree,
      ...(normalized ? { hostId: normalized } : {}),
      linkedVia: 'manual'
    })
    if (linked) {
      close()
    }
  }
  const title = translate('localTasks.links.pickTaskTitle', 'Link {{name}} to a task', {
    name: worktree.displayName
  })
  return (
    <>
      <DialogTitle className="sr-only">{title}</DialogTitle>
      <Command surface="inline" density="menu">
        <div className="pb-2 text-xs text-muted-foreground">{title}</div>
        {current ? (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate">
              {translate('localTasks.links.currentTask', 'Linked to {{ref}} · {{title}}', {
                ref: currentTask?.ref ?? '?',
                title: currentTask?.title ?? ''
              })}
            </span>
            <Button
              variant="ghost"
              size="xs"
              disabled={!writableEndpoints.includes(localTaskIdEndpoint(current.taskId))}
              onClick={() => {
                void unlinkLocalTaskWorkspace(current.taskId)
                close()
              }}
            >
              <Unlink className="size-3" />
              {translate('localTasks.links.unlink', 'Unlink')}
            </Button>
          </div>
        ) : null}
        <CommandInput placeholder={translate('localTasks.picker.placeholder', 'Type to filter')} />
        <CommandList>
          <CommandEmpty>
            {choices.length === 0
              ? translate(
                  'localTasks.links.noTasksForWorkspace',
                  'No tasks on this workspace’s host yet.'
                )
              : translate('localTasks.picker.empty', 'Nothing matches.')}
          </CommandEmpty>
          {[related, others].map((group, at) =>
            group.length > 0 ? (
              <CommandGroup
                key={at === 0 ? 'related' : 'others'}
                heading={
                  related.length > 0 && others.length > 0
                    ? at === 0
                      ? translate(
                          'localTasks.links.relatedTasks',
                          'Projects tracking this repository'
                        )
                      : translate('localTasks.links.otherTasks', 'Other projects')
                    : undefined
                }
              >
                {group.map((choice) => (
                  <TaskChoiceItem
                    key={choice.task.id}
                    choice={choice}
                    projects={projects}
                    writable={writableEndpoints.includes(localTaskIdEndpoint(choice.task.id))}
                    onPick={(task) => void pick(task)}
                  />
                ))}
              </CommandGroup>
            ) : null
          )}
        </CommandList>
      </Command>
    </>
  )
}

/** Mounted once in the background so a sidebar menu can open it after the menu closes. */
export function LocalTaskWorkspaceTaskPickerHost(): React.JSX.Element | null {
  const dialog = useLocalTaskLinkDialog()
  const target = dialog?.kind === 'pick-task' ? dialog : null
  const worktree = useAppStore((state) =>
    target
      ? state.getKnownWorktreeById(
          target.worktreeId,
          normalizeExecutionHostId(target.hostId) ?? undefined
        )
      : undefined
  )
  const close = (): void => localTaskLinkDialogStore.getState().close()
  useLocalTaskEscapeLayer('dialog', target !== null && worktree !== undefined, close)
  if (!target || !worktree) {
    return null
  }
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        data-local-task-overlay=""
        aria-describedby={undefined}
        showCloseButton={false}
        className="sm:max-w-md"
      >
        <PickerBody worktree={worktree} hostId={target.hostId} />
      </DialogContent>
    </Dialog>
  )
}
