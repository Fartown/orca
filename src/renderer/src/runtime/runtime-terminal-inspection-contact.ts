import { useAppStore } from '@/store'
import {
  buildRuntimeClientEventEnvironmentKey,
  getReachableRuntimeEnvironmentIds
} from '@/hooks/ipc-events/runtime-environment-subscription-selection'
import { getRemoteRuntimePtyOwner } from './runtime-terminal-stream'
import { isRemoteRuntimePtyId } from '../../../shared/remote-runtime/remote-runtime-pty-id'
import { parseAppSshPtyId } from '../../../shared/ssh-pty-id'

export function runtimeTerminalProcessContactKey(ptyId: string): string | null {
  const state = useAppStore.getState()
  const owner = getRemoteRuntimePtyOwner(ptyId)
  if (owner) {
    const id = owner.target.environmentId
    return getReachableRuntimeEnvironmentIds(state).includes(id)
      ? `${ptyId}:${buildRuntimeClientEventEnvironmentKey([id])}:${state.runtimeStatusByEnvironmentId.get(id)?.hostContactEpoch ?? 0}`
      : null
  }
  if (isRemoteRuntimePtyId(ptyId)) {
    return null
  }
  const ssh = parseAppSshPtyId(ptyId)
  if (ssh) {
    const connection = state.sshConnectionStates.get(ssh.connectionId)
    return connection?.status === 'connected'
      ? `${ptyId}:${connection.providerEpoch ?? ''}:${connection.connectionGeneration ?? 0}`
      : null
  }
  return ptyId.startsWith('ssh:') ? null : 'local'
}

export function subscribeRuntimeTerminalProcessContact(listener: () => void): () => void {
  return useAppStore.subscribe((state, previous) => {
    if (
      state.runtimeStatusByEnvironmentId !== previous.runtimeStatusByEnvironmentId ||
      state.runtimeEnvironments !== previous.runtimeEnvironments ||
      state.sshStateByEnvironment !== previous.sshStateByEnvironment ||
      state.sshConnectionStates !== previous.sshConnectionStates
    ) {
      listener()
    }
  })
}

export function captureRuntimeTerminalInspectionContact(ptyId: string) {
  const key = runtimeTerminalProcessContactKey(ptyId)
  if (key === null) {
    return null
  }
  let invalidated = false
  const dispose =
    key === 'local'
      ? () => {}
      : subscribeRuntimeTerminalProcessContact(() => {
          invalidated ||= runtimeTerminalProcessContactKey(ptyId) !== key
        })
  return {
    isCurrent: () => !invalidated && runtimeTerminalProcessContactKey(ptyId) === key,
    dispose
  }
}
