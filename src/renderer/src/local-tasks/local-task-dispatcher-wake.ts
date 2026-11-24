import { useAppStore } from '@/store'
import { sendMessageToAgent } from '@/lib/agent-session/messaging/agent-message-send'
import { parsePaneKey } from '../../../shared/workspace-layout/stable-pane-id'
import { readLastTerminalInputAt } from '@/lib/terminal/input/terminal-input-activity-coalescing'
import { localTaskDispatcherClientFor } from './local-task-dispatcher-client'
import {
  refreshLocalTaskProposals,
  resetLocalTaskProposals
} from './local-task-dispatcher-proposals'
import { resetLocalTaskDispatcherLedger } from './local-task-dispatcher-ledger'
import {
  knownDispatcherPaneKey,
  liveDispatcherPaneKey,
  getLocalTaskDispatcherSendArgs,
  bindLocalTaskDispatcherPresentation
} from './local-task-dispatcher-session'
import { subscribeLocalTaskAppStore } from './local-task-app-store-subscription'
import { subscribeLocalTaskDispatcherChanges } from './local-task-dispatcher-changes'
import { bindLocalTaskDispatcherForwarding } from './local-task-dispatcher-forwarding-bind'
import { LOCAL_TASK_DISPATCHER_WAKE_PREFERENCE_KEY } from './local-task-preference-keys'
import {
  getLocalTaskDispatcherEndpoint,
  getLocalTaskDispatcherEpoch,
  getLocalTaskDispatcherPreferences,
  isLocalTaskDispatcherSourceCurrent,
  initialiseLocalTaskDispatcherSource,
  bindLocalTaskDispatcherSourceContact
} from './local-task-dispatcher-source'

export const LOCAL_TASK_DISPATCHER_WAKE_PROMPT =
  'Orca: the tasks you follow have news. Run `orca task inbox --json`, tell the user only what they need to know or decide, then ack.'

// Why the whole inbox: its cursor then changes whenever anything new arrives.
const WAKE_INBOX_LIMIT = 100

type WakeState = {
  /** The idle stretch (pane and the moment it went idle) that was already pointed at the inbox. */
  pointedIdle: string | null
  /** The inbox as it stood at the last pointer; an unacked inbox with nothing new stays quiet. */
  pointedCursor: string | null
  /** When the person last put text in the dispatcher's input: a printable key, a paste, a drop. */
  typedAt: number | null
  /** When the person last pressed any key in the dispatcher's tab, text or not. */
  keyAt: number | null
  checking: boolean
  again: boolean
}

// Why these count as written: the pointer may sit in the input already, so a retry would stack it.
const POINTER_WRITTEN: ReadonlySet<string> = new Set([
  'sent',
  'partial-submit-failed',
  'unconfirmed'
])

/** How long after a key its input reaches the terminal record; a later input came some other way. */
const KEY_INPUT_WINDOW_MS = 1000

/**
 * Whether a key can leave text in the input: a printable character, a paste shortcut, or an IME
 * composition. Shortcuts, arrows and Esc cannot, so they do not hold the pointer back.
 */
export function mayLeaveLocalTaskDispatcherDraft(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'isComposing'>
): boolean {
  if (event.isComposing || event.key === 'Process') {
    return true
  }
  const key = event.key.toLowerCase()
  if (event.metaKey || event.ctrlKey) {
    return key === 'v'
  }
  return event.key.length === 1 || (event.shiftKey && event.key === 'Insert')
}

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
  return getLocalTaskDispatcherPreferences()[LOCAL_TASK_DISPATCHER_WAKE_PREFERENCE_KEY] !== '0'
}

/** The idle stretch the dispatcher is in; a session-start `done` is not a finished turn. */
function idleStretch(paneKey: string): { key: string; turnStartedAt: number } | null {
  const status = useAppStore.getState().agentStatusByPaneKey.get(paneKey)
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
): {
  check: () => Promise<void>
  noteTyping: (at: number) => void
  noteKey: (at: number) => void
  dispose: () => void
} {
  let disposed = false
  const wake: WakeState = {
    pointedIdle: null,
    pointedCursor: null,
    typedAt: null,
    keyAt: null,
    checking: false,
    again: false
  }
  let sourceKey = `${getLocalTaskDispatcherEndpoint()}@${getLocalTaskDispatcherEpoch()}`
  const followSource = (): void => {
    const nextSource = `${getLocalTaskDispatcherEndpoint()}@${getLocalTaskDispatcherEpoch()}`
    if (sourceKey !== nextSource) {
      sourceKey = nextSource
      wake.pointedIdle = wake.pointedCursor = null
      wake.typedAt = wake.keyAt = null
    }
  }

  /**
   * The terminal input record also has pastes from the menu, drops and IME commits, even before
   * its store flush; an input right after a key that leaves no text is that key, not a draft.
   */
  function mayHoldDraft(paneKey: string, idle: { turnStartedAt: number }): boolean {
    const state = useAppStore.getState()
    const inputAt = readLastTerminalInputAt(state.lastTerminalInputAtByPaneKey ?? {}, paneKey)
    const fromKey =
      inputAt !== undefined &&
      wake.keyAt !== null &&
      inputAt >= wake.keyAt &&
      inputAt - wake.keyAt <= KEY_INPUT_WINDOW_MS
    return (
      (wake.typedAt !== null && wake.typedAt >= idle.turnStartedAt) ||
      (inputAt !== undefined && inputAt >= idle.turnStartedAt && !fromKey)
    )
  }

  async function checkOnce(): Promise<void> {
    const endpoint = getLocalTaskDispatcherEndpoint()
    const epoch = getLocalTaskDispatcherEpoch()
    followSource()
    if (disposed || !isLocalTaskDispatcherSourceCurrent(endpoint, epoch)) {
      return
    }
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
    if (personInTab(pane.tabId) || mayHoldDraft(paneKey, idle)) {
      return
    }
    const result = await localTaskDispatcherClientFor(endpoint).inbox(paneKey, WAKE_INBOX_LIMIT)
    if (
      disposed ||
      !isLocalTaskDispatcherSourceCurrent(endpoint, epoch) ||
      !result.ok ||
      result.inbox.items.length === 0
    ) {
      return
    }
    if (
      result.inbox.cursor === wake.pointedCursor ||
      idleStretch(paneKey)?.key !== idle.key ||
      personInTab(pane.tabId) ||
      mayHoldDraft(paneKey, idle)
    ) {
      return
    }
    const safeToSend = (): boolean =>
      !disposed &&
      isLocalTaskDispatcherSourceCurrent(endpoint, epoch) &&
      liveDispatcherPaneKey() === paneKey &&
      idleStretch(paneKey)?.key === idle.key &&
      isLocalTaskDispatcherWakeOn() &&
      !personInTab(pane.tabId) &&
      !mayHoldDraft(paneKey, idle)
    const args = getLocalTaskDispatcherSendArgs(paneKey, LOCAL_TASK_DISPATCHER_WAKE_PROMPT)
    if (!args || !safeToSend()) {
      return
    }
    const sent = await send({
      ...args,
      beforeTerminalSend: (phase) => safeToSend() && args.beforeTerminalSend?.(phase) !== false
    })
    if (POINTER_WRITTEN.has(sent.status) && isLocalTaskDispatcherSourceCurrent(endpoint, epoch)) {
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
      } while (wake.again && !disposed)
    } finally {
      wake.checking = false
    }
  }

  return {
    check,
    dispose: () => {
      disposed = true
    },
    noteTyping: (at) => {
      followSource()
      wake.typedAt = at
    },
    noteKey: (at) => {
      followSource()
      wake.keyAt = at
    }
  }
}

/** Mounted once per window: proposals follow the library's notices, the wake follows both. */
export function bindLocalTaskDispatcher(): () => void {
  const stopContact = bindLocalTaskDispatcherSourceContact()
  const stopPresentation = bindLocalTaskDispatcherPresentation()
  const wake = createLocalTaskDispatcherWake()
  const unbindForwarding = bindLocalTaskDispatcherForwarding()
  const unsubscribeChanges = subscribeLocalTaskDispatcherChanges(
    (scopes) => {
      initialiseLocalTaskDispatcherSource()
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
    },
    () => {
      resetLocalTaskProposals()
      resetLocalTaskDispatcherLedger()
    },
    true
  )
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
        state.agentStatusByPaneKey.get(paneKey) !== previous.agentStatusByPaneKey.get(paneKey)
      ) {
        void wake.check()
      }
    }
  )
  // Why focus: a pointer held back while the person typed in the dispatcher goes out once they leave.
  const onFocusMoved = (): void => {
    void wake.check()
  }
  const inDispatcherTab = (event: Event): boolean => {
    const tabId = parsePaneKey(liveDispatcherPaneKey() ?? '')?.tabId
    const tab = tabId
      ? document.querySelector(`[data-terminal-tab-id="${CSS.escape(tabId)}"]`)
      : null
    return Boolean(tab && event.target instanceof Node && tab.contains(event.target))
  }
  // Why keys: a draft left in the dispatcher's input must not be submitted with the pointer.
  const onKey = (event: KeyboardEvent): void => {
    if (!inDispatcherTab(event)) {
      return
    }
    const at = Date.now()
    wake.noteKey(at)
    if (mayLeaveLocalTaskDispatcherDraft(event)) {
      wake.noteTyping(at)
    }
  }
  const onText = (event: Event): void => {
    if (inDispatcherTab(event)) {
      wake.noteTyping(Date.now())
    }
  }
  const target = typeof window === 'undefined' ? null : window
  target?.addEventListener('focusin', onFocusMoved)
  target?.addEventListener('blur', onFocusMoved)
  target?.addEventListener('keydown', onKey, true)
  target?.addEventListener('paste', onText, true)
  target?.addEventListener('drop', onText, true)
  return () => {
    wake.dispose()
    stopContact()
    stopPresentation()
    unbindForwarding()
    unsubscribeChanges()
    unsubscribeStatus()
    target?.removeEventListener('focusin', onFocusMoved)
    target?.removeEventListener('blur', onFocusMoved)
    target?.removeEventListener('keydown', onKey, true)
    target?.removeEventListener('paste', onText, true)
    target?.removeEventListener('drop', onText, true)
  }
}
