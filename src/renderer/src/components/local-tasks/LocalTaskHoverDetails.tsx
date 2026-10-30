import { ListTodo, MonitorUp } from 'lucide-react'
import {
  WorktreeCardDetailSection,
  WorktreeCardDetailSectionContent
} from '@/components/sidebar/WorktreeCardDetailSection'
import { DetailHeader, MetadataActionIcon } from '@/components/sidebar/WorktreeCardMetadataControls'
import { translate } from '@/i18n/i18n'
import { openLocalTaskPage } from '@/local-tasks/local-task-navigation'
import type { LocalTaskOfWorkspace } from '@/local-tasks/local-task-workspace-task'
import { LocalTaskStatusIcon } from './LocalTaskIcons'

type Props = {
  linked: LocalTaskOfWorkspace
  /** Closes the hover card before the task page opens. */
  onOpen: () => void
}

function TaskGlyph({ linked, className }: { linked: LocalTaskOfWorkspace; className: string }) {
  return linked.status && linked.inContact ? (
    <LocalTaskStatusIcon
      category={linked.status.category}
      color={linked.status.color}
      className={className}
    />
  ) : (
    <ListTodo className={`${className} text-muted-foreground`} aria-hidden />
  )
}

/** `SHOP-12 · In progress`: the ref is only the gray second line under the title. */
function detailLine(linked: LocalTaskOfWorkspace): string {
  const status = linked.inContact
    ? linked.status?.name
    : translate('localTasks.hover.statusUnverifiable', 'Status can’t be confirmed')
  return status ? `${linked.task.ref} · ${status}` : linked.task.ref
}

function openTaskHandler({ linked, onOpen }: Props): (event: React.MouseEvent) => void {
  return (event) => {
    event.stopPropagation()
    onOpen()
    openLocalTaskPage({ taskId: linked.task.id })
  }
}

/** The hover card's own section when the task is the workspace's only linked item (REQ-016). */
export function LocalTaskHoverSection(props: Props): React.JSX.Element {
  const { linked } = props
  const open = openTaskHandler(props)
  const openLabel = translate('localTasks.links.openTask', 'Open task {{title}}', {
    title: linked.task.title
  })
  return (
    <WorktreeCardDetailSection data-workspace-hover-local-task="">
      <DetailHeader
        icon={<ListTodo className="size-3 text-muted-foreground" />}
        label={translate('localTasks.hover.section', 'Local task')}
        actions={
          <MetadataActionIcon label={openLabel} onClick={open}>
            <MonitorUp className="size-3" />
          </MetadataActionIcon>
        }
      />
      <WorktreeCardDetailSectionContent>
        <button
          type="button"
          className="flex w-full min-w-0 items-start gap-1.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={openLabel}
          onClick={open}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <TaskGlyph linked={linked} className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold leading-snug break-words text-foreground">
              {linked.task.title}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {detailLine(linked)}
            </span>
          </span>
        </button>
      </WorktreeCardDetailSectionContent>
    </WorktreeCardDetailSection>
  )
}

/** The task's row in "Issues & tasks" once the workspace links more than one item (REQ-016). */
export function LocalTaskHoverRow(props: Props): React.JSX.Element {
  const { linked } = props
  const open = openTaskHandler(props)
  return (
    <div className="space-y-1 py-1.5" data-workspace-hover-local-task="">
      <div className="flex min-w-0 items-start gap-2">
        <TaskGlyph linked={linked} className="mt-0.5 size-3.5 shrink-0" />
        <button
          type="button"
          className="min-w-0 flex-1 rounded-sm text-left outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={translate('localTasks.links.openTask', 'Open task {{title}}', {
            title: linked.task.title
          })}
          onClick={open}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <p className="line-clamp-2 text-xs font-medium leading-snug">{linked.task.title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {translate('localTasks.hover.rowDetail', '{{detail}} · Local task', {
              detail: detailLine(linked)
            })}
          </p>
        </button>
      </div>
    </div>
  )
}
