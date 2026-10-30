import { BellDot, ChevronDown, FolderKanban, Layers, ListTodo, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
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
import { liveLocalTaskItems } from '@/local-tasks/local-task-needs-you-rows'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { localTaskHostLabelFor } from '@/local-tasks/local-task-endpoint-labels'
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

function useNeedsYouCount(model: LocalTaskListModel): number {
  return useLocalTasksDomain(
    (state) =>
      liveLocalTaskItems(state.progress, model.index.tasksById, model.scopeProjectId).length
  )
}

function useScopeLabel(model: LocalTaskListModel): { scope: string; view: string } {
  const view = useLocalTaskPage((state) => state.view)
  return {
    scope: model.scopeProject?.name ?? translate('localTasks.nav.allProjects', 'All projects'),
    view:
      view === 'needs-you'
        ? translate('localTasks.needsYou.title', 'Needs you')
        : localTaskViewLabel(view)
  }
}

/** `Project · View`, the heading while the rail is shown. */
export function LocalTaskScopeTitle({
  model,
  className
}: {
  model: LocalTaskListModel
  className?: string
}): React.JSX.Element {
  const label = useScopeLabel(model)
  return (
    <h2
      className={cn('mr-1 min-w-0 shrink truncate text-sm font-medium text-foreground', className)}
    >
      {label.scope}
      <span className="ml-1.5 font-normal text-muted-foreground">· {label.view}</span>
    </h2>
  )
}

/** The rail's views and projects as one menu, for a page too narrow to show the rail. */
export function LocalTaskScopeMenu({
  model,
  className
}: {
  model: LocalTaskListModel
  className?: string
}): React.JSX.Element {
  const view = useLocalTaskPage((state) => state.view)
  const needsYouCount = useNeedsYouCount(model)
  const label = useScopeLabel(model)
  const page = localTaskPageStore.getState()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={cn('min-w-0 shrink justify-start', className)}>
          <span className="min-w-0 truncate font-medium text-foreground">{label.scope}</span>
          <span className="shrink-0 font-normal text-muted-foreground">· {label.view}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuRadioGroup
          value={view}
          onValueChange={(next) => {
            if (next === 'needs-you') {
              page.setView('needs-you')
              return
            }
            const candidate = LOCAL_TASK_VIEWS.find((option) => option === next)
            if (candidate) {
              page.setView(candidate)
            }
          }}
        >
          <MenuOption value="needs-you" count={needsYouCount}>
            <BellDot className="size-3.5" />
            {translate('localTasks.needsYou.title', 'Needs you')}
          </MenuOption>
          {LOCAL_TASK_VIEWS.map((candidate) => (
            <MenuOption key={candidate} value={candidate} count={model.counts[candidate]}>
              <ViewIcon view={candidate} />
              {localTaskViewLabel(candidate)}
            </MenuOption>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{translate('localTasks.nav.projects', 'Projects')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={model.scopeProjectId ?? ''}
          onValueChange={(next) => page.setScope(next === '' ? null : next)}
        >
          <MenuOption value="" count={model.tasks.length}>
            <Layers className="size-3.5" />
            {translate('localTasks.nav.allProjects', 'All projects')}
          </MenuOption>
          {model.projects.map((project) => (
            <MenuOption
              key={project.id}
              value={project.id}
              count={model.taskCountByProject.get(project.id) ?? 0}
            >
              <FolderKanban className="size-3.5" />
              <span className="min-w-0 truncate">{project.name}</span>
            </MenuOption>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={openLocalTasksSettings}>
          <Settings className="size-3.5" />
          {translate('localTasks.nav.manageProjects', 'Manage projects and statuses')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MenuOption({
  value,
  count,
  children
}: {
  value: string
  count: number
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <DropdownMenuRadioItem value={value}>
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      <span className="text-2xs tabular-nums text-muted-foreground">{count}</span>
    </DropdownMenuRadioItem>
  )
}

/** Views count every task in the current project scope, subtasks included (REQ-006). */
export function LocalTaskNav({ model }: { model: LocalTaskListModel }): React.JSX.Element {
  const view = useLocalTaskPage((state) => state.view)
  const scopeProjectId = model.scopeProjectId
  const needsYouCount = useNeedsYouCount(model)
  return (
    <nav
      aria-label={translate('localTasks.nav.label', 'Task views')}
      className="hidden w-52 shrink-0 flex-col gap-4 overflow-y-auto scrollbar-sleek @3xl/local-task-page:flex"
    >
      <div className="flex flex-col gap-0.5">
        <NavRow
          active={view === 'needs-you'}
          icon={<BellDot className="size-3.5" />}
          label={translate('localTasks.needsYou.title', 'Needs you')}
          count={needsYouCount}
          onSelect={() => localTaskPageStore.getState().setView('needs-you')}
        />
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
            detail={[project.prefix, localTaskHostLabelFor(model.hostLabels, project.id)]
              .filter(Boolean)
              .join(' · ')}
            count={model.taskCountByProject.get(project.id) ?? 0}
            onSelect={() => localTaskPageStore.getState().setScope(project.id)}
          />
        ))}
      </div>
    </nav>
  )
}
