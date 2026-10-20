import type { DaemonFileLog } from '../daemon/daemon-file-log'
import {
  launchEvidence,
  launchField,
  launchReference
} from '../../shared/terminal-launch-diagnostics/launch-evidence'

export async function traceDaemonTerminalLaunch<T>(
  log: DaemonFileLog,
  clientId: string,
  request: { id: string; payload: unknown },
  invoke: () => Promise<T>
): Promise<T> {
  const identity = { clientRef: launchReference(clientId), requestRef: launchReference(request.id) }
  const record = (event: string, value: unknown): void => {
    try {
      log.log(event, { ...launchEvidence(value), ...identity })
    } catch {
      // Diagnostics cannot reject a daemon admission.
    }
  }
  record('terminal-launch-request', request.payload)
  try {
    const result = await invoke()
    record(
      launchField(result, 'isNew') === true
        ? 'terminal-launch-created'
        : 'terminal-launch-attached',
      {
        sessionId:
          launchField(launchField(result, 'agentSessionEnsure'), 'owner') == null
            ? launchField(request.payload, 'sessionId')
            : launchField(launchField(launchField(result, 'agentSessionEnsure'), 'owner'), 'ptyId'),
        incarnationId: launchField(result, 'incarnationId')
      }
    )
    return result
  } catch (error) {
    record('terminal-launch-failed', request.payload)
    throw error
  }
}
