import { useAppStore } from '@/store'
import { sendMessageToAgent } from '@/lib/agent-message-send'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import { localTaskDispatcherClient } from './local-task-dispatcher-client'
import { refreshLocalTaskProposals } from './local-task-dispatcher-proposals'
import { knownDispatcherPaneKey, liveDispatcherPaneKey } from './local-task-dispatcher-session'
import { subscribeLocalTaskAppStore } from './local-task-app-store-subscription'
import { subscribeSelfLocalTaskChanges } from './local-task-self-changes'

export const LOCAL_TASK_DISPATCHER_WAKE_PROMPT =
  'Orca: the tasks you follow have news. Run `orca task inbox --json`, tell the user only what they need to know or decide, then ack.'

// Why the whole inbox: its cursor then changes whenever anything new arrives.
const WAKE_INBOX_LIMIT = 100

type WakeState = {
  /** The idle stretch (pane and the moment it went idle) that was already pointed at the inbox. */
  pointedIdle: string | null
  /** The inbox as it stood at the last pointer; an unacked inbox with nothing new stays quiet. */
  pointedCursor: string | null
  checking: boolean
  again: boolean
}

function idleStretch(paneKey: string): string | null {
  const status = useAppStore.getState().agentStatusByPaneKey[paneKey]
  return status?.state === 'done' ? `${paneKey}@${status.stateStartedAt}` : null
}

/**
 * Wakes the dispatcher session when the tasks it follows change (REQ-031): at most one pointer per
 * idle stretch, only while it waits for input, and never again for an inbox it has already seen.
 * It follows host notices and the pane's agent status; nothing here runs on a timer.
 */
export function createLocalTaskDispatcherWake(
  send: typeof sendMessageToAgent = sendMessageToAgent
): { check: () => Promise<void> } {
  const wake: WakeState = { pointedIdle: null, pointedCursor: null, checking: false, again: false }

  async function checkOnce(): Promise<void> {
    const paneKey = liveDispatcherPaneKey()
    const idle = paneKey ? idleStretch(paneKey) : null
    if (!paneKey || !idle || idle === wake.pointedIdle) {
      return
    }
    const result = await localTaskDispatcherClient.inbox(paneKey, WAKE_INBOX_LIMIT)
    if (!result.ok || result.inbox.items.length === 0) {
      return
    }
    if (result.inbox.cursor === wake.pointedCursor || idleStretch(paneKey) !== idle) {
      return
    }
    const pane = parsePaneKey(paneKey)
    if (!pane) {
      return
    }
    const sent = await send({
      worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
      target: { kind: 'terminal', tabId: pane.tabId, leafId: pane.leafId },
      prompt: LOCAL_TASK_DISPATCHER_WAKE_PROMPT
    })
    if (sent.status === 'sent') {
      wake.pointedIdle = idle
      wake.pointedCursor = result.inbox.cursor
    }
  }

  async function check(): Promise<void> {
    if (wake.checking) {
      wake.again = true
      return
    }
    wake.checking = true
    try {
      do {
        wake.again = false
        await checkOnce().catch((error: unknown) => {
          console.error('local tasks: waking the dispatcher failed', error)
        })
      } while (wake.again)
    } finally {
      wake.checking = false
    }
  }

  return { check }
}

/** Mounted once per window: proposals follow the library's notices, the wake follows both. */
export function bindLocalTaskDispatcher(): () => void {
  const wake = createLocalTaskDispatcherWake()
  const unsubscribeChanges = subscribeSelfLocalTaskChanges((scopes) => {
    // Why: a library that never had a dispatcher has no proposals and nothing to wake.
    if (!knownDispatcherPaneKey()) {
      return
    }
    if (scopes === null || scopes.includes('events')) {
      void refreshLocalTaskProposals()
    }
    if (scopes === null || scopes.includes('events') || scopes.includes('attention')) {
      void wake.check()
    }
  })
  const unsubscribeStatus = subscribeLocalTaskAppStore(
    'waking the dispatcher',
    (state, previous) => {
      const paneKey = liveDispatcherPaneKey(state)
      if (
        paneKey &&
        state.agentStatusByPaneKey[paneKey] !== previous.agentStatusByPaneKey[paneKey]
      ) {
        void wake.check()
      }
    }
  )
  return () => {
    unsubscribeChanges()
    unsubscribeStatus()
  }
}
