import { useMemo } from 'react'
import { Folder, GitBranch } from 'lucide-react'
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
import type { AppState } from '@/store/types'
import { selectFolderWorkspaces, selectWorktreesByRepo } from '@/store/workspace-record-selectors'
import { getFolderWorkspaceWorktree } from '@/store/slices/worktrees/listing/detected-worktree-meta'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import type { Worktree } from '../../../../shared/worktree/types'
import type { LocalTaskLinks } from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
import { findLocalTaskLinkForWorkspace } from '@/local-tasks/local-task-link-selectors'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import {
  localTaskBranchName,
  linkLocalTaskWorkspace
} from '@/local-tasks/local-task-workspace-linking'
import {
  localTaskEndpointOwnsHost,
  localTaskWorktreeHostId,
  orcaProjectIdsForWorktree
} from '@/local-tasks/local-task-workspace-resolution'
import { localTaskIdEndpoint } from '@/local-tasks/local-task-endpoints'

export type LocalTaskWorkspaceChoice = {
  worktree: Worktree
  hostId: string
  hostLabel: string
  branch: string | null
  /** Ref of the task that already owns this workspace; such a choice is shown but disabled. */
  ownerRef: string | null
  /** In one of the task project's Orca projects (always, for a project that links none). */
  related: boolean
}

/**
 * Workspaces and folder workspaces on the hosts the project's library serves, a library holding
 * only its own hosts (CONTRACT §2.1). Those of the project's Orca projects come first; the rest
 * stay choosable (REQ-011).
 */
export function listLocalTaskWorkspaceChoices(
  state: AppState,
  candidates: readonly Worktree[],
  project: LocalTaskProject,
  links: LocalTaskLinks,
  tasks: readonly LocalTask[],
  taskId: string
): LocalTaskWorkspaceChoice[] {
  const endpoint = localTaskIdEndpoint(project.id)
  const choices = candidates
    .filter(
      (worktree) =>
        !worktree.isArchived &&
        !worktree.isBare &&
        localTaskEndpointOwnsHost(endpoint, localTaskWorktreeHostId(state, worktree))
    )
    .map((worktree) => {
      const hostId = localTaskWorktreeHostId(state, worktree)
      const owner = findLocalTaskLinkForWorkspace(links, {
        id: worktree.id,
        hostId,
        ...(worktree.instanceId ? { instanceId: worktree.instanceId } : {})
      })
      const projects = orcaProjectIdsForWorktree(state, worktree)
      return {
        worktree,
        hostId,
        hostLabel: selectExecutionHostDisplayLabel(state, hostId),
        branch: localTaskBranchName(worktree),
        ownerRef:
          owner && owner.taskId !== taskId
            ? (tasks.find((task) => task.id === owner.taskId)?.ref ?? '?')
            : null,
        related: project.repos.length === 0 || project.repos.some((id) => projects.has(id))
      }
    })
  return [...choices.filter((choice) => choice.related), ...choices.filter((c) => !c.related)]
}

function WorkspaceChoiceItem({
  choice,
  onPick
}: {
  choice: LocalTaskWorkspaceChoice
  onPick: (choice: LocalTaskWorkspaceChoice) => void
}): React.JSX.Element {
  const Icon = choice.worktree.id.startsWith('folder:') ? Folder : GitBranch
  return (
    <CommandItem
      value={`${choice.worktree.displayName} ${choice.branch ?? ''} ${choice.hostLabel} ${choice.worktree.id}`}
      disabled={choice.ownerRef !== null}
      onSelect={() => onPick(choice)}
    >
      <Icon className="size-3.5 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{choice.worktree.displayName}</span>
        <span className="truncate text-2xs text-muted-foreground">
          {[choice.branch, choice.hostLabel].filter(Boolean).join(' · ')}
        </span>
      </span>
      {choice.ownerRef ? (
        <span className="shrink-0 text-2xs text-muted-foreground">
          {translate('localTasks.links.ownedBy', 'Belongs to {{ref}}', {
            ref: choice.ownerRef
          })}
        </span>
      ) : null}
    </CommandItem>
  )
}

/** 用已有工作区 (REQ-011): the project's own workspaces first; ones owned by another task are greyed. */
export function LocalTaskWorkspacePicker({
  task,
  project,
  replace,
  onClose
}: {
  task: LocalTask
  project: LocalTaskProject
  replace: boolean
  onClose: () => void
}): React.JSX.Element {
  const links = useLocalTasksDomain((state) => state.links)
  const tasks = useLocalTasksDomain((state) => state.tasks)
  const worktreesByRepo = useAppStore(selectWorktreesByRepo)
  const folderWorkspaces = useAppStore(selectFolderWorkspaces)
  const choices = useMemo(
    () =>
      listLocalTaskWorkspaceChoices(
        useAppStore.getState(),
        [
          ...Object.values(worktreesByRepo).flat(),
          ...folderWorkspaces.map(getFolderWorkspaceWorktree)
        ],
        project,
        links,
        tasks,
        task.id
      ),
    [folderWorkspaces, links, project, task.id, tasks, worktreesByRepo]
  )
  const related = choices.filter((choice) => choice.related)
  const others = choices.filter((choice) => !choice.related)
  const pick = async (choice: LocalTaskWorkspaceChoice): Promise<void> => {
    const linked = await linkLocalTaskWorkspace(useAppStore.getState(), {
      taskId: task.id,
      worktree: choice.worktree,
      linkedVia: 'manual',
      replace
    })
    if (linked) {
      onClose()
    }
  }
  const title = translate(
    'localTasks.links.pickWorkspaceTitle',
    'Use an existing workspace for {{ref}}',
    {
      ref: task.ref
    }
  )
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        data-local-task-overlay=""
        aria-describedby={undefined}
        showCloseButton={false}
        className="sm:max-w-md"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <Command surface="inline" density="menu">
          <div className="pb-2 text-xs text-muted-foreground">{title}</div>
          <CommandInput
            placeholder={translate('localTasks.picker.placeholder', 'Type to filter')}
          />
          <CommandList>
            <CommandEmpty>
              {translate('localTasks.links.noWorkspaces', 'No workspaces on this project’s host.')}
            </CommandEmpty>
            {related.length > 0 ? (
              <CommandGroup
                heading={
                  others.length > 0
                    ? translate('localTasks.links.projectWorkspaces', 'This project’s repositories')
                    : undefined
                }
              >
                {related.map((choice) => (
                  <WorkspaceChoiceItem
                    key={`${choice.hostId}|${choice.worktree.id}`}
                    choice={choice}
                    onPick={(picked) => void pick(picked)}
                  />
                ))}
              </CommandGroup>
            ) : null}
            {others.length > 0 ? (
              <CommandGroup
                heading={translate('localTasks.links.otherWorkspaces', 'Other repositories')}
              >
                {others.map((choice) => (
                  <WorkspaceChoiceItem
                    key={`${choice.hostId}|${choice.worktree.id}`}
                    choice={choice}
                    onPick={(picked) => void pick(picked)}
                  />
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
