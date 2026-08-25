import { callAbortableRuntimeEnvironment } from './abortable-runtime-environment-call'
import { e2eConfig } from '../lib/e2e-config'

export type RuntimeEnvironmentCallE2E = (args: {
  environmentId: string
  method: string
  params: unknown
  timeoutMs?: number
  expectedEnvironmentPairingRevision?: number
}) => Promise<unknown>

export async function callRuntimeEnvironmentWithRevision(args: {
  environmentId: string
  method: string
  params: unknown
  timeoutMs?: number
  signal?: AbortSignal
  expectedEnvironmentPairingRevision?: number
}): Promise<unknown> {
  const e2eCall = e2eConfig.enabled
    ? (
        window as typeof window & {
          __runtimeEnvironmentCallE2E?: RuntimeEnvironmentCallE2E
        }
      ).__runtimeEnvironmentCallE2E
    : undefined
  if (e2eCall) {
    return e2eCall(args)
  }
  if (args.signal) {
    return callAbortableRuntimeEnvironment(
      args.environmentId,
      args.method,
      args.params,
      args.timeoutMs,
      args.signal,
      args.expectedEnvironmentPairingRevision
    )
  }
  return window.api.runtimeEnvironments.call({
    selector: args.environmentId,
    method: args.method,
    params: args.params,
    timeoutMs: args.timeoutMs,
    expectedEnvironmentPairingRevision: args.expectedEnvironmentPairingRevision
  })
}
