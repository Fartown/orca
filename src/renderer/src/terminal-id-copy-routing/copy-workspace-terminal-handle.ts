import { copyTerminalHandleForPane } from '@/components/terminal-pane/terminal-handle-copy'
import { getReachableRuntimeEnvironmentIds } from '@/hooks/ipc-events/runtime-environment-subscription-selection'
import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'
import { resolveTerminalHostOwnership } from '@/lib/terminal-worktree-route'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import { captureRuntimeEnvironmentRequestRevision } from '@/runtime/runtime-environment-revision'
import { useAppStore } from '@/store'
import { selectRuntimeAwareSshStatus } from '@/store/slices/runtime-environment-ssh-selectors'
import { parseExecutionHostId } from '../../../shared/execution-host'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'
import { toHostSessionTabId } from '../../../shared/terminal-surface-id'

export async function copyWorkspaceTerminalHandle(
  worktreeId: string,
  tabId: string,
  leafId: string
): Promise<string> {
  const state = useAppStore.getState()
  const owner = resolveTerminalHostOwnership(state, worktreeId, 'teardown')
  // Teardown permits a local folder fallback; copying requires proven ownership.
  const host = parseExecutionHostId(
    parseWorkspaceKey(worktreeId)?.type === 'folder'
      ? getResolvedExecutionHostIdForWorktree(state, worktreeId)
      : getExecutionHostIdForWorktree(state, worktreeId)
  )
  if (owner.kind === 'unresolved' || !host) {
    throw new Error('Terminal owner unavailable')
  }
  const environmentId = owner.runtimeEnvironmentId
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
