import { copyTerminalHandleForPane } from '@/components/terminal-pane/terminal-handle-copy'
import { getReachableRuntimeEnvironmentIds } from '@/hooks/ipc-events/runtime-environment-subscription-selection'
import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'
import { resolveOwner } from '@/lib/resolve-owner'
import { captureRuntimeEnvironmentRequestRevision } from '@/runtime/runtime-environment-revision'
import { useAppStore } from '@/store'
import { selectRuntimeAwareSshStatus } from '@/store/slices/runtime-environment-ssh-selectors'
import { parseExecutionHostId } from '../../../shared/execution-host'
import { toHostSessionTabId } from '../../../shared/terminal-surface-id'

export async function copyWorkspaceTerminalHandle(
  worktreeId: string,
  tabId: string,
  leafId: string,
  ptyId?: string | null
): Promise<string> {
  const state = useAppStore.getState()
  const host = parseExecutionHostId(getResolvedExecutionHostIdForWorktree(state, worktreeId))
  if (!host) {
    throw new Error('Terminal owner unavailable')
  }
  const owner = resolveOwner(state, { workspaceId: worktreeId, hostId: host.id })
  if (owner.kind === 'ambiguous') {
    throw new Error('Terminal owner unavailable')
  }
  const environmentId =
    owner.kind === 'resolved' && owner.owner.endpoint.kind === 'environment'
      ? owner.owner.endpoint.environmentId
      : host.kind === 'runtime'
        ? host.environmentId
        : null
  if (environmentId && !getReachableRuntimeEnvironmentIds(state).includes(environmentId)) {
    throw new Error('Terminal host unavailable')
  }
  if (
    host.kind === 'ssh' &&
    selectRuntimeAwareSshStatus(state, environmentId, host.targetId) !== 'connected'
  ) {
    throw new Error('Terminal SSH host unavailable')
  }
  const expectedEnvironmentPairingRevision = environmentId
    ? captureRuntimeEnvironmentRequestRevision(environmentId)
    : undefined
  return copyTerminalHandleForPane({
    tabId: environmentId ? toHostSessionTabId(tabId) : tabId,
    leafId,
    ptyId,
    callRuntime: ({ method, params }) => {
      const request = { method, params: { ...params, worktreeId } }
      return environmentId
        ? window.api.runtimeEnvironments.call({
            ...request,
            selector: environmentId,
            expectedEnvironmentPairingRevision
          })
        : window.api.runtime.call(request)
    },
    writeClipboardText: window.api.ui.writeTerminalClipboardText
  })
}
