import type { RuntimeTerminalResolvePane } from '../../../shared/terminal/runtime/runtime-terminal-contracts'
import { getReachableRuntimeEnvironmentIds } from '../hooks/ipc-events/runtime-events/runtime-environment-subscription-selection'
import { useAppStore } from '../store'

export async function resolveAdoptedTerminalPane(options: {
  environmentId: string
  worktreeId: string
  tabId: string
  leafId?: string | null
  isCurrent: () => boolean
  resolve: () => Promise<RuntimeTerminalResolvePane | null>
}): Promise<RuntimeTerminalResolvePane | null> {
  const inContact = () =>
    getReachableRuntimeEnvironmentIds(useAppStore.getState()).includes(options.environmentId)
  if (!options.leafId || !options.isCurrent() || !inContact()) {
    return null
  }
  const pane = await options.resolve()
  return options.isCurrent() &&
    inContact() &&
    pane?.connected === true &&
    pane.handle &&
    pane.ptyId &&
    pane.incarnationId &&
    pane.worktreeId === options.worktreeId &&
    pane.tabId === options.tabId &&
    pane.leafId === options.leafId
    ? pane
    : null
}
