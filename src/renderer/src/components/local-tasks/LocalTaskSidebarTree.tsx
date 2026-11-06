import { useState } from 'react'
import { ChevronDown, ChevronRight, FolderKanban, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useLocalTaskLibraryViewer } from '@/local-tasks/local-task-library-viewers'
import { openLocalTaskPage } from '@/local-tasks/local-task-navigation'
import { localTaskPageStore, useLocalTaskPage } from '@/local-tasks/local-task-page-store'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { openLocalTaskSession } from '@/local-tasks/local-task-session-reveal'
import { useLocalTaskHostInContact } from '@/local-tasks/local-task-host-contact'
import { useLocalTaskSessionProgress } from '@/local-tasks/local-task-session-progress'
import type { LocalTask, LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
import type { LocalTaskSessionLink } from '../../../../shared/local-tasks/local-task-link-types'
import { LocalTaskNav } from './LocalTaskNav'
import { LocalTaskSessionDot, localTaskSessionStateLabel } from './LocalTaskProgress'
import { LocalTaskStatusIcon } from './LocalTaskIcons'
import { useLocalTaskListModel, type LocalTaskListModel } from './use-local-task-list-model'
import { LocalTaskUnlinkedSessions } from './LocalTaskUnlinkedSessions'

function SessionRow({
  session,
  depth
}: {
  session: LocalTaskSessionLink
  depth: number
}): React.JSX.Element {
  const progress = useLocalTaskSessionProgress(session)
  const inContact = useLocalTaskHostInContact(session.hostId)
  const label = progress?.lastMessage ?? localTaskSessionStateLabel(progress?.state ?? 'unknown')
  return (
    <button
      type="button"
      role="treeitem"
      data-task-tree-row
      aria-level={depth + 1}
      disabled={!inContact}
      title={inContact ? label : translate('localTasks.links.notConnected', '(not connected)')}
      className="flex h-7 w-full items-center gap-2 rounded-md pr-2 text-left text-xs text-muted-foreground hover:bg-sidebar-accent disabled:opacity-60"
      style={{ paddingLeft: 10 + depth * 18 }}
      onClick={() => {
        openLocalTaskPage({ taskId: session.taskId })
        openLocalTaskSession(session)
      }}
    >
      <LocalTaskSessionDot link={session} />
      <span className="truncate">{label}</span>
    </button>
  )
}

function TaskBranch({
  task,
  model,
  depth,
  visible
}: {
  task: LocalTask
  model: LocalTaskListModel
  depth: number
  visible: ReadonlySet<string>
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const selected = useLocalTaskPage((state) => state.detailTaskId === task.id)
  const sessions = useLocalTasksDomain((state) => state.links.sessions)
  const ownSessions = sessions.filter((session) => session.taskId === task.id)
  const children = (model.index.childrenByParentId.get(task.id) ?? []).filter((child) =>
    visible.has(child.id)
  )
  const status = model.index.statusesById.get(task.statusId)
  const expandable = children.length > 0 || ownSessions.length > 0
  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      aria-expanded={expandable ? expanded : undefined}
    >
      <div
        className={cn(
          'flex h-7 items-center rounded-md pr-1 hover:bg-sidebar-accent',
          selected && 'bg-sidebar-accent'
        )}
        style={{ paddingLeft: 4 + depth * 18 }}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-hidden={!expandable}
          disabled={!expandable}
          className="flex size-5 shrink-0 items-center justify-center disabled:invisible"
          aria-label={
            expanded
              ? translate('localTasks.sidebar.collapse', 'Collapse')
              : translate('localTasks.sidebar.expand', 'Expand')
          }
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </button>
        <button
          type="button"
          data-task-tree-row
          data-expanded={expandable ? expanded : undefined}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[13px] text-sidebar-foreground"
          onKeyDown={(event) => {
            if (expandable && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
              event.preventDefault()
              setExpanded(event.key === 'ArrowRight')
            }
          }}
          onClick={() => openLocalTaskPage({ taskId: task.id })}
        >
          {status ? <LocalTaskStatusIcon category={status.category} color={status.color} /> : null}
          <span className="truncate" title={task.title}>
            {task.title}
          </span>
        </button>
      </div>
      {expanded ? (
        <div role="group">
          {children.map((child) => (
            <TaskBranch
              key={child.id}
              task={child}
              model={model}
              depth={depth + 1}
              visible={visible}
            />
          ))}
          {ownSessions.map((session) => (
            <SessionRow key={session.id} session={session} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ProjectBranch({
  project,
  model,
  query
}: {
  project: LocalTaskProject
  model: LocalTaskListModel
  query: string
}): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(true)
  const candidates = model.tasks.filter((task) => task.projectId === project.id)
  const wanted = new Set(
    candidates
      .filter((task) => !query || `${task.title} ${task.ref}`.toLocaleLowerCase().includes(query))
      .map((task) => task.id)
  )
  for (const task of candidates) {
    if (!wanted.has(task.id)) {
      continue
    }
    let parentId = task.parentId
    const visited = new Set<string>()
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId)
      wanted.add(parentId)
      parentId = model.index.tasksById.get(parentId)?.parentId ?? null
    }
  }
  const roots = candidates
    .filter((task) => wanted.has(task.id) && (!task.parentId || !wanted.has(task.parentId)))
    .sort((a, b) => b.updatedAt - a.updatedAt)
  if (query && roots.length === 0) {
    return null
  }
  return (
    <div role="treeitem" aria-expanded={expanded} aria-level={1}>
      <button
        type="button"
        data-task-tree-row
        className="flex h-8 w-full items-center gap-1.5 rounded-md px-1 text-left text-xs font-medium text-sidebar-foreground hover:bg-sidebar-accent"
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault()
            setExpanded(event.key === 'ArrowRight')
          }
        }}
        onClick={() => {
          setExpanded(!expanded)
          localTaskPageStore.getState().setScope(project.id)
          openLocalTaskPage()
          localTaskPageStore.getState().openDetail(null)
        }}
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <FolderKanban className="size-3.5" />
        <span className="min-w-0 flex-1 truncate">{project.name}</span>
        <span className="text-2xs text-muted-foreground">{candidates.length}</span>
      </button>
      {expanded ? (
        <div role="group">
          {roots.map((task) => (
            <TaskBranch key={task.id} task={task} model={model} depth={1} visible={wanted} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function LocalTaskSidebarTree(): React.JSX.Element {
  useLocalTaskLibraryViewer()
  const model = useLocalTaskListModel()
  const [query, setQuery] = useState('')
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2">
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
      <LocalTaskNav model={model} sidebar />
      <div
        role="tree"
        aria-label={translate('localTasks.sidebar.tree', 'Tasks and sessions')}
        className="min-h-0 flex-1 overflow-y-auto worktree-sidebar-scrollbar"
        onKeyDown={(event) => {
          if (
            event.key !== 'ArrowDown' &&
            event.key !== 'ArrowUp' &&
            event.key !== 'Home' &&
            event.key !== 'End'
          ) {
            return
          }
          const rows = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              '[data-task-tree-row]:not(:disabled)'
            )
          )
          const active = document.activeElement
          const current = active instanceof HTMLButtonElement ? rows.indexOf(active) : -1
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? rows.length - 1
                : Math.max(
                    0,
                    Math.min(rows.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))
                  )
          if (rows[next]) {
            event.preventDefault()
            rows[next].focus()
          }
        }}
      >
        {model.projects.map((project) => (
          <ProjectBranch
            key={project.id}
            project={project}
            model={model}
            query={query.trim().toLocaleLowerCase()}
          />
        ))}
        {model.projects.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">
            {translate('localTasks.sidebar.empty', 'Create a project to start adding tasks.')}
          </p>
        ) : null}
        <LocalTaskUnlinkedSessions />
      </div>
    </div>
  )
}
