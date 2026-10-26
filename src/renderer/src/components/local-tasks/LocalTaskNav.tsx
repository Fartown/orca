import { FolderKanban, Layers, ListTodo, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  LOCAL_TASK_VIEWS,
  localTaskPageStore,
  useLocalTaskPage,
  type LocalTaskView
} from '@/local-tasks/local-task-page-store'
import { localTaskViewLabel } from '@/local-tasks/local-task-vocabulary-copy'
import { openLocalTasksSettings } from '@/local-tasks/local-task-navigation'
import { LocalTaskStatusIcon } from './LocalTaskIcons'
import type { LocalTaskListModel } from './use-local-task-list-model'

function NavRow({
  active,
  icon,
  label,
  detail,
  count,
  onSelect
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  detail?: string
  count: number
  onSelect: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      data-current={active ? 'true' : undefined}
      className={cn(
        'flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-muted-foreground transition hover:bg-accent hover:text-foreground',
        active && 'bg-accent text-foreground'
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">
        {label}
        {detail ? (
          <span className="ml-1.5 font-mono text-2xs text-muted-foreground">{detail}</span>
        ) : null}
      </span>
      <span className="text-2xs tabular-nums text-muted-foreground">{count}</span>
    </button>
  )
}

function ViewIcon({ view }: { view: LocalTaskView }): React.JSX.Element {
  if (view === 'all') {
    return <ListTodo className="size-3.5" />
  }
  const color = view === 'started' ? 'yellow' : view === 'completed' ? 'green' : 'gray'
  return <LocalTaskStatusIcon category={view} color={color} />
}

/** Views count every task in the current project scope, subtasks included (REQ-006). */
export function LocalTaskNav({ model }: { model: LocalTaskListModel }): React.JSX.Element {
  const view = useLocalTaskPage((state) => state.view)
  const scopeProjectId = model.scopeProjectId
  const taskCountByProject = new Map<string, number>()
  for (const task of model.tasks) {
    taskCountByProject.set(task.projectId, (taskCountByProject.get(task.projectId) ?? 0) + 1)
  }
  return (
    <nav
      aria-label={translate('localTasks.nav.label', 'Task views')}
      className="flex w-52 shrink-0 flex-col gap-4 overflow-y-auto scrollbar-sleek"
    >
      <div className="flex flex-col gap-0.5">
        {LOCAL_TASK_VIEWS.map((candidate) => (
          <NavRow
            key={candidate}
            active={view === candidate}
            icon={<ViewIcon view={candidate} />}
            label={localTaskViewLabel(candidate)}
            count={model.counts[candidate]}
            onSelect={() => localTaskPageStore.getState().setView(candidate)}
          />
        ))}
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="flex h-6 items-center justify-between px-2">
          <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            {translate('localTasks.nav.projects', 'Projects')}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={openLocalTasksSettings}
                aria-label={translate(
                  'localTasks.nav.manageProjects',
                  'Manage projects and statuses'
                )}
              >
                <Settings className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {translate('localTasks.nav.manageProjects', 'Manage projects and statuses')}
            </TooltipContent>
          </Tooltip>
        </div>
        <NavRow
          active={scopeProjectId === null}
          icon={<Layers className="size-3.5" />}
          label={translate('localTasks.nav.allProjects', 'All projects')}
          count={model.tasks.length}
          onSelect={() => localTaskPageStore.getState().setScope(null)}
        />
        {model.projects.map((project) => (
          <NavRow
            key={project.id}
            active={scopeProjectId === project.id}
            icon={<FolderKanban className="size-3.5" />}
            label={project.name}
            detail={project.prefix}
            count={taskCountByProject.get(project.id) ?? 0}
            onSelect={() => localTaskPageStore.getState().setScope(project.id)}
          />
        ))}
      </div>
    </nav>
  )
}
