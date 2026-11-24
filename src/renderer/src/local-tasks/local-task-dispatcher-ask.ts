import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { sendMessageToAgent } from '@/lib/agent-session/messaging/agent-message-send'
import { useAppStore } from '@/store'
import type { TuiAgent } from '../../../shared/agent-launch/catalog/tui-agent'
import {
  getLocalTaskDispatcherSendArgs,
  liveDispatcherPaneKey,
  openLocalTaskDispatcher
} from './local-task-dispatcher-session'

import {
  getLocalTaskDispatcherEndpoint,
  getLocalTaskDispatcherEpoch,
  isLocalTaskDispatcherSourceCurrent,
  subscribeLocalTaskDispatcherSource
} from './local-task-dispatcher-source'

/** Tells the dispatcher to answer from records and build nothing, ahead of an Ask message. */
export const LOCAL_TASK_ASK_ONLY_PREFIX =
  '[Ask only: answer from Orca records with read-only commands. Propose and create nothing. If the answer needs reading code, say so and offer a read-only investigation task.]'

/** How long a dispatcher just started gets to finish its opening turn before the message goes in. */
const READY_WAIT_MS = 120_000

function waitForIdle(paneKey: string, current: () => boolean): Promise<boolean> {
  const idle = (): boolean =>
    useAppStore.getState().agentStatusByPaneKey.get(paneKey)?.state === 'done'
  if (idle()) {
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      unsubscribe()
      unsubscribeSource()
      resolve(false)
    }, READY_WAIT_MS)
    const check = (): void => {
      if (idle() || !current()) {
        clearTimeout(timeout)
        unsubscribe()
        unsubscribeSource()
        resolve(current())
      }
    }
    const unsubscribe = useAppStore.subscribe(check)
    const unsubscribeSource = subscribeLocalTaskDispatcherSource(check)
  })
}

/**
 * Hands a request with no target, or an Ask, to the dispatcher conversation (REQ-029, REQ-030):
 * shows it, waits out the opening turn of one just started, then sends the text as the person's
 * message. Nothing else is created here; the dispatcher answers or proposes.
 */
export async function askLocalTaskDispatcher(args: {
  agent: TuiAgent
  text: string
  askOnly: boolean
}): Promise<boolean> {
  const endpoint = getLocalTaskDispatcherEndpoint()
  const epoch = getLocalTaskDispatcherEpoch()
  const current = (): boolean => isLocalTaskDispatcherSourceCurrent(endpoint, epoch)
  const wasLive = liveDispatcherPaneKey() !== null
  if (!(await openLocalTaskDispatcher(args.agent))) {
    return false
  }
  const paneKey = liveDispatcherPaneKey()
  const text = args.text.trim()
  if (!paneKey || !current()) {
    return false
  }
  if (!text) {
    return true
  }
  if (!wasLive) {
    if (!(await waitForIdle(paneKey, current))) {
      return false
    }
  }
  const sendArgs = getLocalTaskDispatcherSendArgs(
    paneKey,
    args.askOnly ? `${LOCAL_TASK_ASK_ONLY_PREFIX}\n${text}` : text
  )
  if (!current() || !sendArgs) {
    return false
  }
  const sent = await sendMessageToAgent(sendArgs)
  // Why not "not sent": the text went into the terminal; only its arrival is unconfirmed, and
  // asking the person to send it again would send it twice.
  if (sent.status === 'unconfirmed') {
    toast.info(
      translate(
        'localTasks.dispatch.askUnconfirmed',
        'Sent to the dispatcher, but its arrival is not confirmed yet. Check the conversation.'
      )
    )
    return true
  }
  if (sent.status !== 'sent') {
    toast.info(
      translate(
        'localTasks.dispatch.askNotSent',
        'The dispatcher is open. Your message was not sent; send it there.'
      )
    )
    return false
  }
  return true
}
