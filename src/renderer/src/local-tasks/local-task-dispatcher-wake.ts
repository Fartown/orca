import { useAppStore } from '@/store'
import { sendMessageToAgent } from '@/lib/agent-message-send'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import { localTaskDispatcherClient } from './local-task-dispatcher-client'
import { refreshLocalTaskProposals } from './local-task-dispatcher-proposals'
import { knownDispatcherPaneKey, liveDispatcherPaneKey } from './local-task-dispatcher-session'
import { subscribeLocalTaskAppStore } from './local-task-app-store-subscription'
import { subscribeSelfLocalTaskChanges } from './local-task-self-changes'
import { bindLocalTaskDispatcherForwarding } from './local-task-dispatcher-forwarding'
import { LOCAL_TASK_DISPATCHER_WAKE_PREFERENCE_KEY } from './local-task-preference-keys'
import { localTasksDomainStore } from './local-tasks-domain-store'

export const LOCAL_TASK_DISPATCHER_WAKE_PROMPT =
  'Orca: the tasks you follow have news. Run `orca task inbox --json`, tell the user only what they need to know or decide, then ack.'

// Why the whole inbox: its cursor then changes whenever anything new arrives.
const WAKE_INBOX_LIMIT = 100

type WakeState = {
  /** The idle stretch (pane and the moment it went idle) that was already pointed at the inbox. */
  pointedIdle: string | null
  /** The inbox as it stood at the last pointer; an unacked inbox with nothing new stays quiet. */
  pointedCursor: string | null
  /** When the person last pressed a key in the dispatcher's tab. */
  typedAt: number | null
  checking: boolean
  again: boolean
}

// Why these count as written: the pointer may sit in the input already, so a retry would stack it.
const POINTER_WRITTEN: ReadonlySet<string> = new Set([
  'sent',
  'partial-submit-failed',
  'unconfirmed'
])

/** True while the person's keyboard is in the dispatcher's terminal: a half-typed line must not meet the pointer. */
export function isPersonInDispatcherTab(tabId: string): boolean {
  if (typeof document === 'undefined' || !document.hasFocus()) {
    return false
  }
  const active = document.activeElement
  const tab = document.querySelector(`[data-terminal-tab-id="${CSS.escape(tabId)}"]`)
  return Boolean(active && tab?.contains(active))
}

export function isLocalTaskDispatcherWakeOn(): boolean {
  return (
    localTasksDomainStore.getState().preferences[LOCAL_TASK_DISPATCHER_WAKE_PREFERENCE_KEY] !== '0'
  )
}

/** The idle stretch the dispatcher is in; a session-start `done` is not a finished turn. */
function idleStretch(paneKey: string): { key: string; turnStartedAt: number } | null {
  const status = useAppStore.getState().agentStatusByPaneKey[paneKey]
  return status?.state === 'done' && !status.sessionBoundary
    ? {
        key: `${paneKey}@${status.stateStartedAt}`,
        turnStartedAt: status.turnStartedAt ?? status.stateStartedAt
      }
    : null
}

/**
 * Wakes the dispatcher session when the tasks it follows change (REQ-031): at most one pointer per
 * idle stretch, only while it waits for input and the person is not typing in it, and never again
 * for an inbox it has already seen. It follows host notices, the pane's agent status and focus
 * leaving the pane; nothing here runs on a timer.
 */
export function createLocalTaskDispatcherWake(
  send: typeof sendMessageToAgent = sendMessageToAgent,
  personInTab: (tabId: string) => boolean = isPersonInDispatcherTab
): { check: () => Promise<void>; noteTyping: (at: number) => void } {
  const wake: WakeState = {
    pointedIdle: null,
    pointedCursor: null,
    typedAt: null,
    checking: false,
    again: false
  }

  /** Keys pressed since the last turn began may be an unsent draft the pointer would join. */
  function mayHoldDraft(idle: { turnStartedAt: number }): boolean {
    return wake.typedAt !== null && wake.typedAt > idle.turnStartedAt
  }

  async function checkOnce(): Promise<void> {
    const paneKey = liveDispatcherPaneKey()
    const pane = paneKey ? parsePaneKey(paneKey) : null
    const idle = paneKey ? idleStretch(paneKey) : null
    if (
      !paneKey ||
      !pane ||
      !idle ||
      idle.key === wake.pointedIdle ||
      !isLocalTaskDispatcherWakeOn()
    ) {
      return
    }
    if (personInTab(pane.tabId) || mayHoldDraft(idle)) {
      return
    }
    const result = await localTaskDispatcherClient.inbox(paneKey, WAKE_INBOX_LIMIT)
    if (!result.ok || result.inbox.items.length === 0) {
      return
    }
    if (
      result.inbox.cursor === wake.pointedCursor ||
      idleStretch(paneKey)?.key !== idle.key ||
      personInTab(pane.tabId) ||
      mayHoldDraft(idle)
    ) {
      return
    }
    const sent = await send({
      worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
      target: { kind: 'terminal', tabId: pane.tabId, leafId: pane.leafId },
      prompt: LOCAL_TASK_DISPATCHER_WAKE_PROMPT
    })
    if (POINTER_WRITTEN.has(sent.status)) {
      wake.pointedIdle = idle.key
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

  return {
    check,
    noteTyping: (at) => {
      wake.typedAt = at
    }
  }
}

/** Mounted once per window: proposals follow the library's notices, the wake follows both. */
export function bindLocalTaskDispatcher(): () => void {
  const wake = createLocalTaskDispatcherWake()
  const unbindForwarding = bindLocalTaskDispatcherForwarding()
  const unsubscribeChanges = subscribeSelfLocalTaskChanges((scopes) => {
    // Why: a library that never had a dispatcher has no proposals and nothing to wake.
    if (!knownDispatcherPaneKey()) {
      return
    }
    if (scopes === null || scopes.includes('events')) {
      void refreshLocalTaskProposals()
    }
    // Why preferences: turning waking back on delivers what waited while it was off.
    if (
      scopes === null ||
      scopes.includes('events') ||
      scopes.includes('attention') ||
      scopes.includes('preferences')
    ) {
      void wake.check()
    }
  })
  const unsubscribeStatus = subscribeLocalTaskAppStore(
    'waking the dispatcher',
    (state, previous) => {
      // Why first: this runs on every app-store write, and most never touch agent status.
      if (state.agentStatusByPaneKey === previous.agentStatusByPaneKey) {
        return
      }
      const paneKey = liveDispatcherPaneKey(state)
      if (
        paneKey &&
        state.agentStatusByPaneKey[paneKey] !== previous.agentStatusByPaneKey[paneKey]
      ) {
        void wake.check()
      }
    }
  )
  // Why focus: a pointer held back while the person typed in the dispatcher goes out once they leave.
  const onFocusMoved = (): void => {
    void wake.check()
  }
  // Why keys: a draft left in the dispatcher's input must not be submitted with the pointer.
  const onKey = (event: KeyboardEvent): void => {
    const tabId = parsePaneKey(liveDispatcherPaneKey() ?? '')?.tabId
    const tab = tabId
      ? document.querySelector(`[data-terminal-tab-id="${CSS.escape(tabId)}"]`)
      : null
    if (tab && event.target instanceof Node && tab.contains(event.target)) {
      wake.noteTyping(Date.now())
    }
  }
  const target = typeof window === 'undefined' ? null : window
  target?.addEventListener('focusin', onFocusMoved)
  target?.addEventListener('blur', onFocusMoved)
  target?.addEventListener('keydown', onKey, true)
  return () => {
    unbindForwarding()
    unsubscribeChanges()
    unsubscribeStatus()
    target?.removeEventListener('focusin', onFocusMoved)
    target?.removeEventListener('blur', onFocusMoved)
    target?.removeEventListener('keydown', onKey, true)
  }
}
