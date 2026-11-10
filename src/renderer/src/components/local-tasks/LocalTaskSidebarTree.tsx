import { useMemo, useState } from 'react'
import { BellDot, Bot, FolderKanban, Layers, ListTodo, Plus, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { localTaskCategory } from '@/local-tasks/local-task-grouping'
import { useLocalTaskLibraryViewer } from '@/local-tasks/local-task-library-viewers'
import { localTaskHostLabelFor } from '@/local-tasks/local-task-endpoint-labels'
import { openLocalTaskPage, openLocalTasksSettings } from '@/local-tasks/local-task-navigation'
import { buildLocalTaskNeedsYouBand } from '@/local-tasks/local-task-needs-you-band'
import {
  LOCAL_TASK_VIEWS,
  localTaskPageStore,
  useLocalTaskPage,
  type LocalTaskView
} from '@/local-tasks/local-task-page-store'
import {
  LOCAL_TASK_TREE_NEEDS_YOU_KEY,
  localTaskSidebarTreeStore,
  localTaskTreeRoots,
  localTaskTreeSearchIds,
  useLocalTaskSidebarTreeExpanded
} from '@/local-tasks/local-task-sidebar-tree'
import { localTaskViewLabel } from '@/local-tasks/local-task-vocabulary-copy'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import { useLocalTaskDispatcherWaitingCount } from './LocalTaskDispatcherView'
import { LocalTaskStatusIcon } from './LocalTaskIcons'
import { LocalTaskSidebarTaskNode } from './LocalTaskSidebarTaskNode'
import { LocalTaskSidebarTreeRow, type LocalTaskTreeNodeKind } from './LocalTaskSidebarTreeRow'
import { LocalTaskUnlinkedSessions } from './LocalTaskUnlinkedSessions'
import { useLocalTaskListModel } from './use-local-task-list-model'

function ViewIcon({ view }: { view: LocalTaskView }): React.JSX.Element {
  if (view === 'all') {
    return <ListTodo className="size-3.5" />
  }
  const color = view === 'started' ? 'yellow' : view === 'completed' ? 'green' : 'gray'
  return <LocalTaskStatusIcon category={view} color={color} />
}

/** A view or project row; selecting it filters the page, its caret lists the tasks it holds. */
function TreeBranch({
  treeKey,
  node,
  icon,
  label,
  detail,
  count,
  countClassName,
  selected,
  onSelect,
  expandable,
  forceOpen = false,
  renderChildren
}: {
  treeKey: string
  node: LocalTaskTreeNodeKind
  icon: React.ReactNode
  label: string
  detail?: string | null
  count: number
  countClassName?: string
  selected: boolean
  onSelect: () => void
  expandable: boolean
  forceOpen?: boolean
  renderChildren?: () => React.ReactNode
}): React.JSX.Element {
  const stored = useLocalTaskSidebarTreeExpanded(treeKey)
  const expanded = expandable && (stored || forceOpen)
  return (
    <>
      <LocalTaskSidebarTreeRow
        node={node}
        depth={0}
        expanded={expandable ? expanded : undefined}
        onToggle={() => localTaskSidebarTreeStore.getState().setExpanded(treeKey, !expanded)}
        selected={selected}
        aria-label={label}
        onActivate={() => {
          onSelect()
          openLocalTaskPage()
        }}
      >
        <span className="flex h-7 min-w-0 items-center gap-2 text-[13px]">
          <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            {icon}
          </span>
          <span
            className={cn(
              'min-w-0 truncate',
              selected ? 'text-foreground' : 'text-sidebar-foreground'
            )}
          >
            {label}
          </span>
          {detail ? (
            <span className="shrink-0 truncate text-2xs text-muted-foreground">{detail}</span>
          ) : null}
          <span
            className={cn(
              'ml-auto shrink-0 pl-1 text-2xs tabular-nums text-muted-foreground',
              countClassName
            )}
          >
            {count}
          </span>
        </span>
      </LocalTaskSidebarTreeRow>
      {expanded && renderChildren ? renderChildren() : null}
    </>
  )
}

function SectionHeading({
  label,
  action
}: {
  label: string
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      role="presentation"
      className="mt-2 flex h-7 items-center gap-1 pl-2 text-2xs font-medium text-muted-foreground"
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {action}
    </div>
  )
}

/** Up, Down, Home and End move between rows; Left on a closed row goes to its parent. */
function moveTreeFocus(event: React.KeyboardEvent<HTMLDivElement>): void {
  if (event.defaultPrevented) {
    return
  }
  const rows = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      '[data-task-tree-row]:not([aria-disabled="true"])'
    )
  )
  const active = document.activeElement
  const current = active instanceof HTMLElement ? rows.indexOf(active) : -1
  let next = -1
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    next = Math.max(0, Math.min(rows.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))
  } else if (event.key === 'Home') {
    next = 0
  } else if (event.key === 'End') {
    next = rows.length - 1
  } else if (event.key === 'ArrowLeft' && current > 0) {
    const level = Number(rows[current].getAttribute('aria-level'))
    next = rows.findLastIndex(
      (row, at) => at < current && Number(row.getAttribute('aria-level')) < level
    )
  }
  if (rows[next]) {
    event.preventDefault()
    rows[next].focus()
  }
}

/**
 * Task mode's sidebar: the task page's own column (Needs you, the status views, projects) as a
 * tree. Selecting a row filters the page; expanding it lists its tasks, a task its sessions and
 * subtasks. Sessions in workspaces no task holds sit at the bottom.
 */
export function LocalTaskSidebarTree(): React.JSX.Element {
  useLocalTaskLibraryViewer()
  const model = useLocalTaskListModel()
  const [query, setQuery] = useState('')
  const view = useLocalTaskPage((state) => state.view)
  const progress = useLocalTasksDomain((state) => state.progress)
  const dispatcherCount = useLocalTaskDispatcherWaitingCount()
  const { index, scopeTasks, tasks, projects, scopeProjectId } = model
  const searchIds = useMemo(
    () => localTaskTreeSearchIds(tasks, index, query),
    [tasks, index, query]
  )
  const inSearch = (task: LocalTask): boolean => searchIds === null || searchIds.has(task.id)
  const scopeIds = useMemo(() => new Set(scopeTasks.map((task) => task.id)), [scopeTasks])
  const band = useMemo(
    () => buildLocalTaskNeedsYouBand({ progress, index, visibleIds: scopeIds }),
    [progress, index, scopeIds]
  )
  const needRows = [...band.waiting, ...band.review].filter((row) => inSearch(row.task))
  const viewRoots = useMemo(() => {
    const roots = new Map<LocalTaskView, LocalTask[]>()
    for (const candidate of LOCAL_TASK_VIEWS) {
      roots.set(
        candidate,
        localTaskTreeRoots(
          scopeTasks,
          index,
          (task) =>
            (candidate === 'all' || localTaskCategory(task, index) === candidate) &&
            (searchIds === null || searchIds.has(task.id))
        )
      )
    }
    return roots
  }, [scopeTasks, index, searchIds])
  const projectRoots = useMemo(() => {
    const keep = (task: LocalTask): boolean => searchIds === null || searchIds.has(task.id)
    const roots = new Map<string | null, LocalTask[]>([
      [null, localTaskTreeRoots(tasks, index, keep)]
    ])
    for (const project of projects) {
      const own = tasks.filter((task) => task.projectId === project.id)
      roots.set(project.id, localTaskTreeRoots(own, index, keep))
    }
    return roots
  }, [tasks, projects, index, searchIds])
  const page = localTaskPageStore.getState()
  const taskNodes = (roots: readonly LocalTask[], path: string): React.ReactNode =>
    roots.map((task) => (
      <LocalTaskSidebarTaskNode
        key={task.id}
        task={task}
        index={index}
        depth={1}
        path={path}
        searchIds={searchIds}
      />
    ))
  const projectBranch = (projectId: string | null): React.JSX.Element => {
    const project = projectId ? index.projectsById.get(projectId) : undefined
    const roots = projectRoots.get(projectId) ?? []
    const treeKey = `project:${projectId ?? 'all'}`
    return (
      <TreeBranch
        key={treeKey}
        treeKey={treeKey}
        node="project"
        icon={project ? <FolderKanban className="size-3.5" /> : <Layers className="size-3.5" />}
        label={project?.name ?? translate('localTasks.nav.allProjects', 'All projects')}
        detail={
          project
            ? [project.prefix, localTaskHostLabelFor(model.hostLabels, project.id)]
                .filter(Boolean)
                .join(' · ')
            : null
        }
        count={project ? (model.taskCountByProject.get(project.id) ?? 0) : tasks.length}
        selected={scopeProjectId === projectId}
        onSelect={() => page.setScope(projectId)}
        expandable={roots.length > 0}
        renderChildren={() => taskNodes(roots, treeKey)}
      />
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 px-2 pb-2">
      <div className="flex items-center gap-1">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-7 min-w-0"
          placeholder={translate('localTasks.sidebar.search', 'Find tasks…')}
          aria-label={translate('localTasks.sidebar.search', 'Find tasks…')}
        />
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={translate('localTasks.create.title', 'New task')}
          onClick={() => openLocalTaskPage({ create: true })}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      <div
        role="tree"
        aria-label={translate('localTasks.sidebar.tree', 'Tasks and sessions')}
        className="min-h-0 flex-1 overflow-y-auto worktree-sidebar-scrollbar"
        onKeyDown={moveTreeFocus}
      >
        <TreeBranch
          treeKey="view:dispatcher"
          node="view"
          icon={<Bot className="size-3.5" />}
          label={translate('localTasks.dispatcher.title', 'Dispatcher')}
          count={dispatcherCount}
          selected={view === 'dispatcher'}
          onSelect={() => page.setView('dispatcher')}
          expandable={false}
        />
        <TreeBranch
          treeKey={LOCAL_TASK_TREE_NEEDS_YOU_KEY}
          node="view"
          icon={<BellDot className="size-3.5" />}
          label={translate('localTasks.needsYou.title', 'Needs you')}
          count={band.waiting.length + band.review.length}
          countClassName={
            band.waiting.length + band.review.length > 0
              ? 'font-semibold text-agent-question-text'
              : undefined
          }
          selected={view === 'needs-you'}
          onSelect={() => page.setView('needs-you')}
          expandable={needRows.length > 0}
          renderChildren={() =>
            needRows.map((row) => (
              <LocalTaskSidebarTaskNode
                key={row.task.id}
                task={row.task}
                index={index}
                depth={1}
                path={LOCAL_TASK_TREE_NEEDS_YOU_KEY}
                need={row}
                searchIds={searchIds}
              />
            ))
          }
        />
        {LOCAL_TASK_VIEWS.map((candidate) => {
          const roots = viewRoots.get(candidate) ?? []
          const treeKey = `view:${candidate}`
          return (
            <TreeBranch
              key={candidate}
              treeKey={treeKey}
              node="view"
              icon={<ViewIcon view={candidate} />}
              label={localTaskViewLabel(candidate)}
              count={model.counts[candidate]}
              selected={view === candidate}
              onSelect={() => page.setView(candidate)}
              expandable={roots.length > 0}
              // Why only All: a search shows each hit once, in the scope the page is on.
              forceOpen={searchIds !== null && candidate === 'all'}
              renderChildren={() => taskNodes(roots, treeKey)}
            />
          )
        })}
        <SectionHeading
          label={translate('localTasks.nav.projects', 'Projects')}
          action={
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
          }
        />
        {projects.length > 0 ? (
          <>
            {projectBranch(null)}
            {projects.map((project) => projectBranch(project.id))}
          </>
        ) : (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            {translate('localTasks.sidebar.empty', 'Create a project to start adding tasks.')}
          </p>
        )}
        <SectionHeading label={translate('localTasks.sidebar.other', 'Other')} />
        <LocalTaskUnlinkedSessions />
      </div>
    </div>
  )
}
