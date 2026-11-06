import { useEffect } from 'react'
import { useStore } from 'zustand'
import { Bot, ChevronRight, LoaderCircle, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { followLocalTaskDispatcherLedger } from '@/local-tasks/local-task-dispatcher-ledger'
import { useLocalTaskProposals } from '@/local-tasks/local-task-dispatcher-proposals'
import {
  localTaskDispatcherStore,
  openLocalTaskDispatcher,
  useLocalTaskDispatcherPane
} from '@/local-tasks/local-task-dispatcher-session'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'
import { LOCAL_TASK_DISPATCHER_WAKE_PREFERENCE_KEY } from '@/local-tasks/local-task-preference-keys'
import { resolveProposalAgent } from '@/local-tasks/local-task-proposal-targets'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import {
  DispatcherDispatched,
  DispatcherUnread,
  DispatcherWatches,
  LedgerSection
} from './LocalTaskDispatcherLedger'
import { LocalTaskProposalCard, useProposalNames } from './LocalTaskProposalCard'
import type { LocalTaskListModel } from './use-local-task-list-model'

/** Proposals waiting on the person: pending ones, and confirmed ones no window has run. */
export function useLocalTaskDispatcherWaitingCount(): number {
  const pending = useLocalTaskProposals((state) => state.pending.length)
  const unrun = useLocalTaskProposals((state) => state.unrun.length)
  const claimed = useLocalTaskProposals((state) => state.claimed.length)
  return pending + unrun + claimed
}

function useDispatcherStatusLabel(paneKey: string | null, live: boolean): string {
  const state = useAppStore((app) =>
    paneKey && live ? (app.agentStatusByPaneKey[paneKey]?.state ?? null) : null
  )
  if (!live) {
    return translate('localTasks.dispatcher.status.closed', 'Not open')
  }
  if (state === 'working') {
    return translate('localTasks.dispatcher.status.working', 'Working')
  }
  if (state === 'blocked' || state === 'waiting') {
    return translate('localTasks.dispatcher.status.waiting', 'Waiting on you')
  }
  return state === 'done'
    ? translate('localTasks.dispatcher.status.idle', 'Idle')
    : translate('localTasks.dispatcher.status.open', 'Open')
}

function openDispatcherConversation(): void {
  const agent = resolveProposalAgent(useAppStore.getState(), undefined)
  if (agent) {
    void openLocalTaskDispatcher(agent)
  }
}

function DispatcherBar(): React.JSX.Element {
  const opening = useStore(localTaskDispatcherStore, (state) => state.opening)
  const { paneKey, known, live } = useLocalTaskDispatcherPane()
  const status = useDispatcherStatusLabel(paneKey, live)
  const wakeOn = useLocalTasksDomain(
    (state) => state.preferences[LOCAL_TASK_DISPATCHER_WAKE_PREFERENCE_KEY] !== '0'
  )
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border/60 px-3 py-2">
      <Bot className="size-4 text-muted-foreground" />
      <span className="text-xs text-foreground">{status}</span>
      <span className="min-w-0 flex-1" />
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
      <Button size="xs" disabled={opening} onClick={openDispatcherConversation}>
        {opening ? (
          <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />
        ) : (
          <MessageSquare className="size-3" />
        )}
        {live
          ? translate('localTasks.dispatcher.show', 'Show conversation')
          : translate('localTasks.dispatcher.open', 'Open dispatcher')}
      </Button>
    </div>
  )
}

/**
 * The dispatcher's ledger (REQ-030, REQ-031): what waits on the person, what it follows, what it
 * dispatched and what it has not handled. The conversation itself is in the floating workspace.
 */
export function LocalTaskDispatcherView({
  model
}: {
  model: LocalTaskListModel
}): React.JSX.Element {
  useEffect(() => followLocalTaskDispatcherLedger(), [])
  const pending = useLocalTaskProposals((state) => state.pending)
  const unrun = useLocalTaskProposals((state) => state.unrun)
  const claimed = useLocalTaskProposals((state) => state.claimed)
  const { known } = useLocalTaskDispatcherPane()
  const wakeOn = useLocalTasksDomain(
    (state) => state.preferences[LOCAL_TASK_DISPATCHER_WAKE_PREFERENCE_KEY] !== '0'
  )
  const names = useProposalNames()
  const now = useNow(60_000)
  const waiting = [...pending, ...unrun, ...claimed]
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold text-foreground">
          {translate('localTasks.dispatcher.title', 'Dispatcher')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {known
            ? translate(
                'localTasks.dispatcher.hint',
                'Tell it what you want done in its conversation. It proposes the steps here, you confirm, Orca runs them; then it follows the tasks and reports back.'
              )
            : translate(
                'localTasks.dispatcher.intro',
                'The dispatcher is an agent session that assigns and follows your tasks. It only proposes; you confirm here.'
              )}
        </p>
      </div>
      <DispatcherBar />
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-16 pr-1 scrollbar-sleek">
        <LedgerSection
          title={translate('localTasks.dispatcher.waiting.title', 'Waiting for you to confirm')}
          count={waiting.length}
          empty={translate('localTasks.dispatcher.waiting.empty', 'No proposal is waiting.')}
        >
          {waiting.map((proposal) => (
            <LocalTaskProposalCard key={proposal.id} proposal={proposal} names={names} now={now} />
          ))}
        </LedgerSection>
        {known ? (
          <>
            <DispatcherWatches index={model.index} now={now} />
            <DispatcherDispatched index={model.index} now={now} />
            <DispatcherUnread now={now} wakeOn={wakeOn} />
          </>
        ) : null}
      </div>
    </div>
  )
}

/** On Needs you: proposals are decisions too, so the view points at them. */
export function LocalTaskDispatcherNotice(): React.JSX.Element | null {
  const waiting = useLocalTaskDispatcherWaitingCount()
  if (waiting === 0) {
    return null
  }
  return (
    <button
      type="button"
      onClick={() => localTaskPageStore.getState().setView('dispatcher')}
      className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-left text-xs text-foreground transition hover:bg-accent"
    >
      <Bot className="size-4 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        {translate(
          'localTasks.dispatcher.notice',
          'The dispatcher has {{count}} proposal(s) waiting for you to confirm',
          { count: waiting }
        )}
      </span>
      <ChevronRight className="size-3.5 text-muted-foreground" />
    </button>
  )
}
