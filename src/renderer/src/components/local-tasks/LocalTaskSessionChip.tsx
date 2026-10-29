import { useState } from 'react'
import { ListTodo } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import type {
  LocalTaskLinks,
  LocalTaskSessionLink
} from '../../../../shared/local-tasks/local-task-link-types'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { LocalTaskSessionChipCard, useLocalTaskPaneWorkspaceLink } from './LocalTaskSessionChipCard'

export type LocalTaskSessionPane = {
  worktreeId: string
  paneKey: string
  /** Set for a structured chat; its pane key is derived from tab and session. */
  sessionId?: string
}

/** The linked session a pane shows: by pane key, by tab before the key was known, or by chat id. */
export function findLocalTaskSessionForPane(
  links: LocalTaskLinks,
  pane: LocalTaskSessionPane
): LocalTaskSessionLink | null {
  const tabId = parsePaneKey(pane.paneKey)?.tabId ?? null
  return (
    links.sessions.find((session) => session.paneKey === pane.paneKey) ??
    links.sessions.find(
      (session) =>
        session.paneKey === null &&
        ((tabId !== null && session.tabId === tabId) ||
          (pane.sessionId !== undefined && session.sessionId === pane.sessionId))
    ) ??
    null
  )
}

/**
 * The task chip in a session's header (REQ-016): `SHOP-13 · title` when the session is linked,
 * otherwise 关联到任务… on a session whose workspace belongs to a task. Reads nothing else while
 * no library holds a link, so headers stay untouched until tasks are in use.
 */
type LocalTaskSessionChipProps = {
  pane: LocalTaskSessionPane
  compact?: boolean
  className?: string
}

/** A pane whose workspace is not known yet (a chat before its tab settles) shows no chip. */
export function LocalTaskSessionChip({
  pane,
  ...props
}: Omit<LocalTaskSessionChipProps, 'pane'> & {
  pane: Omit<LocalTaskSessionPane, 'worktreeId'> & { worktreeId: string | null }
}): React.JSX.Element | null {
  const { worktreeId } = pane
  // Why: a chat has no pane header, so its chip floats over the transcript's top-left corner.
  const className = props.className ?? (pane.sessionId ? CHAT_CHIP_CLASS : undefined)
  return worktreeId ? (
    <SessionChip {...props} className={className} pane={{ ...pane, worktreeId }} />
  ) : null
}

const CHAT_CHIP_CLASS =
  'absolute top-2 left-4 z-20 border border-border bg-popover/95 shadow-xs backdrop-blur-sm'

function SessionChip(props: LocalTaskSessionChipProps): React.JSX.Element | null {
  const anyLinked = useLocalTasksDomain(
    (state) => state.links.workspaces.length > 0 || state.links.sessions.length > 0
  )
  return anyLinked ? <LinkedSessionChip {...props} /> : null
}

function LinkedSessionChip({
  pane,
  compact = false,
  className
}: LocalTaskSessionChipProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const session = useLocalTasksDomain((state) => findLocalTaskSessionForPane(state.links, pane))
  const task = useLocalTasksDomain((state) =>
    session ? state.tasks.find((candidate) => candidate.id === session.taskId) : undefined
  )
  const workspaceLinked = useLocalTaskPaneWorkspaceLink(pane.worktreeId).link !== null
  if (!task && !workspaceLinked) {
    return null
  }
  const label = task
    ? `${task.ref} · ${task.title}`
    : translate('localTasks.links.menuLink', 'Link to task…')
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={label}
          aria-label={label}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            'inline-flex h-5 min-w-0 max-w-56 shrink items-center gap-1 rounded px-1 text-2xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            className
          )}
        >
          <ListTodo className="size-3 shrink-0" />
          {compact ? null : task ? (
            <>
              <span className="shrink-0 font-mono">{task.ref}</span>
              <span className="min-w-0 truncate">· {task.title}</span>
            </>
          ) : (
            <span className="truncate">{label}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72" onClick={(event) => event.stopPropagation()}>
        {open ? (
          <LocalTaskSessionChipCard pane={pane} session={session} onDone={() => setOpen(false)} />
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
