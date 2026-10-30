/**
 * A "Needs you" reply goes straight into the session, the way the phone's chat composer sends
 * (技术方案 §17.3): one request, never sent twice, nothing kept on any host. A refused send
 * hands the text back; a lost answer is "sent, not confirmed" and is left alone.
 */
import { z } from 'zod'
import type { AgentSessionHistoryResult } from '../../../src/shared/agent-session-wire'
import type { LocalTaskSessionLink } from '../../../src/shared/local-tasks/local-task-link-types'
import { parsePaneKey } from '../../../src/shared/stable-pane-id'
import { salvagingArray } from '../../../src/shared/zod-salvage'
import {
  openMobileNativeChatSendBudget,
  sendMobileNativeChatMessageWithOutcome
} from '../session/mobile-native-chat-send'
import { healMobileNativeChatStaleInput } from '../session/mobile-native-chat-stale-input'
import { sendMobileStructuredAgentSessionMessage } from '../session/mobile-structured-agent-session-send'
import { callAgentSession } from '../session/mobile-structured-agent-session-rpc'
import { structuredSessionOperationId } from '../session/structured-session-operation-id'
import type { RpcClient } from '../transport/rpc-client'
import { defineRpcOperation, runRpcOperation } from '../transport/rpc-operation'
import { rpcResultVariant } from '../transport/rpc-operation-result-reader'

export type LocalTaskReplyOutcome =
  | { kind: 'delivered' }
  /** It went out and the answer was lost: the agent may have it, so it is never resent. */
  | { kind: 'unconfirmed' }
  /** Nothing reached the agent; the text goes back to the reply box. */
  | { kind: 'not-sent'; reason: string | null }

/** Why a reply did not go out, in the caller's words; each finishes "Not sent: …". */
export type LocalTaskReplyReasons = {
  /** The session's terminal is no longer listed, or a chat session has no id. */
  missing: string
  notConnected: string
  /** Text left in the terminal's input could not be cleared, so nothing was typed after it. */
  inputNotCleared: string
  /** The host refused the typed text, as it does while the agent waits on a choice. */
  inputRefused: string
  /** The chat session gave no fence to send against. */
  chatNotReady: string
}

// Why its own reader: the session screen's inventory keeps only handles, a reply needs the pane.
const replyTerminalsRead = defineRpcOperation({
  name: 'terminal.list-for-task-reply',
  method: 'terminal.list',
  acceptance: 'require-result-or-throw',
  barrier: 'on-settle',
  read: rpcResultVariant(
    'task-reply-terminals',
    z.looseObject({
      terminals: salvagingArray(
        z.looseObject({ handle: z.string(), tabId: z.string(), leafId: z.string() })
      )
    })
  )
})

function message(error: unknown): string | null {
  return error instanceof Error && error.message ? error.message : null
}

/** The terminal handle of a linked session's pane, as its host lists it now. */
async function terminalHandleFor(
  client: RpcClient,
  session: LocalTaskSessionLink
): Promise<string | null> {
  if (!session.worktreeId) {
    return null
  }
  const pane = session.paneKey ? parsePaneKey(session.paneKey) : null
  const tabId = pane?.tabId ?? session.tabId
  if (!tabId) {
    return null
  }
  const listed = await runRpcOperation(client, replyTerminalsRead, {
    worktree: `id:${session.worktreeId}`
  })
  const matches = listed.terminals.filter(
    (terminal) => terminal.tabId === tabId && (!pane || terminal.leafId === pane.leafId)
  )
  // Why only one: a tab-only link split into several panes names no single agent to type into.
  return matches.length === 1 ? matches[0].handle : null
}

async function replyInTerminal(
  client: RpcClient,
  session: LocalTaskSessionLink,
  text: string,
  reasons: LocalTaskReplyReasons
): Promise<LocalTaskReplyOutcome> {
  let handle: string | null
  try {
    handle = await terminalHandleFor(client, session)
  } catch (error) {
    return { kind: 'not-sent', reason: message(error) ?? reasons.notConnected }
  }
  if (!handle) {
    return { kind: 'not-sent', reason: reasons.missing }
  }
  const deadline = openMobileNativeChatSendBudget()
  if (
    !(await healMobileNativeChatStaleInput({
      client,
      terminal: handle,
      deviceToken: null,
      deadline
    }))
  ) {
    return { kind: 'not-sent', reason: reasons.inputNotCleared }
  }
  const outcome = await sendMobileNativeChatMessageWithOutcome({
    client,
    terminal: handle,
    text,
    enter: true,
    deadline
  })
  return outcome === 'accepted'
    ? { kind: 'delivered' }
    : outcome === 'unknown'
      ? { kind: 'unconfirmed' }
      : { kind: 'not-sent', reason: reasons.inputRefused }
}

async function replyInChat(
  client: RpcClient,
  sessionId: string,
  text: string,
  reasons: LocalTaskReplyReasons
): Promise<LocalTaskReplyOutcome> {
  let fence: number | undefined
  try {
    // Current hosts ignore the fence; an older one checks it, so read the one it serves now.
    const history = await callAgentSession<AgentSessionHistoryResult>(
      client,
      'agentSession.history',
      { sessionId, direction: 'tail', limit: 1 },
      undefined,
      { failWhenDisconnected: true }
    )
    fence = history.page.fence ?? (history.ok ? undefined : history.fence)
  } catch (error) {
    return { kind: 'not-sent', reason: message(error) ?? reasons.notConnected }
  }
  if (typeof fence !== 'number') {
    return { kind: 'not-sent', reason: reasons.chatNotReady }
  }
  let refusal: string | null = null
  const outcome = await sendMobileStructuredAgentSessionMessage({
    client,
    sessionId,
    expectedRuntimeFence: fence,
    text,
    attachments: [],
    clientMessageId: structuredSessionOperationId(),
    onError: (reason) => {
      refusal = reason
    }
  })
  // Why queued counts: the host holds it as the conversation's next message.
  return outcome === 'accepted' || outcome === 'queued'
    ? { kind: 'delivered' }
    : outcome === 'unknown'
      ? { kind: 'unconfirmed' }
      : { kind: 'not-sent', reason: refusal ?? reasons.inputRefused }
}

/**
 * Sends one reply into a linked session on the library's host; every refusal says why. The caller
 * checks contact first; a disconnected client sends nothing.
 */
export async function sendLocalTaskReply(args: {
  client: RpcClient | null
  session: LocalTaskSessionLink
  text: string
  reasons: LocalTaskReplyReasons
}): Promise<LocalTaskReplyOutcome> {
  if (!args.client || args.client.getState() !== 'connected') {
    return { kind: 'not-sent', reason: args.reasons.notConnected }
  }
  if (args.session.surface === 'chat') {
    return args.session.sessionId
      ? replyInChat(args.client, args.session.sessionId, args.text, args.reasons)
      : { kind: 'not-sent', reason: args.reasons.missing }
  }
  return replyInTerminal(args.client, args.session, args.text, args.reasons)
}
