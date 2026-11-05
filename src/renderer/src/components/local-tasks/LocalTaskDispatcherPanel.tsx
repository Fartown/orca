import { useMemo, useState } from 'react'
import { useStore } from 'zustand'
import { Bot, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import {
  decideLocalTaskProposal,
  runLocalTaskProposal,
  useLocalTaskProposals
} from '@/local-tasks/local-task-dispatcher-proposals'
import {
  localTaskDispatcherStore,
  openLocalTaskDispatcher,
  useLocalTaskDispatcherPane
} from '@/local-tasks/local-task-dispatcher-session'
import {
  describeLocalTaskProposalItem,
  type LocalTaskProposalNames
} from '@/local-tasks/local-task-proposal-copy'
import { resolveProposalAgent } from '@/local-tasks/local-task-proposal-targets'
import { formatLocalTaskTime } from '@/local-tasks/local-task-time'
import { LOCAL_TASK_DISPATCHER_WAKE_PREFERENCE_KEY } from '@/local-tasks/local-task-preference-keys'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import type { LocalTaskProposal } from '../../../../shared/local-tasks/local-task-dispatcher-types'

function useProposalNames(): LocalTaskProposalNames {
  const tasks = useLocalTasksDomain((state) => state.tasks)
  const getWorktree = useAppStore((state) => state.getKnownWorktreeById)
  const repos = useAppStore((state) => state.repos)
  return useMemo(() => {
    const refs = new Map(tasks.map((task) => [task.id, task.ref]))
    return {
      taskRef: (taskId) => refs.get(taskId) ?? taskId,
      workspace: (worktreeId) => getWorktree(worktreeId)?.displayName ?? worktreeId,
      repo: (repoId) => repos.find((repo) => repo.id === repoId)?.displayName ?? repoId
    }
  }, [tasks, getWorktree, repos])
}

function ProposalCard({
  proposal,
  names,
  now
}: {
  proposal: LocalTaskProposal
  names: LocalTaskProposalNames
  now: number
}): React.JSX.Element {
  const running = useLocalTaskProposals((state) => state.running.includes(proposal.id))
  const [dropped, setDropped] = useState<ReadonlySet<number>>(() => new Set())
  const pending = proposal.status === 'pending'
  // Why the position is the id: a stored proposal never reorders or edits its items.
  const rows = useMemo(
    () => proposal.items.map((item, index) => ({ item, index, id: `${proposal.id}/${index}` })),
    [proposal]
  )
  const keep = proposal.items.map((_, index) => index).filter((index) => !dropped.has(index))
  const toggle = (index: number): void =>
    setDropped((current) => {
      const next = new Set(current)
      if (!next.delete(index)) {
        next.add(index)
      }
      return next
    })
  return (
    <section className="flex flex-col gap-1.5 rounded-lg border border-border/60 p-2">
      <header className="flex min-w-0 items-baseline gap-2 px-1">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {proposal.summary ??
            translate('localTasks.dispatcher.untitled', '{{count}} steps', {
              count: proposal.items.length
            })}
        </span>
        <span className="shrink-0 text-2xs text-muted-foreground">
          {formatLocalTaskTime(proposal.createdAt, now)}
        </span>
      </header>
      <ul className="flex flex-col gap-1">
        {rows.map(({ item, index, id }) => {
          const copy = describeLocalTaskProposalItem(item, names)
          const kept = !dropped.has(index)
          return (
            <li key={id} className="flex min-w-0 items-start gap-2 px-1">
              {pending ? (
                <Checkbox
                  checked={kept}
                  onCheckedChange={() => toggle(index)}
                  disabled={running}
                  aria-label={copy.title}
                  className="mt-0.5"
                />
              ) : null}
              <div className={cn('flex min-w-0 flex-col', !kept && 'opacity-50')}>
                <span
                  className={cn(
                    'text-xs text-foreground',
                    item.kind === 'stop' && 'text-destructive'
                  )}
                >
                  {copy.title}
                </span>
                {copy.detail ? (
                  <span className="line-clamp-2 text-2xs text-muted-foreground">{copy.detail}</span>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
      <footer className="flex items-center justify-end gap-1">
        {running ? (
          <span className="mr-auto flex items-center gap-1 px-1 text-2xs text-muted-foreground">
            <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />
            {translate('localTasks.dispatcher.running', 'Running…')}
          </span>
        ) : null}
        {pending ? (
          <>
            <Button
              variant="ghost"
              size="xs"
              disabled={running}
              onClick={() => void decideLocalTaskProposal(proposal.id, 'dismissed')}
            >
              {translate('localTasks.dispatcher.dismiss', 'Dismiss')}
            </Button>
            <Button
              size="xs"
              disabled={running || keep.length === 0}
              onClick={() =>
                void decideLocalTaskProposal(
                  proposal.id,
                  'confirmed',
                  keep.length === proposal.items.length ? undefined : keep
                )
              }
            >
              {translate('localTasks.dispatcher.confirm', 'Confirm {{count}}', {
                count: keep.length
              })}
            </Button>
          </>
        ) : (
          <Button size="xs" disabled={running} onClick={() => void runLocalTaskProposal(proposal)}>
            {translate('localTasks.dispatcher.run', 'Run')}
          </Button>
        )}
      </footer>
    </section>
  )
}

/**
 * The dispatcher on the Needs you view (REQ-030): its session one click away, and its proposals,
 * which wait on the person like any other decision.
 */
export function LocalTaskDispatcherPanel(): React.JSX.Element {
  const pending = useLocalTaskProposals((state) => state.pending)
  const unrun = useLocalTaskProposals((state) => state.unrun)
  const opening = useStore(localTaskDispatcherStore, (state) => state.opening)
  const { known, live } = useLocalTaskDispatcherPane()
  const wakeOn = useLocalTasksDomain(
    (state) => state.preferences[LOCAL_TASK_DISPATCHER_WAKE_PREFERENCE_KEY] !== '0'
  )
  const names = useProposalNames()
  const now = useNow(60_000)
  const open = (): void => {
    const agent = resolveProposalAgent(useAppStore.getState(), undefined)
    if (agent) {
      void openLocalTaskDispatcher(agent)
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Bot className="size-4 text-muted-foreground" />
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {known
            ? translate(
                'localTasks.dispatcher.hint',
                'Tell the dispatcher what you want done; it proposes the steps here and follows the tasks for you.'
              )
            : translate(
                'localTasks.dispatcher.intro',
                'The dispatcher is an agent session that assigns and follows your tasks. It only proposes; you confirm here.'
              )}
        </p>
        {known ? (
          <label className="flex shrink-0 items-center gap-1.5 text-2xs text-muted-foreground">
            <Switch
              checked={wakeOn}
              onCheckedChange={(on) =>
                void localTasksClient.setPreference(
                  LOCAL_TASK_DISPATCHER_WAKE_PREFERENCE_KEY,
                  on ? null : '0'
                )
              }
            />
            {translate('localTasks.dispatcher.wake', 'Wake on news')}
          </label>
        ) : null}
        <Button variant="outline" size="xs" disabled={opening} onClick={open}>
          {opening ? (
            <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />
          ) : null}
          {live
            ? translate('localTasks.dispatcher.show', 'Show dispatcher')
            : translate('localTasks.dispatcher.open', 'Open dispatcher')}
        </Button>
      </div>
      {[...pending, ...unrun].map((proposal) => (
        <ProposalCard key={proposal.id} proposal={proposal} names={names} now={now} />
      ))}
    </div>
  )
}
