import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ImeInput } from '@/lib/ime-text-field'
import { translate } from '@/i18n/i18n'
import { isImeCompositionKeyDown } from '@/lib/ime-composition-keyboard-event'
import { AgentIcon } from '@/lib/agent-catalog'
import { cn } from '@/lib/utils'
import {
  LOCAL_TASK_BATCH_MAX,
  LOCAL_TASK_TITLE_MAX
} from '../../../../shared/local-tasks/local-task-model'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import type { LocalTaskSessionState } from '../../../../shared/local-tasks/local-task-link-types'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'
import { createLocalSubtasks, parseSubtaskLines } from '@/local-tasks/local-task-writes'
import { useLocalTaskSessionLinks } from '@/local-tasks/local-task-link-selectors'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { selectLocalTaskSessionProgress } from '@/local-tasks/local-task-session-progress'
import { LocalTaskStatusIcon } from './LocalTaskIcons'
import { LocalTaskSubtaskProgress } from './LocalTaskRow'
import { LocalTaskSessionDot, localTaskSessionStateLabel } from './LocalTaskProgress'

const SESSION_STATE_ORDER: readonly LocalTaskSessionState[] = [
  'waiting',
  'blocked',
  'working',
  'done',
  'idle',
  'unverifiable'
]

/** The subtask's own session that says most about it: one waiting on you, then one at work. */
function SubtaskSession({ taskId }: { taskId: string }): React.JSX.Element | null {
  const sessions = useLocalTaskSessionLinks([taskId])
  const picked = useLocalTasksDomain(
    useShallow((state): { id: string; state: LocalTaskSessionState } | null => {
      for (const wanted of SESSION_STATE_ORDER) {
        const match = sessions.findLast(
          (session) => selectLocalTaskSessionProgress(state, session)?.state === wanted
        )
        if (match) {
          return { id: match.id, state: wanted }
        }
      }
      const last = sessions.at(-1)
      return last
        ? { id: last.id, state: selectLocalTaskSessionProgress(state, last)?.state ?? 'unknown' }
        : null
    })
  )
  const session = picked ? sessions.find((candidate) => candidate.id === picked.id) : undefined
  if (!picked || !session) {
    return null
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      <LocalTaskSessionDot link={session} />
      <AgentIcon agent={isTuiAgent(session.agent) ? session.agent : null} size={12} />
      {localTaskSessionStateLabel(picked.state)}
    </span>
  )
}

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

  // Why paste stays: several lines still add one subtask each; the placeholder no longer says so.
  const addRow = writable ? (
    <div
      className={cn(
        'flex items-center gap-2 transition-colors focus-within:bg-accent/40',
        children.length > 0 ? 'px-3' : '-mx-1.5 rounded-md px-1.5'
      )}
    >
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
        placeholder={translate('localTasks.subtasks.add', 'Add subtask')}
        aria-label={translate('localTasks.subtasks.add', 'Add subtask')}
        className={cn(
          'w-full min-w-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground',
          children.length > 0 ? 'h-9 text-sm' : 'h-7 text-xs'
        )}
      />
    </div>
  ) : null

  return (
    <section className="flex flex-col gap-1.5">
      {children.length > 0 ? (
        <>
          <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
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
                  className="flex h-9 w-full min-w-0 items-center gap-2.5 overflow-hidden border-b border-border/40 px-3 text-left text-sm transition-colors last:border-b-0 hover:bg-accent"
                >
                  {status ? (
                    <LocalTaskStatusIcon category={status.category} color={status.color} />
                  ) : null}
                  <span className="min-w-0 truncate text-foreground">{child.title}</span>
                  <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                    {child.ref}
                  </span>
                  <LocalTaskSubtaskProgress task={child} index={index} />
                  <span className="flex-1" />
                  <SubtaskSession taskId={child.id} />
                </button>
              )
            })}
            {addRow}
          </div>
        </>
      ) : (
        addRow
      )}
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
