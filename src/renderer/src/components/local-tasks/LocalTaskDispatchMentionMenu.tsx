import { useMemo } from 'react'
import { Folder, GitBranch, Laptop, ListTodo, Server, Unplug } from 'lucide-react'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { AppState } from '@/store/types'
import type { LocalTaskDispatchCandidate } from '@/local-tasks/local-task-dispatch-candidates'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import type { LocalTaskLinks } from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskStatusDef } from '../../../../shared/local-tasks/local-task-types'
import { LocalTaskStatusIcon } from './LocalTaskIcons'

/** Rows per group before the menu asks for more letters. */
const GROUP_LIMIT = 7

type Kind = LocalTaskDispatchCandidate['kind']
const ORDER: readonly Kind[] = ['workspace', 'repo', 'task', 'host']

function groupTitle(kind: Kind): string {
  switch (kind) {
    case 'workspace':
      return translate('localTasks.mention.workspaces', 'Workspaces')
    case 'repo':
      return translate('localTasks.mention.repos', 'Repositories')
    case 'task':
      return translate('localTasks.mention.tasks', 'Tasks')
    case 'host':
      return translate('localTasks.mention.hosts', 'Hosts')
  }
}

function KindIcon({ candidate }: { candidate: LocalTaskDispatchCandidate }): React.JSX.Element {
  const className = 'size-3.5 shrink-0 text-muted-foreground'
  switch (candidate.kind) {
    case 'workspace':
      return <GitBranch className={className} aria-hidden />
    case 'repo':
      return <Folder className={className} aria-hidden />
    case 'task':
      return <ListTodo className={className} aria-hidden />
    case 'host':
      return candidate.hostId === 'local' ? (
        <Laptop className={className} aria-hidden />
      ) : (
        <Server className={className} aria-hidden />
      )
  }
}

/** The second word after a row's name: which repository (or workspace) and host, or what kind of host. */
function contextOf(candidate: LocalTaskDispatchCandidate, app: AppState): string {
  if (candidate.kind === 'workspace') {
    const repo = app.repos.find((entry) => entry.id === candidate.worktree.repoId)
    return [repo?.displayName, candidate.detail].filter(Boolean).join(' · ')
  }
  if (candidate.kind === 'task') {
    return [candidate.workspaceName, candidate.detail].filter(Boolean).join(' · ')
  }
  return candidate.detail
}

function CandidateName({
  candidate,
  statusesById
}: {
  candidate: LocalTaskDispatchCandidate
  statusesById: ReadonlyMap<string, LocalTaskStatusDef>
}): React.JSX.Element {
  if (candidate.kind !== 'task') {
    return (
      <>
        <KindIcon candidate={candidate} />
        <span className="min-w-0 truncate text-foreground">{candidate.label}</span>
      </>
    )
  }
  const status = statusesById.get(candidate.task.statusId)
  return (
    <>
      {status ? (
        <LocalTaskStatusIcon category={status.category} color={status.color} />
      ) : (
        <KindIcon candidate={candidate} />
      )}
      <span className="min-w-0 truncate text-foreground">{candidate.task.title}</span>
      <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
        {candidate.task.ref}
      </span>
    </>
  )
}

/** What picking the row does, or why it cannot be picked. */
function noteOf(
  candidate: LocalTaskDispatchCandidate,
  links: LocalTaskLinks,
  tasksById: ReadonlyMap<string, LocalTask>
): { text: string; tone: 'muted' | 'owner' | 'warning' } | null {
  if (candidate.kind === 'task' && candidate.hostId === null) {
    return { text: translate('localTasks.row.noWorkspace', 'No workspace yet'), tone: 'muted' }
  }
  if (!candidate.available) {
    return { text: translate('localTasks.dispatch.disconnected', 'Not connected'), tone: 'warning' }
  }
  switch (candidate.kind) {
    case 'workspace': {
      const owner = links.workspaces.find(
        (link) => link.worktreeId === candidate.worktree.id && link.hostId === candidate.hostId
      )
      const task = owner ? tasksById.get(owner.taskId) : undefined
      return task
        ? {
            text: translate('localTasks.mention.ownedBy', 'Belongs to {{ref}}', { ref: task.ref }),
            tone: 'owner'
          }
        : { text: translate('localTasks.createFlow.free', 'Free'), tone: 'muted' }
    }
    case 'repo':
      return {
        text: translate('localTasks.mention.newWorkspace', 'Works in a new workspace'),
        tone: 'muted'
      }
    case 'task':
      return {
        text: translate('localTasks.mention.underTask', 'Dispatch under it'),
        tone: 'muted'
      }
    case 'host':
      return {
        text: translate('localTasks.mention.narrowHost', 'Only this host’s candidates'),
        tone: 'muted'
      }
  }
}

export function LocalTaskDispatchMentionMenu({
  candidates,
  activeId,
  app,
  links,
  tasksById,
  onChoose,
  onHover
}: {
  candidates: readonly LocalTaskDispatchCandidate[]
  activeId: string | null
  app: AppState
  links: LocalTaskLinks
  tasksById: ReadonlyMap<string, LocalTask>
  onChoose: (candidate: LocalTaskDispatchCandidate) => void
  onHover: (id: string) => void
}): React.JSX.Element {
  const projects = useLocalTasksDomain((state) => state.projects)
  const statusesById = useMemo(
    () =>
      new Map(projects.flatMap((project) => project.statuses.map((status) => [status.id, status]))),
    [projects]
  )
  const groups = ORDER.map((kind) => {
    const all = candidates.filter((candidate) => candidate.kind === kind)
    return { kind, shown: all.slice(0, GROUP_LIMIT), more: Math.max(0, all.length - GROUP_LIMIT) }
  }).filter((group) => group.shown.length > 0)
  return (
    <div
      role="listbox"
      aria-label={translate('localTasks.mention.label', 'Where to work')}
      className="absolute left-3 top-full z-30 mt-1 flex max-h-[28rem] w-[min(38rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-md border border-border bg-popover shadow-floating"
    >
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-1">
        {groups.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {translate('localTasks.dispatch.noMatches', 'No matches')}
          </p>
        ) : null}
        {groups.map((group) => (
          <div key={group.kind} className="pb-1">
            <div className="px-2 pt-1.5 pb-1 text-2xs font-medium text-muted-foreground">
              {groupTitle(group.kind)}
            </div>
            {group.shown.map((candidate) => {
              const note = noteOf(candidate, links, tasksById)
              const active = candidate.id === activeId
              return (
                <div
                  key={candidate.id}
                  role="option"
                  aria-selected={active}
                  aria-disabled={!candidate.available}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => onHover(candidate.id)}
                  onClick={() => onChoose(candidate)}
                  className={cn(
                    'flex h-7 cursor-pointer items-center gap-2 rounded-sm px-2 text-xs',
                    active && 'bg-accent',
                    !candidate.available && 'cursor-default opacity-60'
                  )}
                >
                  <CandidateName candidate={candidate} statusesById={statusesById} />
                  <span className="min-w-0 shrink truncate text-2xs text-muted-foreground">
                    {contextOf(candidate, app)}
                  </span>
                  {note ? (
                    <span
                      className={cn(
                        'ml-auto flex shrink-0 items-center gap-1 text-2xs',
                        note.tone === 'warning' && 'text-status-warning',
                        note.tone === 'muted' && 'text-muted-foreground',
                        note.tone === 'owner' &&
                          'rounded-sm bg-muted px-1.5 leading-4 text-foreground'
                      )}
                    >
                      {note.tone === 'warning' ? <Unplug className="size-3" aria-hidden /> : null}
                      {note.text}
                    </span>
                  ) : null}
                </div>
              )
            })}
            {group.more > 0 ? (
              <div className="px-2 pt-0.5 pl-7 text-2xs text-muted-foreground">
                {translate('localTasks.mention.more', '{{count}} more; keep typing to narrow', {
                  count: group.more
                })}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 border-t border-border/60 px-3 py-1.5 text-2xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <ShortcutKeyCombo
            keys={['↑', '↓']}
            keyCapClassName="min-w-4 px-1 py-0 text-3xs"
            separatorClassName="hidden"
          />
          {translate('localTasks.mention.move', 'Move')}
        </span>
        <span className="flex items-center gap-1">
          <ShortcutKeyCombo keys={['↵']} keyCapClassName="min-w-4 px-1 py-0 text-3xs" />
          {translate('localTasks.mention.pick', 'Pick')}
        </span>
        <span className="flex items-center gap-1">
          <ShortcutKeyCombo keys={['Esc']} keyCapClassName="min-w-4 px-1 py-0 text-3xs" />
          {translate('localTasks.mention.close', 'Close')}
        </span>
        <span className="ml-auto truncate">
          {translate(
            'localTasks.mention.footer',
            'Candidates come from every host in contact; a host only narrows the list'
          )}
        </span>
      </div>
    </div>
  )
}
