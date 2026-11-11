import { useEffect, useMemo, useState } from 'react'
import { Bot, ChevronDown, ChevronRight, LoaderCircle, MoreHorizontal } from 'lucide-react'
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
import { localTaskPageStore, useLocalTaskPage } from '@/local-tasks/local-task-page-store'
import { runLocalTaskWrite } from '@/local-tasks/local-task-writes'
import { localTaskWritebacks, type LocalTaskWriteback } from '@/local-tasks/local-task-writebacks'
import { AgentIcon } from '@/lib/agent-catalog'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { LocalTaskReadErrorPanel } from './LocalTaskHostStatePanel'

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
  draft,
  submitLabel,
  onSubmit,
  onCancel,
  busyState
}: {
  initial: string
  draft?: { body: string; onChange: (body: string) => void }
  submitLabel: string
  onSubmit: (body: string) => Promise<boolean>
  onCancel?: () => void
  busyState?: { busy: boolean; setBusy: (busy: boolean) => void }
}): React.JSX.Element {
  const [ownBody, setOwnBody] = useState(initial)
  const body = draft?.body ?? ownBody
  const setBody = draft?.onChange ?? setOwnBody
  const [ownBusy, setOwnBusy] = useState(false)
  const busy = busyState?.busy ?? ownBusy
  const setBusy = busyState?.setBusy ?? setOwnBusy
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
        disabled={busy}
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

/** Who wrote an entry, as a small tag: an agent, or the person on this desktop or the phone. */
function SourceTag({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="mr-1.5 inline-flex shrink-0 rounded-sm bg-muted px-1 align-[1px] text-2xs leading-4 text-muted-foreground">
      {children}
    </span>
  )
}

function sourceTag(source: LocalTaskEvent['source']): string {
  // Why cli is the agent: an agent writes through `orca task`, a person through the app.
  return source === 'cli'
    ? translate('localTasks.links.agent', 'Agent')
    : localTaskEventActor(source)
}

/** An agent's writeback, one line in the timeline with its number. */
function WritebackEntry({
  event,
  writeback,
  agent,
  now
}: {
  event: LocalTaskEvent
  writeback: LocalTaskWriteback
  agent: TuiAgent | null
  now: number
}): React.JSX.Element {
  const needsYou = typeof event.payload?.needsYou === 'string' ? event.payload.needsYou : null
  return (
    <li className="flex items-start gap-2 px-1 py-1 text-sm">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-muted-foreground">
        {agent ? <AgentIcon agent={agent} size={14} /> : <Bot className="size-3.5" />}
      </span>
      <div className="min-w-0 flex-1 break-words">
        <SourceTag>{translate('localTasks.links.agent', 'Agent')}</SourceTag>
        <span className="mr-1 text-muted-foreground">
          {translate('localTasks.activity.writeback', 'Write-back #{{number}}:', {
            number: writeback.number
          })}
        </span>
        <span className="whitespace-pre-wrap text-foreground">{event.body}</span>
        {needsYou ? (
          <p className="mt-0.5 whitespace-pre-wrap text-foreground">
            {translate('localTasks.latestProgress.needsYou', 'Needs you: {{text}}', {
              text: needsYou
            })}
          </p>
        ) : null}
      </div>
      <span className="shrink-0 pt-0.5 text-2xs text-muted-foreground">
        {formatLocalTaskTime(event.createdAt, now)}
      </span>
    </li>
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
    <li className="ml-6 flex flex-col gap-1 rounded-md border border-border/60 bg-card px-3 py-2">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <SourceTag>{sourceTag(event.source)}</SourceTag>
        <span>{translate('localTasks.activity.commentLabel', 'Comment')}</span>
        <span className="ml-auto">{formatLocalTaskTime(event.createdAt, now)}</span>
        {event.editedAt ? <span>{translate('localTasks.activity.edited', '(edited)')}</span> : null}
        {writable && event.payload?.progress !== true && !editing ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
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
  const readError = useLocalTasksDomain((state) => state.readErrors[`events:${taskId}`])
  const draft = useLocalTaskPage((state) => state.commentDrafts[taskId] ?? '')
  const commentBusy = useLocalTaskPage((state) => state.commentBusyTaskIds.includes(taskId))
  const now = useNow(60_000)
  const sessions = useLocalTasksDomain((state) => state.links.sessions)
  const [showSystem, setShowSystem] = useState(false)
  const writebacks = useMemo(
    () => new Map(localTaskWritebacks(events).map((writeback) => [writeback.event.id, writeback])),
    [events]
  )
  // Why only comments stay open: writebacks and what people said are the story; the rest is record.
  const timeline = events?.filter((event) => event.kind !== 'turn-ended') ?? []
  const systemCount = timeline.filter((event) => event.kind !== 'comment').length
  const visibleEvents = timeline.filter((event) => showSystem || event.kind === 'comment')
  const task = index.tasksById.get(taskId)
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-foreground">
        {translate('localTasks.activity.heading', 'Activity')}
      </h3>
      {readError ? (
        <LocalTaskReadErrorPanel
          detail={readError}
          onRetry={() => void localTasksSync.retryEvents(taskId)}
          compact
        />
      ) : null}
      {events === undefined && !readError ? (
        <LoaderCircle className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" />
      ) : events !== undefined ? (
        <ul className="flex flex-col gap-1.5">
          {systemCount > 0 ? (
            <li>
              <button
                type="button"
                aria-expanded={showSystem}
                onClick={() => setShowSystem(!showSystem)}
                className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground"
              >
                {showSystem ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
                {translate('localTasks.activity.systemRecordsLabel', 'System records')}
                <span className="rounded-full bg-muted px-1.5 text-2xs tabular-nums">
                  {systemCount}
                </span>
                <span>
                  {showSystem
                    ? translate('localTasks.sidebar.collapse', 'Collapse')
                    : translate('localTasks.sidebar.expand', 'Expand')}
                </span>
              </button>
            </li>
          ) : null}
          {visibleEvents.map((event) => {
            const writeback = writebacks.get(event.id)
            if (writeback) {
              const agentId = writeback.sessionLinkId
                ? sessions.find((session) => session.id === writeback.sessionLinkId)?.agent
                : null
              return (
                <WritebackEntry
                  key={`${taskId}:${event.id}`}
                  event={event}
                  writeback={writeback}
                  agent={isTuiAgent(agentId) ? agentId : null}
                  now={now}
                />
              )
            }
            return event.kind === 'comment' ? (
              <CommentEntry
                key={`${taskId}:${event.id}`}
                event={event}
                now={now}
                writable={writable}
              />
            ) : (
              <li
                key={event.id}
                className="flex items-baseline gap-2 py-0.5 pl-7 pr-1 text-xs text-muted-foreground"
              >
                <span className="min-w-0 flex-1 break-words">
                  {describeLocalTaskEvent(event, index)}
                </span>
                <span className="shrink-0 text-2xs">
                  {formatLocalTaskTime(event.createdAt, now)}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
      {writable ? (
        <CommentComposer
          key={taskId}
          initial=""
          draft={{
            body: draft,
            onChange: (body) => localTaskPageStore.getState().setCommentDraft(taskId, body)
          }}
          busyState={{
            busy: commentBusy,
            setBusy: (busy) => localTaskPageStore.getState().setCommentBusy(taskId, busy)
          }}
          submitLabel={translate('localTasks.activity.submitComment', 'Comment')}
          onSubmit={async (body) =>
            (await runLocalTaskWrite(() => localTasksClient.addComment(taskId, body))) !== null
          }
        />
      ) : null}
      {task ? (
        <p className="text-2xs text-muted-foreground">
          {translate('localTasks.detail.created', 'Created {{when}}', {
            when: formatLocalTaskTime(task.createdAt, now)
          })}
          {' · '}
          {translate('localTasks.detail.updated', 'Updated {{when}}', {
            when: formatLocalTaskTime(task.updatedAt, now)
          })}
        </p>
      ) : null}
    </section>
  )
}
