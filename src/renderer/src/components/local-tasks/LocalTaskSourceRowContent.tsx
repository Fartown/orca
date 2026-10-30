import { Info, ListTodo } from 'lucide-react'
import type { LocalTaskSourceRow } from '@/local-tasks/local-task-source-rows'
import { useLocalTaskSourceTab } from '@/local-tasks/local-task-source-tab'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { LocalTaskStatusIcon } from './LocalTaskIcons'

/** A Local tasks row's icon in Orca's source results: the task's status, as the task list shows it. */
export function LocalTaskSourceRowIcon({ row }: { row: LocalTaskSourceRow }): React.JSX.Element {
  const task = row.task
  const status = useLocalTasksDomain((state) =>
    task
      ? state.projects
          .find((project) => project.id === task.projectId)
          ?.statuses.find((candidate) => candidate.id === task.statusId)
      : undefined
  )
  if (!task) {
    return <Info className="size-3.5 shrink-0 text-muted-foreground" />
  }
  return status ? (
    <LocalTaskStatusIcon category={status.category} color={status.color} />
  ) : (
    <ListTodo className="size-3.5 shrink-0 text-muted-foreground" />
  )
}

/** The title leads; the ref follows small and grey, and why a row is greyed comes last. */
export function LocalTaskSourceRowLabel({ row }: { row: LocalTaskSourceRow }): React.JSX.Element {
  if (!row.task) {
    return <span className="min-w-0 truncate text-muted-foreground">{row.note}</span>
  }
  return (
    <>
      <span className="min-w-0 truncate text-foreground">{row.task.title}</span>
      <span className="shrink-0 font-mono text-2xs text-muted-foreground">{row.task.ref}</span>
      {row.note ? (
        <span className="ml-auto max-w-32 shrink-0 truncate text-2xs text-muted-foreground">
          {row.note}
        </span>
      ) : null}
    </>
  )
}

/** The source pill's icon for a picked task, with its ref beside the title the pill shows. */
export function LocalTaskSourceSelectionIcon(): React.JSX.Element {
  const selectedTaskId = useLocalTaskSourceTab()?.selectedTaskId ?? null
  const ref = useLocalTasksDomain(
    (state) => state.tasks.find((task) => task.id === selectedTaskId)?.ref ?? null
  )
  return (
    <>
      <ListTodo className="size-3.5 shrink-0 text-muted-foreground" />
      {ref ? (
        <span className="shrink-0 font-mono text-2xs text-muted-foreground">{ref}</span>
      ) : null}
    </>
  )
}
