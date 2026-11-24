import { useAppStore } from '@/store'
import {
  buildRuntimeClientEventEnvironmentKey,
  getReachableRuntimeEnvironmentIds
} from '@/hooks/ipc-events/runtime-events/runtime-environment-subscription-selection'
import { getRemoteRuntimePtyOwner } from './hosted-terminals/identity/remote-runtime-pty-owner'
import { isRemoteRuntimePtyId } from '../../../shared/remote-runtime/remote-runtime-pty-id'
import { parseAppSshPtyId } from '../../../shared/remote-runtime/ssh/ssh-pty-id'

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

const contactListeners = new Set<() => void>()
let unsubscribeContact: (() => void) | null = null

function startContactSubscription(): () => void {
  const initial = useAppStore.getState()
  let statuses = initial.runtimeStatusByEnvironmentId
  let environments = initial.runtimeEnvironments
  let sshState = initial.sshStateByEnvironment
  let sshConnections = initial.sshConnectionStates
  return useAppStore.subscribe((state) => {
    if (
      state.runtimeStatusByEnvironmentId !== statuses ||
      state.runtimeEnvironments !== environments ||
      state.sshStateByEnvironment !== sshState ||
      state.sshConnectionStates !== sshConnections
    ) {
      statuses = state.runtimeStatusByEnvironmentId
      environments = state.runtimeEnvironments
      sshState = state.sshStateByEnvironment
      sshConnections = state.sshConnectionStates
      for (const listener of Array.from(contactListeners)) {
        listener()
      }
    }
  })
}

export function subscribeRuntimeTerminalProcessContact(listener: () => void): () => void {
  const subscriber = (): void => listener()
  unsubscribeContact ??= startContactSubscription()
  contactListeners.add(subscriber)
  return () => {
    contactListeners.delete(subscriber)
    if (contactListeners.size === 0) {
      unsubscribeContact?.()
      unsubscribeContact = null
    }
  }
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
