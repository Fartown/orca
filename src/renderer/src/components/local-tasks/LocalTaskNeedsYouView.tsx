import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CheckCheck, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  acknowledgeLocalTaskItems,
  writableEntriesOf
} from '@/local-tasks/local-task-needs-you-actions'
import {
  buildLocalTaskNeedsYouRows,
  localTaskItemClientKey,
  type LocalTaskNeedsYouRow
} from '@/local-tasks/local-task-needs-you-rows'
import {
  localTaskNeedsYouStore,
  useLocalTaskNeedsYou
} from '@/local-tasks/local-task-needs-you-store'
import { localTaskPageStore, useLocalTaskPage } from '@/local-tasks/local-task-page-store'
import { formatLocalTaskTime } from '@/local-tasks/local-task-time'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import type { LocalTaskSessionLink } from '../../../../shared/local-tasks/local-task-link-types'
import { LocalTaskReadErrorPanel, refreshHomeLibrary } from './LocalTaskHostStatePanel'
import { LocalTaskNeedsYouItem } from './LocalTaskNeedsYouItem'
import { LocalTaskSnoozeMenu } from './LocalTaskSnoozeMenu'
import type { LocalTaskListModel } from './use-local-task-list-model'

function NeedsYouRow({
  row,
  links,
  now
}: {
  row: LocalTaskNeedsYouRow
  links: ReadonlyMap<string, LocalTaskSessionLink>
  now: number
}): React.JSX.Element {
  const { task } = row
  const atCursor = useLocalTaskPage((state) => state.cursorTaskId === task.id)
  const snoozeOpen = useLocalTaskNeedsYou((state) => state.snoozeTaskId === task.id)
  const writable = useLocalTasksDomain(useShallow((state) => writableEntriesOf(row, state)))
  return (
    <section
      onClick={() => localTaskPageStore.getState().setCursor(task.id, 'pointer')}
      className={cn(
        'flex flex-col gap-1 rounded-lg border border-border/60 p-2',
        atCursor && 'border-ring/60 bg-accent/30'
      )}
    >
      <header className="flex min-w-0 items-center gap-2 px-2">
        <button
          type="button"
          onClick={() => localTaskPageStore.getState().openDetail(task.id)}
          className="flex min-w-0 flex-1 items-baseline gap-2 text-left hover:underline"
        >
          <span className="shrink-0 font-mono text-2xs text-muted-foreground">{task.ref}</span>
          <span className="truncate text-sm font-medium text-foreground">{task.title}</span>
        </button>
        {row.entries.length > 1 ? (
          <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
            {row.entries.length}
          </span>
        ) : null}
        <span className="shrink-0 text-2xs text-muted-foreground">
          {formatLocalTaskTime(row.newest, now)}
        </span>
        <Button
          variant="ghost"
          size="xs"
          disabled={writable.length === 0}
          onClick={() => void acknowledgeLocalTaskItems(writable)}
        >
          <CheckCheck className="size-3.5" />
          {translate('localTasks.needsYou.item.seen', 'Mark as seen')}
          <ShortcutKeyCombo
            keys={['E']}
            className="ml-0.5"
            keyCapClassName="min-w-4 px-1 py-0 text-3xs"
          />
        </Button>
        <LocalTaskSnoozeMenu
          items={writable}
          open={snoozeOpen}
          onOpenChange={(open) =>
            localTaskNeedsYouStore.getState().setSnoozeTaskId(open ? task.id : null)
          }
          now={now}
          showKey
        />
      </header>
      {row.entries.map((entry) => (
        <LocalTaskNeedsYouItem
          key={localTaskItemClientKey(entry.item)}
          entry={entry}
          link={links.get(entry.item.taskSessionId)}
          now={now}
          ownActions={row.entries.length > 1}
        />
      ))}
    </section>
  )
}

function Notice({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

function NeedsYouKeyHints(): React.JSX.Element {
  const hint = (keys: string[], label: string): React.JSX.Element => (
    <span key={label} className="flex items-center gap-1">
      <ShortcutKeyCombo
        keys={keys}
        className="gap-0.5"
        keyCapClassName="min-w-4 px-1 py-0 text-3xs"
        separatorClassName="hidden"
      />
      {label}
    </span>
  )
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
      {hint(['J', 'K'], translate('localTasks.keys.move', 'Move'))}
      {hint(['↵'], translate('localTasks.needsYou.item.open', 'Open session'))}
      {hint(['E'], translate('localTasks.needsYou.item.seen', 'Mark as seen'))}
      {hint(['H'], translate('localTasks.needsYou.snooze.trigger', 'Snooze'))}
    </div>
  )
}

/** Sessions on tasks that wait on the user, one line per task (REQ-014, REQ-015). */
export function LocalTaskNeedsYouView({ model }: { model: LocalTaskListModel }): React.JSX.Element {
  const progress = useLocalTasksDomain((state) => state.progress)
  const readError = useLocalTasksDomain((state) => state.readErrors.attention)
  const sessions = useLocalTasksDomain((state) => state.links.sessions)
  const drafts = useLocalTaskNeedsYou((state) => state.drafts)
  const now = useNow(60_000)
  const links = useMemo(() => new Map(sessions.map((link) => [link.id, link])), [sessions])
  const rows = useMemo(
    () =>
      buildLocalTaskNeedsYouRows({
        progress,
        drafts,
        tasksById: model.index.tasksById,
        scopeProjectId: model.scopeProjectId
      }),
    [progress, drafts, model.index, model.scopeProjectId]
  )
  let body: React.ReactNode
  if (readError && progress === null) {
    body = (
      <LocalTaskReadErrorPanel
        detail={readError}
        onRetry={() => void refreshHomeLibrary(['attention'])}
      />
    )
  } else if (progress === null) {
    body = (
      <Notice>
        <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
        {translate('localTasks.needsYou.loading', 'Reading session status…')}
      </Notice>
    )
  } else if (rows.length === 0) {
    body = (
      <Notice>
        {progress.unverifiable
          ? translate(
              'localTasks.needsYou.unverifiableHosts',
              'Nothing is waiting on you on the hosts in contact. Sessions on hosts that are not connected can’t be confirmed until they are back.'
            )
          : translate('localTasks.needsYou.empty', 'No session on a task is waiting on you.')}
      </Notice>
    )
  } else {
    body = (
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto scrollbar-sleek pr-1">
        {rows.map((row) => (
          <NeedsYouRow key={row.task.id} row={row} links={links} now={now} />
        ))}
      </div>
    )
  }
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold text-foreground">
          {translate('localTasks.needsYou.title', 'Needs you')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {translate(
            'localTasks.needsYou.description',
            'Sessions on tasks that wait for an approval or an answer, are blocked, or finished a turn you have not seen. Disconnected hosts are left out until they are back.'
          )}
        </p>
      </div>
      {body}
      {readError && progress !== null ? (
        <LocalTaskReadErrorPanel
          detail={readError}
          onRetry={() => void refreshHomeLibrary(['attention'])}
          compact
        />
      ) : null}
      <NeedsYouKeyHints />
    </div>
  )
}
