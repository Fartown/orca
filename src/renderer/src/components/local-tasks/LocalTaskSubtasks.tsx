import { useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ImeInput } from '@/lib/ime-text-field'
import { translate } from '@/i18n/i18n'
import { isImeCompositionKeyDown } from '@/lib/ime-composition-keyboard-event'
import {
  LOCAL_TASK_BATCH_MAX,
  LOCAL_TASK_TITLE_MAX
} from '../../../../shared/local-tasks/local-task-model'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'
import { createLocalSubtasks, parseSubtaskLines } from '@/local-tasks/local-task-writes'
import { LocalTaskPriorityIcon, LocalTaskStatusIcon } from './LocalTaskIcons'
import { LocalTaskSubtaskProgress } from './LocalTaskRow'
import { LocalTaskProgressBadges } from './LocalTaskProgress'

/** Direct subtasks of a task at any level; pasting several lines adds one per line (REQ-004). */
export function LocalTaskSubtasks({
  task,
  index,
  writable
}: {
  task: LocalTask
  index: LocalTaskIndex
  writable: boolean
}): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingTitles, setPendingTitles] = useState<string[]>([])
  const children = index.childrenByParentId.get(task.id) ?? []

  const add = async (titles: string[]): Promise<void> => {
    const batch = titles.map((title) => title.slice(0, LOCAL_TASK_TITLE_MAX))
    if (batch.length === 0 || busy) {
      return
    }
    setBusy(true)
    let createdCount = 0
    for (let offset = 0; offset < batch.length; offset += LOCAL_TASK_BATCH_MAX) {
      const created = await createLocalSubtasks(
        task,
        batch.slice(offset, offset + LOCAL_TASK_BATCH_MAX)
      )
      if (!created) {
        setPendingTitles(batch.slice(offset))
        setBusy(false)
        return
      }
      createdCount += created.length
    }
    setBusy(false)
    setDraft('')
    setPendingTitles([])
    if (createdCount > 1) {
      toast.success(
        translate('localTasks.subtasks.added', 'Added {{count}} subtasks', {
          count: createdCount
        })
      )
    }
  }

  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {translate('localTasks.subtasks.title', 'Subtasks')}
        <LocalTaskSubtaskProgress task={task} index={index} />
      </h3>
      <div className="overflow-hidden rounded-md border border-border/60">
        {children.map((child) => {
          const status = index.statusesById.get(child.statusId)
          return (
            <button
              key={child.id}
              type="button"
              onClick={() => localTaskPageStore.getState().openDetail(child.id)}
              className="flex h-9 w-full items-center gap-2.5 border-b border-border/40 px-3 text-left text-[13px] transition-colors hover:bg-accent"
            >
              <LocalTaskPriorityIcon priority={child.priority} />
              {status ? (
                <LocalTaskStatusIcon category={status.category} color={status.color} />
              ) : null}
              <span className="w-16 shrink-0 truncate font-mono text-xs text-muted-foreground">
                {child.ref}
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground">{child.title}</span>
              <LocalTaskSubtaskProgress task={child} index={index} />
              <LocalTaskProgressBadges task={child} index={index} />
              <span className="shrink-0 text-2xs text-muted-foreground">{status?.name}</span>
            </button>
          )
        })}
        {writable ? (
          <div className="flex items-center gap-2 px-3 transition-colors focus-within:bg-accent/40">
            <Plus className="size-3.5 shrink-0 text-muted-foreground" />
            <ImeInput
              value={draft}
              disabled={busy || pendingTitles.length > 0}
              maxLength={LOCAL_TASK_TITLE_MAX}
              onChange={(event) => setDraft(event.target.value)}
              onPaste={(event) => {
                const lines = parseSubtaskLines(event.clipboardData.getData('text/plain'))
                if (lines.length > 1) {
                  event.preventDefault()
                  void add(lines)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !isImeCompositionKeyDown(event)) {
                  event.preventDefault()
                  void add(draft.trim() ? [draft.trim()] : [])
                }
              }}
              placeholder={translate(
                'localTasks.subtasks.placeholder',
                'Add a subtask — paste several lines to add one per line'
              )}
              aria-label={translate('localTasks.subtasks.add', 'Add subtask')}
              className="h-9 w-full min-w-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60"
            />
          </div>
        ) : null}
      </div>
      {pendingTitles.length > 0 ? (
        <Button
          variant="outline"
          size="xs"
          className="w-fit"
          disabled={busy}
          onClick={() => void add(pendingTitles)}
        >
          {translate('localTasks.subtasks.retryRemaining', 'Retry remaining {{count}} subtasks', {
            count: pendingTitles.length
          })}
        </Button>
      ) : null}
    </section>
  )
}
