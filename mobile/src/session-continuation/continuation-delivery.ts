import { buildAgentPromptPasteBytes } from '../../../src/shared/agent-prompt-injection'
import { isTerminalSendRpcAccepted } from '../terminal/terminal-send-rpc-response'
import { buildTerminalSendParams } from '../terminal/terminal-send-request'
import { isRpcDeliveryUnknown } from '../transport/rpc-delivery-ambiguity'
import type { RpcClient } from '../transport/rpc-client'
import type { MobileSessionContinuationAgent } from './continuation-agents'

/** The host resolves tui-idle the moment an agent reports idle, and phase-one agents were
 *  observed at ~2.1-2.3s on a real host; the ceiling only covers a slow remote start. */
export const CONTINUATION_READY_TIMEOUT_MS = 60_000
const CONTINUATION_READY_RPC_TIMEOUT_MS = CONTINUATION_READY_TIMEOUT_MS + 5_000
/** Observe the submission rather than resend: a timeout returns the accepted receipt. */
export const CONTINUATION_SUBMIT_OBSERVE_MS = 20_000

export type MobileContinuationTerminal = { handle: string }

export type MobileSessionContinuationOutcome =
  | { kind: 'delivered'; handle: string; stages: readonly string[] }
  | { kind: 'no-context' }
  | { kind: 'create-failed' }
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

function readSubmissionStages(result: unknown): readonly string[] {
  if (!isRecord(result) || !isRecord(result.send) || !isRecord(result.send.prompt)) {
    return []
  }
  const stages = result.send.prompt.stages
  return Array.isArray(stages)
    ? stages.filter((stage): stage is string => typeof stage === 'string')
    : []
}

/**
 * Create a new agent terminal, wait for its TUI to accept input, then deliver the handoff
 * prompt as one submitted message. Mirrors the desktop's submit-after-ready delivery using
 * only methods already open to mobile clients: nothing here is retried automatically, because
 * a second send would post the prompt twice.
 */
export async function runMobileSessionContinuation(args: {
  sendRequest: RpcClient['sendRequest']
  createTerminal: (
    agent: MobileSessionContinuationAgent,
    cwd: string | null
  ) => Promise<MobileContinuationTerminal | null>
  agent: MobileSessionContinuationAgent
  prompt: string
  cwd: string | null
  deviceToken: string | null
}): Promise<MobileSessionContinuationOutcome> {
  if (!args.prompt.trim()) {
    return { kind: 'no-context' }
  }
  const created = await args.createTerminal(args.agent, args.cwd)
  if (!created?.handle) {
    return { kind: 'create-failed' }
  }
  const handle = created.handle

  let waitResponse
  try {
    waitResponse = await args.sendRequest(
      'terminal.wait',
      { terminal: handle, for: 'tui-idle', timeoutMs: CONTINUATION_READY_TIMEOUT_MS },
      { timeoutMs: CONTINUATION_READY_RPC_TIMEOUT_MS }
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
    sendResponse = await args.sendRequest(
      'terminal.send',
      {
        ...buildTerminalSendParams({
          terminal: handle,
          // Bracketed paste keeps a multi-line handoff one message; the host still waits out
          // its own ingest delay before Enter.
          text: buildAgentPromptPasteBytes(args.prompt),
          enter: true,
          deviceToken: args.deviceToken
        }),
        waitSubmitMs: CONTINUATION_SUBMIT_OBSERVE_MS
      },
      { timeoutMs: CONTINUATION_SUBMIT_OBSERVE_MS + 10_000 }
    )
  } catch (error) {
    // An ambiguous transport failure cannot disprove delivery; never resend it.
    return isRpcDeliveryUnknown(error)
      ? { kind: 'unknown', handle }
      : { kind: 'send-rejected', handle }
  }
  if (!isTerminalSendRpcAccepted(sendResponse)) {
    return { kind: 'send-rejected', handle }
  }
  return {
    kind: 'delivered',
    handle,
    stages: readSubmissionStages((sendResponse as { result: unknown }).result)
  }
}
