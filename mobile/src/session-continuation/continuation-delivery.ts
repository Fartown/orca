import { buildAgentPromptPasteBytes } from '../../../src/shared/agent-prompt-injection'
import { isTerminalSendRpcAccepted } from '../terminal/terminal-send-rpc-response'
import {
  buildTerminalSendParams,
  TERMINAL_INPUT_SEND_OPTIONS
} from '../terminal/terminal-send-request'
import { isRpcDeliveryUnknown } from '../transport/rpc-delivery-ambiguity'
import type { RpcClient } from '../transport/rpc-client'
import type { MobileSessionContinuationAgent } from './continuation-agents'

/** The host resolves tui-idle the moment an agent reports idle, and phase-one agents were
 *  observed at ~2.1-2.3s on a real host; the ceiling only covers a slow remote start. */
export const CONTINUATION_READY_TIMEOUT_MS = 60_000
const CONTINUATION_READY_RPC_TIMEOUT_MS = CONTINUATION_READY_TIMEOUT_MS + 5_000
/** A handoff is far larger than a keystroke: the host chunks it and waits out its own ingest
 *  delay before Enter, so allow more than the chat composer's 15s. */
const CONTINUATION_SEND_TIMEOUT_MS = 20_000

export type MobileContinuationCreateResult =
  | { kind: 'terminal'; handle: string }
  /** The tab exists and is selected, but the create reply carried no terminal handle, so
   *  nothing can be waited on or written. */
  | { kind: 'without-handle' }
  | { kind: 'failed' }

export type MobileSessionContinuationOutcome =
  /** The host accepted the paste and the Enter that follows it. Mobile cannot observe the
   *  agent's own turn start: the submission receipt is desktop-only (see the send call). */
  | { kind: 'delivered'; handle: string }
  | { kind: 'no-context' }
  | { kind: 'create-failed' }
  | { kind: 'created-without-handle' }
  | { kind: 'not-ready'; handle: string; status: string; blockedReason?: string }
  | { kind: 'send-rejected'; handle: string }
  | { kind: 'unknown'; handle: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readWait(result: unknown): { satisfied: boolean; status: string; blockedReason?: string } {
  const wait = isRecord(result) && isRecord(result.wait) ? result.wait : null
  return {
    satisfied: wait?.satisfied === true,
    status: typeof wait?.status === 'string' ? wait.status : 'unknown',
    ...(typeof wait?.blockedReason === 'string' ? { blockedReason: wait.blockedReason } : {})
  }
}

/**
 * Create a new agent terminal, wait for its TUI to accept input, then deliver the handoff
 * prompt as one submitted message — the mobile counterpart of the desktop's submit-after-ready
 * delivery, using only methods already open to mobile clients.
 *
 * Nothing here retries: a second send would post the prompt twice, and an ambiguous transport
 * failure cannot disprove the first one landed.
 */
export async function runMobileSessionContinuation(args: {
  // Why the whole client, not its method: RpcClient implementations include class methods that
  // read `this` (DirectRpcClient), so a detached `sendRequest` is not safe to hold.
  client: Pick<RpcClient, 'sendRequest'>
  createTerminal: (
    agent: MobileSessionContinuationAgent,
    cwd: string | null
  ) => Promise<MobileContinuationCreateResult>
  agent: MobileSessionContinuationAgent
  prompt: string
  cwd: string | null
  deviceToken: string | null
}): Promise<MobileSessionContinuationOutcome> {
  if (!args.prompt.trim()) {
    return { kind: 'no-context' }
  }
  const created = await args.createTerminal(args.agent, args.cwd)
  if (created.kind === 'failed') {
    return { kind: 'create-failed' }
  }
  if (created.kind === 'without-handle') {
    return { kind: 'created-without-handle' }
  }
  const handle = created.handle

  let waitResponse
  try {
    waitResponse = await args.client.sendRequest(
      'terminal.wait',
      { terminal: handle, for: 'tui-idle', timeoutMs: CONTINUATION_READY_TIMEOUT_MS },
      // Why fail instead of parking: a wait that resumes after a reconnect would hand readiness
      // to a send the user may no longer expect. Giving up early only skips the handoff.
      { ...TERMINAL_INPUT_SEND_OPTIONS, timeoutMs: CONTINUATION_READY_RPC_TIMEOUT_MS }
    )
  } catch {
    return { kind: 'not-ready', handle, status: 'unreachable' }
  }
  if (!waitResponse.ok) {
    return { kind: 'not-ready', handle, status: 'refused' }
  }
  const wait = readWait(waitResponse.result)
  if (!wait.satisfied || wait.blockedReason) {
    return {
      kind: 'not-ready',
      handle,
      status: wait.status,
      ...(wait.blockedReason ? { blockedReason: wait.blockedReason } : {})
    }
  }

  let sendResponse
  try {
    sendResponse = await args.client.sendRequest(
      'terminal.send',
      buildTerminalSendParams({
        terminal: handle,
        // Bracketed paste keeps a multi-line handoff one message; the host still waits out its
        // own ingest delay before Enter.
        text: buildAgentPromptPasteBytes(args.prompt),
        enter: true,
        deviceToken: args.deviceToken
      }),
      // Why TERMINAL_INPUT_SEND_OPTIONS: without it a send issued while the socket is down parks
      // until reconnect and then lands in a PTY the user has since typed into (#6713).
      // Why no waitSubmitMs: the submission receipt it observes requires `agentPrompt: true` with
      // a desktop client (terminal-send-method.ts), so it is inert for a mobile caller.
      { ...TERMINAL_INPUT_SEND_OPTIONS, timeoutMs: CONTINUATION_SEND_TIMEOUT_MS }
    )
  } catch (error) {
    return isRpcDeliveryUnknown(error)
      ? { kind: 'unknown', handle }
      : { kind: 'send-rejected', handle }
  }
  return isTerminalSendRpcAccepted(sendResponse)
    ? { kind: 'delivered', handle }
    : { kind: 'send-rejected', handle }
}
