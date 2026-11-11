import { LocalTaskNeedsYouMarker } from './LocalTaskLatestProgress'
import { memo, useEffect, useRef } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { formatLocalTaskTime } from '@/local-tasks/local-task-time'
import { cn } from '@/lib/utils'
import { localTaskSubtaskProgress, type LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { LOCAL_TASK_ROW_ATTRIBUTE } from '@/local-tasks/local-task-page-keys'
import { localTaskPageStore, useLocalTaskPage } from '@/local-tasks/local-task-page-store'
import type { LocalTaskStatusHead } from '../../../../shared/local-tasks/local-task-list-groups'
import type { LocalTask, LocalTaskStatusDef } from '../../../../shared/local-tasks/local-task-types'
import { LocalTaskHostTag } from './LocalTaskHostTag'
import { LocalTaskPriorityIcon, LocalTaskStatusIcon } from './LocalTaskIcons'
import {
  LocalTaskRowBandActions,
  LocalTaskRowBandBadge,
  LocalTaskRowHoverPreview,
  LocalTaskRowStartCell,
  stopRowClick
} from './LocalTaskRowActions'
import {
  LocalTaskHostCell,
  LocalTaskOfflineNote,
  LocalTaskRowReview,
  LocalTaskSessionCell,
  LocalTaskSubtaskLine,
  LocalTaskWorkspaceCell,
  useLocalTaskLeadSession,
  useLocalTaskRowSessions,
  useLocalTaskRowWorkspace,
  type LocalTaskRowWorkspace
} from './LocalTaskRowFacts'
import { LocalTaskAttentionLine, LocalTaskProgressLine } from './LocalTaskRowProgress'
import type { LocalTaskBandRow } from '@/local-tasks/local-task-needs-you-band'

export function LocalTaskLabelChips({
  labels,
  max = 2
}: {
  labels: readonly string[]
  max?: number
}): React.JSX.Element | null {
  if (labels.length === 0) {
    return null
  }
  return (
    <span className="flex min-w-0 shrink items-center gap-1">
      {labels.slice(0, max).map((label) => (
        <span
          key={label}
          className="max-w-24 truncate rounded-full border border-border/60 px-1.5 text-2xs leading-4 text-muted-foreground"
        >
          {label}
        </span>
      ))}
      {labels.length > max ? (
        <span className="text-2xs text-muted-foreground">+{labels.length - max}</span>
      ) : null}
    </span>
  )
}

export function LocalTaskSubtaskProgress({
  task,
  index
}: {
  task: LocalTask
  index: LocalTaskIndex
}): React.JSX.Element | null {
  const progress = localTaskSubtaskProgress(task, index)
  if (!progress) {
    return null
  }
  return (
    <span
      className="shrink-0 font-mono text-2xs text-muted-foreground"
      title={translate('localTasks.row.subtaskProgress', 'Subtasks done: {{done}} of {{total}}', {
        done: progress.done,
        total: progress.total
      })}
    >
      {progress.done}/{progress.total}
    </span>
  )
}

// Why 34: the status glyph lines up with the group head's; the checkbox sits in the gutter before it.
const INDENT_BASE_PX = 34
const INDENT_STEP_PX = 20
// Why capped: past a few levels deeper indent only squeezes the title.
const INDENT_DEPTH_MAX = 4

function FoldToggle({ task, folded }: { task: LocalTask; folded: boolean }): React.JSX.Element {
  const Icon = folded ? ChevronRight : ChevronDown
  return (
    <button
      type="button"
      aria-expanded={!folded}
      aria-label={
        folded
          ? translate('localTasks.row.unfold', 'Show subtasks of “{{title}}”', {
              title: task.title
            })
          : translate('localTasks.row.fold', 'Hide subtasks of “{{title}}”', { title: task.title })
      }
      onClick={(event) => {
        event.stopPropagation()
        localTaskPageStore.getState().toggleTaskCollapsed(task.id)
      }}
      className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
    >
      <Icon className="size-3.5" />
    </button>
  )
}

/** A status group's identity: a status id, or `category:<category>` across projects. */
export function localTaskStatusHeading(head: LocalTaskStatusHead): string {
  return head.kind === 'status' ? head.status.id : `category:${head.category}`
}

/** The chip says nothing new under its own status, or its category when that holds one status. */
function repeatsHeading(
  status: LocalTaskStatusDef,
  heading: string | null,
  index: LocalTaskIndex,
  projectId: string
): boolean {
  if (heading === status.id) {
    return true
  }
  if (heading !== `category:${status.category}`) {
    return false
  }
  const statuses = index.projectsById.get(projectId)?.statuses ?? []
  return statuses.filter((candidate) => candidate.category === status.category).length <= 1
}

/** Status glyph (and fold toggle when present), each 16px with a 10px gap; the lines under the title align past them. */
const LEAD_SLOT_PX = 26

function SecondLine({
  task,
  index,
  band,
  workspace,
  hasSessions
}: {
  task: LocalTask
  index: LocalTaskIndex
  band: LocalTaskBandRow | undefined
  workspace: LocalTaskRowWorkspace
  hasSessions: boolean
}): React.JSX.Element | null {
  const waitingItem =
    band?.group === 'waiting'
      ? (band.items.find((item) => item.kind !== 'unread-done') ?? band.items[0])
      : undefined
  if (waitingItem) {
    return <LocalTaskAttentionLine item={waitingItem} />
  }
  const line = <LocalTaskProgressLine task={task} index={index} workspace={workspace} />
  if (workspace.link || hasSessions) {
    return line
  }
  const firstLine = task.description.split('\n').find((text) => text.trim())
  return (
    <span className="truncate text-xs text-muted-foreground">
      {firstLine ?? translate('localTasks.row.notStarted', 'No workspace or session yet')}
    </span>
  )
}

/**
 * One list row: title first, then where it works, on which host, what its sessions are doing and
 * when; the newest writeback below, and a parent's subtasks under that. As the list narrows, host,
 * workspace and time drop out before the title does. A Needs you row adds its own actions.
 */
export const LocalTaskRow = memo(function LocalTaskRow({
  task,
  index,
  statusHeading,
  depth,
  folded,
  hostLabels,
  band
}: {
  task: LocalTask
  index: LocalTaskIndex
  statusHeading: string | null
  depth: number
  folded: boolean | null
  hostLabels?: ReadonlyMap<string, string>
  band?: LocalTaskBandRow
}): React.JSX.Element {
  useUiLanguageRevision()
  const isCursor = useLocalTaskPage((state) => state.cursorTaskId === task.id)
  // Why not on hover: scrolling a half-shown row under the pointer would hover the next one.
  const reveal = useLocalTaskPage(
    (state) => state.cursorTaskId === task.id && !state.cursorFromPointer
  )
  const isSelected = useLocalTaskPage((state) => state.selectedTaskIds.includes(task.id))
  const rowRef = useRef<HTMLDivElement>(null)
  const status = index.statusesById.get(task.statusId)
  const workspace = useLocalTaskRowWorkspace(task, index)
  const sessions = useLocalTaskRowSessions(task, index, workspace.link)
  const lead = useLocalTaskLeadSession(sessions)
  useEffect(() => {
    if (reveal) {
      rowRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [reveal])
  const open = (): void => localTaskPageStore.getState().openDetail(task.id)
  const subtasks = index.childrenByParentId.has(task.id)
  const unstarted = status?.category === 'unstarted' || status?.category === 'backlog'
  const leadWidth = folded === null && depth === 0 ? LEAD_SLOT_PX : LEAD_SLOT_PX * 2
  return (
    <div
      ref={rowRef}
      role="button"
      tabIndex={-1}
      {...{ [LOCAL_TASK_ROW_ATTRIBUTE]: '' }}
      aria-current={isCursor ? 'true' : undefined}
      data-current={isCursor ? 'true' : undefined}
      onClick={open}
      onMouseMove={() => {
        if (!isCursor) {
          localTaskPageStore.getState().setCursor(task.id, 'pointer')
        }
      }}
      style={{
        paddingLeft: `${INDENT_BASE_PX + Math.min(depth, INDENT_DEPTH_MAX) * INDENT_STEP_PX}px`
      }}
      className={cn(
        'group/row relative flex min-w-0 cursor-pointer flex-col gap-1 overflow-hidden border-b border-border/40 py-2 pr-3 text-[13px] transition-colors last:border-b-0 hover:bg-accent/60',
        isCursor && 'bg-accent',
        isSelected && 'bg-accent/80'
      )}
    >
      <span
        className={cn(
          'absolute left-2 top-2.5 flex size-4 items-center justify-center opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100',
          isSelected && 'opacity-100'
        )}
        onClick={stopRowClick}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => localTaskPageStore.getState().toggleSelected(task.id)}
          aria-label={translate('localTasks.row.select', 'Select “{{title}}”', {
            title: task.title
          })}
        />
      </span>
      <div className="flex min-w-0 items-center gap-2.5">
        {folded !== null ? (
          <FoldToggle task={task} folded={folded} />
        ) : depth > 0 ? (
          // Why: a subtask with no fold sits under one that has it; keep the slot so it nests.
          <span className="size-4 shrink-0" aria-hidden />
        ) : null}
        <span className="flex size-4 shrink-0 items-center justify-center">
          {status ? <LocalTaskStatusIcon category={status.category} color={status.color} /> : null}
        </span>
        <span className="flex min-w-16 flex-1 items-center gap-2">
          <span className="truncate font-medium text-foreground">{task.title}</span>
          <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{task.ref}</span>
          {task.priority !== 0 ? <LocalTaskPriorityIcon priority={task.priority} /> : null}
          {band ? <LocalTaskRowBandBadge band={band} /> : <LocalTaskNeedsYouMarker task={task} />}
          {status && !band && !repeatsHeading(status, statusHeading, index, task.projectId) ? (
            <span className="hidden shrink-0 rounded-sm bg-muted px-1.5 text-2xs leading-4 text-muted-foreground @xl/local-task-list:inline">
              {status.name}
            </span>
          ) : null}
          <LocalTaskHostTag
            id={task.id}
            labels={hostLabels}
            className="hidden max-w-24 shrink-0 @2xl/local-task-list:block"
          />
          <span className="hidden min-w-0 @5xl/local-task-list:flex">
            <LocalTaskLabelChips labels={task.labels} />
          </span>
        </span>
        <span className="hidden w-36 shrink-0 @2xl/local-task-list:flex">
          <LocalTaskWorkspaceCell workspace={workspace} />
        </span>
        <span className="hidden w-20 shrink-0 @3xl/local-task-list:flex">
          <LocalTaskHostCell workspace={workspace} />
        </span>
        <span className="hidden w-28 shrink-0 @xl/local-task-list:flex">
          {lead ? (
            <LocalTaskSessionCell sessions={sessions} lead={lead} inContact={workspace.inContact} />
          ) : unstarted && !workspace.link ? (
            <LocalTaskRowStartCell task={task} index={index} />
          ) : null}
        </span>
        <LocalTaskUpdatedAt at={task.updatedAt} />
      </div>
      <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: leadWidth }}>
        <span className="min-w-0 flex-1">
          <SecondLine
            task={task}
            index={index}
            band={band}
            workspace={workspace}
            hasSessions={sessions.length > 0}
          />
        </span>
        <LocalTaskRowReview workspace={workspace} />
        {band ? (
          <LocalTaskRowBandActions band={band} lead={lead} />
        ) : workspace.hostId && !workspace.inContact ? (
          <LocalTaskOfflineNote workspace={workspace} />
        ) : lead ? (
          <LocalTaskRowHoverPreview lead={lead} />
        ) : null}
      </div>
      {subtasks && depth === 0 ? (
        <div className="min-w-0" style={{ paddingLeft: leadWidth }}>
          <LocalTaskSubtaskLine task={task} index={index} />
        </div>
      ) : null}
    </div>
  )
})

/** Ticks on its own, so the minute clock never re-renders the whole row or list. */
function LocalTaskUpdatedAt({ at }: { at: number }): React.JSX.Element {
  const now = useNow(60_000)
  return (
    <span className="hidden w-12 shrink-0 text-right text-2xs text-muted-foreground @2xl/local-task-list:inline">
      {formatLocalTaskTime(at, now)}
    </span>
  )
}
