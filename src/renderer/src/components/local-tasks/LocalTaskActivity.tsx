import { useEffect, useState } from 'react'
import { LoaderCircle, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { formatLocalTaskTime } from '@/local-tasks/local-task-time'
import { isImeCompositionKeyDown } from '@/lib/ime-composition-keyboard-event'
import { LOCAL_TASK_COMMENT_MAX } from '../../../../shared/local-tasks/local-task-model'
import type { LocalTaskEvent } from '../../../../shared/local-tasks/local-task-types'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { describeLocalTaskEvent, localTaskEventActor } from '@/local-tasks/local-task-event-copy'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { localTasksSync } from '@/local-tasks/local-tasks-sync'
import { runLocalTaskWrite } from '@/local-tasks/local-task-writes'

const IS_MAC = navigator.userAgent.includes('Mac')

function isSubmitKey(event: React.KeyboardEvent): boolean {
  return (
    event.key === 'Enter' &&
    (IS_MAC ? event.metaKey : event.ctrlKey) &&
    !isImeCompositionKeyDown(event)
  )
}

function CommentComposer({
  initial,
  submitLabel,
  onSubmit,
  onCancel
}: {
  initial: string
  submitLabel: string
  onSubmit: (body: string) => Promise<boolean>
  onCancel?: () => void
}): React.JSX.Element {
  const [body, setBody] = useState(initial)
  const [busy, setBusy] = useState(false)
  const submit = async (): Promise<void> => {
    if (!body.trim() || busy) {
      return
    }
    setBusy(true)
    const saved = await onSubmit(body.trim())
    setBusy(false)
    if (saved && !onCancel) {
      setBody('')
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={body}
        maxLength={LOCAL_TASK_COMMENT_MAX}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (isSubmitKey(event)) {
            event.preventDefault()
            void submit()
          }
        }}
        placeholder={translate('localTasks.activity.commentPlaceholder', 'Write a comment…')}
        aria-label={translate('localTasks.activity.commentLabel', 'Comment')}
        className="min-h-16"
      />
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button variant="ghost" size="xs" onClick={onCancel}>
            {translate('localTasks.common.cancel', 'Cancel')}
          </Button>
        ) : null}
        <Button
          size="xs"
          variant="secondary"
          disabled={!body.trim() || busy}
          onClick={() => void submit()}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}

function CommentEntry({
  event,
  now,
  writable
}: {
  event: LocalTaskEvent
  now: number
  writable: boolean
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  return (
    <li className="flex flex-col gap-1 rounded-md border border-border/60 bg-card px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{localTaskEventActor(event.source)}</span>
        <span>{formatLocalTaskTime(event.createdAt, now)}</span>
        {event.editedAt ? <span>{translate('localTasks.activity.edited', '(edited)')}</span> : null}
        {writable && !editing ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="ml-auto"
                aria-label={translate('localTasks.activity.commentActions', 'Comment actions')}
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                {translate('localTasks.activity.editComment', 'Edit')}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() =>
                  void runLocalTaskWrite(() => localTasksClient.removeComment(event.id))
                }
              >
                {translate('localTasks.activity.deleteComment', 'Delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {editing ? (
        <CommentComposer
          initial={event.body ?? ''}
          submitLabel={translate('localTasks.activity.saveComment', 'Save')}
          onCancel={() => setEditing(false)}
          onSubmit={async (body) => {
            const saved = await runLocalTaskWrite(() =>
              localTasksClient.editComment(event.id, body)
            )
            if (saved) {
              setEditing(false)
            }
            return saved !== null
          }}
        />
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{event.body}</p>
      )}
    </li>
  )
}

/** Comments and activity, oldest first; activity reads as sentences (REQ-005). */
export function LocalTaskActivity({
  taskId,
  index,
  writable
}: {
  taskId: string
  index: LocalTaskIndex
  writable: boolean
}): React.JSX.Element {
  useEffect(() => localTasksSync.watchEvents(taskId), [taskId])
  const events = useLocalTasksDomain((state) => state.eventsByTaskId[taskId])
  const now = useNow(60_000)
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-medium text-muted-foreground">
        {translate('localTasks.activity.title', 'Comments and activity')}
      </h3>
      {events === undefined ? (
        <LoaderCircle className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" />
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event) =>
            event.kind === 'comment' ? (
              <CommentEntry key={event.id} event={event} now={now} writable={writable} />
            ) : (
              <li
                key={event.id}
                className="flex items-baseline gap-2 px-1 text-xs text-muted-foreground"
              >
                <span className="min-w-0 break-words">{describeLocalTaskEvent(event, index)}</span>
                <span className="shrink-0 text-2xs">
                  {formatLocalTaskTime(event.createdAt, now)}
                </span>
              </li>
            )
          )}
        </ul>
      )}
      {writable ? (
        <CommentComposer
          initial=""
          submitLabel={translate('localTasks.activity.submitComment', 'Comment')}
          onSubmit={async (body) =>
            (await runLocalTaskWrite(() => localTasksClient.addComment(taskId, body))) !== null
          }
        />
      ) : null}
    </section>
  )
}
