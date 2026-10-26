import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import type { LocalTaskListGroup } from '@/local-tasks/local-task-list-groups'
import { EMPTY_LOCAL_TASK_FILTERS, localTaskPageStore } from '@/local-tasks/local-task-page-store'
import { isLocalTasksWritable, useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { LocalTaskGroupIcon, localTaskGroupLabel, openCreateInGroup } from './LocalTaskGroupHead'
import { LocalTaskRow } from './LocalTaskRow'
import type { LocalTaskListModel } from './use-local-task-list-model'

function GroupHeader({
  group,
  collapsed,
  onToggle,
  model,
  writable
}: {
  group: LocalTaskListGroup
  collapsed: boolean
  onToggle: () => void
  model: LocalTaskListModel
  writable: boolean
}): React.JSX.Element {
  return (
    <div className="flex h-8 items-center gap-2 border-b border-border/40 bg-muted/30 pr-2 pl-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-medium text-foreground"
      >
        {collapsed ? (
          <ChevronRight className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-3.5 text-muted-foreground" />
        )}
        <LocalTaskGroupIcon head={group} />
        <span className="truncate">{localTaskGroupLabel(group)}</span>
        <span className="text-2xs tabular-nums text-muted-foreground">{group.entries.length}</span>
      </button>
      {writable ? (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => openCreateInGroup(group, model)}
          aria-label={translate('localTasks.list.addInGroup', 'New task in {{group}}', {
            group: localTaskGroupLabel(group)
          })}
        >
          <Plus className="size-3.5" />
        </Button>
      ) : null}
    </div>
  )
}

function EmptyList({ hasTasks }: { hasTasks: boolean }): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
      {hasTasks ? (
        <>
          {translate('localTasks.list.noMatches', 'No tasks match this view.')}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const page = localTaskPageStore.getState()
              page.setFilters(EMPTY_LOCAL_TASK_FILTERS)
              page.setQuery('')
              page.setView('all')
            }}
          >
            {translate('localTasks.list.showAll', 'Show all tasks')}
          </Button>
        </>
      ) : (
        translate('localTasks.list.empty', 'No tasks yet. Press C to write down the first one.')
      )}
    </div>
  )
}

/** Grouped as the toolbar says; subtasks sit indented under a shown parent (REQ-006). */
export function LocalTaskList({ model }: { model: LocalTaskListModel }): React.JSX.Element {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const writable = useLocalTasksDomain(isLocalTasksWritable)
  const now = useNow(60_000)
  if (model.groups.length === 0) {
    return <EmptyList hasTasks={model.scopeTasks.length > 0} />
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border/60 scrollbar-sleek">
      {model.groups.map((group) => {
        const isCollapsed = collapsed.has(group.key)
        const label = localTaskGroupLabel(group)
        // Why: a status chip only repeats the heading when rows are grouped by status.
        const statusHeading = group.kind === 'status' || group.kind === 'category' ? label : null
        return (
          <section key={group.key} aria-label={label}>
            <GroupHeader
              group={group}
              collapsed={isCollapsed}
              model={model}
              writable={writable}
              onToggle={() =>
                setCollapsed((previous) => {
                  const next = new Set(previous)
                  if (!next.delete(group.key)) {
                    next.add(group.key)
                  }
                  return next
                })
              }
            />
            {isCollapsed
              ? null
              : group.entries.map((entry) => (
                  <div key={entry.task.id}>
                    <LocalTaskRow
                      task={entry.task}
                      index={model.index}
                      groupLabel={statusHeading}
                      nested={false}
                      now={now}
                    />
                    {entry.children.map((child) => (
                      <LocalTaskRow
                        key={child.id}
                        task={child}
                        index={model.index}
                        groupLabel={statusHeading}
                        nested
                        now={now}
                      />
                    ))}
                  </div>
                ))}
          </section>
        )
      })}
    </div>
  )
}
