import { useAppStore } from '@/store'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { RuntimeTerminalClose } from '../../../shared/runtime-terminal-contracts'
import { isLocalTaskHostInContact } from './local-task-host-contact'
import { localTaskEndpointForHost, localTaskEndpointTarget } from './local-task-endpoints'

/** Only an owner-host acknowledgement of a killed PTY proves a task terminal stopped. */
export async function stopLocalTaskTerminalOnHost(
  hostId: string,
  handle: string
): Promise<boolean> {
  const endpoint = localTaskEndpointForHost(hostId)
  if (!endpoint || !isLocalTaskHostInContact(useAppStore.getState(), hostId)) {
    return false
  }
  try {
    const result = await callRuntimeRpc<{ close: RuntimeTerminalClose }>(
      localTaskEndpointTarget(endpoint),
      'terminal.close',
      { terminal: handle }
    )
    return result?.close?.handle === handle && result.close.ptyKilled === true
  } catch {
    return false
  }
}
