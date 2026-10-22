import { flushActiveSink, startSpan, withSpan } from '../observability/tracer'
import {
  launchEvidence,
  launchField,
  launchReference
} from '../../shared/terminal-launch-diagnostics/launch-evidence'

const METHODS = new Set([
  'terminal.create',
  'terminal.createAgentSession',
  'terminal.ensureAgentSession',
  'terminal.resolvePane',
  'session.tabs.createTerminal',
  'session.tabs.activate',
  'worktree.activate',
  'worktree.create',
  'agent.launch',
  'agent.launchReplay',
  'terminal.split',
  'terminal.restart'
])

export async function traceTerminalPtyAdmission<T>(
  input: unknown,
  invoke: () => Promise<T>
): Promise<T> {
  return withSpan(
    'terminal.launch.pty',
    async (span) => {
      try {
        return await invoke()
      } catch (error) {
        span.fail('terminal_launch_failed')
        throw error
      } finally {
        span.end()
        flushActiveSink()
      }
    },
    { attributes: launchEvidence(input) }
  )
}

export function recordTerminalLaunchStage(stage: string, input: unknown): void {
  try {
    startSpan('terminal.launch', { attributes: { stage, ...launchEvidence(input) } }).end()
    flushActiveSink()
  } catch {
    // Logging failure never authorizes or cancels a spawn.
  }
}

export async function traceTerminalClaimOwnerLiveness(
  input: unknown,
  probe: () => Promise<boolean>
): Promise<boolean> {
  try {
    const live = await probe()
    recordTerminalLaunchStage(live ? 'claim-owner-live' : 'claim-owner-exited', input)
    return live
  } catch (error) {
    recordTerminalLaunchStage('claim-owner-unverifiable', input)
    throw error
  }
}

export async function traceTerminalLaunchRpc<T>(
  request: { method: string; id: string; params?: unknown },
  caller: { clientId?: string; connectionId?: string; clientKind?: string } | undefined,
  invoke: () => Promise<T>,
  transport: 'unary' | 'streaming' = 'unary'
): Promise<T> {
  if (!METHODS.has(request.method)) {
    return invoke()
  }
  const attributes = {
    ...launchEvidence(request.params),
    diagnosticVersion: 1,
    method: request.method,
    transport,
    requestRef: launchReference(request.id),
    clientRef: launchReference(caller?.clientId),
    callerConnectionRef: launchReference(caller?.connectionId),
    clientKind:
      caller?.clientKind === 'mobile'
        ? 'mobile'
        : caller?.clientKind === 'runtime'
          ? 'runtime'
          : 'local'
  }
  return withSpan(
    'terminal.launch.rpc',
    async (span) => {
      startSpan('terminal.launch.rpc.accepted', {
        attributes: { stage: 'rpc-accepted', ...attributes }
      }).end()
      flushActiveSink()
      try {
        const result = await invoke()
        const payload = launchField(result, 'result')
        const terminal = launchField(payload, 'terminal') ?? launchField(payload, 'tab') ?? payload
        span.setAttribute(
          'result',
          launchEvidence({
            tabId:
              launchField(terminal, 'tabId') ??
              launchField(terminal, 'parentTabId') ??
              launchField(terminal, 'id'),
            leafId: launchField(terminal, 'leafId'),
            ptyId: launchField(terminal, 'ptyId'),
            handle: launchField(terminal, 'handle'),
            incarnationId: launchField(terminal, 'incarnationId'),
            disposition: launchField(payload, 'disposition'),
            agentSessionEnsure: launchField(payload, 'agentSessionEnsure')
          })
        )
        span.setAttribute('ok', launchField(result, 'ok') === true)
        span.setAttribute(
          'errorCodeRef',
          launchReference(launchField(launchField(result, 'error'), 'code'))
        )
        return result
      } catch (error) {
        span.fail('terminal_launch_failed')
        throw error
      } finally {
        span.end()
        flushActiveSink()
      }
    },
    { attributes }
  )
}

export async function traceTerminalStreamingLaunchRpc(
  request: { method: string; id: string; params?: unknown },
  caller: { clientId?: string; connectionId?: string; clientKind?: string } | undefined,
  reply: (response: string) => void,
  invoke: (reply: (response: string) => void) => Promise<void>
): Promise<void> {
  if (!METHODS.has(request.method)) {
    return invoke(reply)
  }
  await traceTerminalLaunchRpc(
    request,
    caller,
    async () => {
      let result: unknown
      await invoke((response) => {
        try {
          result = JSON.parse(response)
        } catch {
          // Invalid frames still reach the original transport unchanged.
        }
        reply(response)
      })
      return result
    },
    'streaming'
  )
}
