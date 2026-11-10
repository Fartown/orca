import { useState } from 'react'
import { ChevronDown, Link2, PanelRightClose } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import type {
  LocalTaskLinks,
  LocalTaskSessionLink
} from '../../../../shared/local-tasks/local-task-link-types'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { openLocalTaskPage } from '@/local-tasks/local-task-navigation'
import {
  localTaskSessionPanelStore,
  useLocalTaskSessionPanel
} from '@/local-tasks/local-task-session-panel-store'
import { useAppStore } from '@/store'
import { LocalTaskStatusIcon } from './LocalTaskIcons'
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
 * The task chip in a session's header (REQ-016): status, title and ref of the task the session
 * belongs to; otherwise 关联到任务… on a session whose workspace belongs to a task. Reads nothing
 * else while no library holds a link, so headers stay untouched until tasks are in use.
 */
type LocalTaskSessionChipProps = {
  pane: LocalTaskSessionPane
  /** A chromeless pane header floats over terminal text, so the chip takes less of it. */
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

const CHAT_CHIP_CLASS = 'absolute top-2 left-4 z-20 backdrop-blur-sm'

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
  const status = useLocalTasksDomain((state) =>
    task
      ? state.projects
          .find((project) => project.id === task.projectId)
          ?.statuses.find((candidate) => candidate.id === task.statusId)
      : undefined
  )
  const workspaceLinked = useLocalTaskPaneWorkspaceLink(pane.worktreeId).link !== null
  const panelOpen = useLocalTaskSessionPanel(
    (state) => state.mode !== 'closed' && session !== null && state.sessionLinkId === session.id
  )
  // Why: the panel shows the same pane, and there "back to side" would lead where it already is.
  const inPanel = useAppStore((state) => state.activeView === 'tasks') && panelOpen
  if (!task && !workspaceLinked) {
    return null
  }
  const label = task
    ? `${task.title} · ${task.ref}`
    : translate('localTasks.links.menuLink', 'Link to task…')
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1', className)}>
      {task && session && !inPanel ? (
        // Why: REQ-028 — a session shown full size goes back to its task with the panel wide.
        <button
          type="button"
          title={translate(
            'localTasks.sessionChip.backToPanelHint',
            'Back to the overview, with this session in the wide panel on the right'
          )}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            openLocalTaskPage({ taskId: task.id })
            localTaskSessionPanelStore.getState().open(session, 'wide')
          }}
          className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-input bg-popover/95 px-1.5 text-2xs text-muted-foreground shadow-xs transition-colors hover:bg-accent hover:text-foreground"
        >
          <PanelRightClose className="size-3" />
          {translate('localTasks.sessionChip.backToPanel', 'Back to side')}
        </button>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={label}
            aria-label={label}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              'inline-flex h-5 min-w-0 shrink items-center gap-1 rounded-full border border-input bg-popover/95 px-1.5 text-2xs text-foreground shadow-xs transition-colors hover:bg-accent data-[state=open]:bg-accent',
              compact ? 'max-w-52' : 'max-w-72',
              !task && 'border-dashed text-muted-foreground'
            )}
          >
            {task ? (
              <>
                {status ? (
                  <LocalTaskStatusIcon
                    category={status.category}
                    color={status.color}
                    className="size-3"
                  />
                ) : null}
                <span className="min-w-0 truncate">{task.title}</span>
                <span className="shrink-0 text-muted-foreground">· {task.ref}</span>
              </>
            ) : (
              <>
                <Link2 className="size-3 shrink-0" />
                <span className="truncate">{label}</span>
              </>
            )}
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          // Why: the chat chip sits at the transcript's left edge; opening leftward covers the sidebar.
          align={pane.sessionId ? 'start' : 'end'}
          collisionPadding={8}
          className="w-88 p-3"
          // Why: focusing the first control on open drew a focus ring before any key press.
          onOpenAutoFocus={(event) => event.preventDefault()}
          onClick={(event) => event.stopPropagation()}
        >
          {open ? (
            <LocalTaskSessionChipCard pane={pane} session={session} onDone={() => setOpen(false)} />
          ) : null}
        </PopoverContent>
      </Popover>
    </span>
  )
}
