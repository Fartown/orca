import {
  ISSUE_CHANGES_SUBSCRIBE_METHOD,
  IssueChangeStreamMessage
} from '../../../shared/issues/change-stream-schemas'
import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'
import { getRuntimeEnvironmentRevision } from '../runtime/runtime-environment-revision'

export type IssueChangeHandlers = {
  /** First subscribe and every resubscribe after a transport gap; notices sent meanwhile are lost. */
  onReady: () => void
  onChanged: (hostPartitionKeys: string[] | null) => void
  /** The host predates the change stream and can only be read on demand. */
  onUnsupported: () => void
}

export type IssueChangeSubscription = { unsubscribe: () => void }

export function handleIssueChangeResponse(
  response: RuntimeRpcResponse<unknown>,
  handlers: IssueChangeHandlers
): void {
  if (response.ok === false) {
    if (response.error.code === 'method_not_found') {
      handlers.onUnsupported()
    } else {
      console.warn('[issues] change stream error:', response.error)
    }
    return
  }
  // An arm this build does not know degrades to no notice rather than a broken stream.
  const parsed = IssueChangeStreamMessage.safeParse(response.result)
  if (!parsed.success) {
    return
  }
  if (parsed.data.type === 'ready') {
    handlers.onReady()
  } else if (parsed.data.type === 'changed') {
    handlers.onChanged(parsed.data.hostPartitionKeys)
  }
}

export async function subscribeLocalIssueChanges(
  handlers: IssueChangeHandlers
): Promise<IssueChangeSubscription> {
  const handle = await window.api.runtime.subscribe(
    { method: ISSUE_CHANGES_SUBSCRIBE_METHOD },
    (response) => handleIssueChangeResponse(response, handlers)
  )
  return { unsubscribe: handle.unsubscribe }
}

export async function subscribeRemoteIssueChanges(
  environmentId: string,
  handlers: IssueChangeHandlers
): Promise<IssueChangeSubscription> {
  const handle = await window.api.runtimeEnvironments.subscribe(
    {
      selector: environmentId,
      method: ISSUE_CHANGES_SUBSCRIBE_METHOD,
      timeoutMs: 15_000,
      expectedEnvironmentPairingRevision: getRuntimeEnvironmentRevision(environmentId)
    },
    {
      onResponse: (response) => handleIssueChangeResponse(response, handlers),
      onError: (error) => console.warn('[issues] change stream error:', error)
    }
  )
  return { unsubscribe: handle.unsubscribe }
}
