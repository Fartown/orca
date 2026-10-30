import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Check, GitBranch, MoreHorizontal, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { LOCAL_TASK_PROJECT_REPOS_MAX } from '../../../../../shared/local-tasks/local-task-model'
import type { LocalTaskProject } from '../../../../../shared/local-tasks/local-task-types'
import { localTaskRepoCandidates } from '@/local-tasks/local-task-project-repos'
import {
  localTaskReposPatch,
  type LocalTaskRepoEdit
} from '../../../../../shared/local-tasks/local-task-repos-patch'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { localTasksDomainStore, useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { runLocalTaskWrite } from '@/local-tasks/local-task-writes'

function AddRepo({
  project,
  onAdd
}: {
  project: LocalTaskProject
  onAdd: (repoId: string) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const taskProjects = useLocalTasksDomain((state) => state.projects)
  const orcaProjects = useAppStore((state) => state.projects)
  const repos = useAppStore((state) => state.repos)
  const setups = useAppStore((state) => state.projectHostSetups)
  const candidates = useMemo(
    () =>
      localTaskRepoCandidates(
        { projects: orcaProjects, repos, projectHostSetups: setups },
        project,
        taskProjects
      ),
    [project, taskProjects, orcaProjects, repos, setups]
  )
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="xs" className="w-fit">
          <Plus className="size-3" />
          {translate('localTasks.settings.addRepo', 'Add repository')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="p-1">
          <Command surface="inline" density="menu">
            <CommandInput
              placeholder={translate('localTasks.picker.placeholder', 'Type to filter')}
            />
            <CommandList>
              <CommandEmpty>
                {translate(
                  'localTasks.settings.noRepoCandidates',
                  'No other repository in Orca on this project’s host.'
                )}
              </CommandEmpty>
              <CommandGroup>
                {candidates.map((candidate) => (
                  <CommandItem
                    key={candidate.orcaProjectId}
                    value={`${candidate.label} ${candidate.orcaProjectId}`}
                    onSelect={() => {
                      setOpen(false)
                      onAdd(candidate.orcaProjectId)
                    }}
                  >
                    <GitBranch className="size-3.5 text-muted-foreground" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{candidate.label}</span>
                      {candidate.alsoIn.length > 0 ? (
                        <span className="truncate text-2xs text-muted-foreground">
                          {translate('localTasks.settings.repoAlsoIn', 'Also in {{projects}}', {
                            projects: candidate.alsoIn.join(', ')
                          })}
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * A task project's repos (REQ-001): none, one or several Orca projects on its own host, one of them
 * the default Start picks. Each change replaces the whole list in the project's library.
 */
export function LocalTaskProjectRepos({
  project,
  writable
}: {
  project: LocalTaskProject
  writable: boolean
}): React.JSX.Element {
  const names = useAppStore(
    useShallow((state) =>
      project.repos.map(
        (repoId) =>
          state.projects.find((candidate) => candidate.id === repoId)?.displayName ?? repoId
      )
    )
  )
  const [busy, setBusy] = useState(false)
  const edit = async (change: LocalTaskRepoEdit): Promise<void> => {
    const patch = localTaskReposPatch(project, change)
    if (!patch || busy) {
      return
    }
    setBusy(true)
    const result = await runLocalTaskWrite(() =>
      localTasksClient.updateProject({
        projectId: project.id,
        expectedRevision: project.revision,
        ...patch
      })
    )
    setBusy(false)
    if (result) {
      localTasksDomainStore.getState().upsertProject(result.project)
    }
  }
  return (
    <div className="space-y-2">
      <Label>{translate('localTasks.settings.repos', 'Repositories')}</Label>
      {project.repos.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border/60 rounded-md border border-border/60">
          {project.repos.map((repoId, at) => (
            <li key={repoId} className="flex min-w-0 items-center gap-2 px-3 py-1.5 text-sm">
              <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-foreground">{names[at]}</span>
              {repoId === project.defaultRepoId ? (
                <span className="flex shrink-0 items-center gap-1 text-2xs text-muted-foreground">
                  <Check className="size-3" />
                  {translate('localTasks.settings.defaultRepo', 'Default')}
                </span>
              ) : null}
              {writable ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild disabled={busy}>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={translate(
                        'localTasks.settings.repoActions',
                        'Actions for {{name}}',
                        {
                          name: names[at]
                        }
                      )}
                    >
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {repoId === project.defaultRepoId ? null : (
                      <DropdownMenuItem onSelect={() => void edit({ kind: 'default', repoId })}>
                        {translate('localTasks.settings.makeDefaultRepo', 'Make default')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => void edit({ kind: 'remove', repoId })}
                    >
                      {translate('localTasks.settings.removeRepo', 'Remove from project')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {translate('localTasks.settings.reposNone', 'None: this project only tracks tasks')}
        </p>
      )}
      {!writable ? null : project.repos.length < LOCAL_TASK_PROJECT_REPOS_MAX ? (
        <AddRepo project={project} onAdd={(repoId) => void edit({ kind: 'add', repoId })} />
      ) : (
        <p className="text-xs text-muted-foreground">
          {translate(
            'localTasks.settings.reposFull',
            'A project links up to {{count}} repositories. Remove one to add another.',
            { count: LOCAL_TASK_PROJECT_REPOS_MAX }
          )}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {translate(
          'localTasks.settings.reposHelp',
          'Start work creates workspaces in these repositories, the default one first, on this project’s host. Several projects can share a repository.'
        )}
      </p>
    </div>
  )
}
