import type { sendMessageToAgent } from '@/lib/agent-session/messaging/agent-message-send'
import { getExecutionHostIdForWorktree } from '@/lib/workspace/ownership/worktree-runtime-owner'
import { useAppStore } from '@/store'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/workspace/identity/floating-workspace-id'
import { parsePaneKey } from '../../../shared/workspace-layout/stable-pane-id'
import { knownDispatcherWorktreeId, liveDispatcherPaneKey } from './local-task-dispatcher-pane'
import { dispatcherNeedsStartupTerminal } from './local-task-dispatcher-presentation'
import {
  getLocalTaskDispatcherEndpoint,
  getLocalTaskDispatcherEpoch,
  isLocalTaskDispatcherSourceCurrent
} from './local-task-dispatcher-source'

export function getLocalTaskDispatcherSendArgs(
  paneKey: string,
  prompt: string
): Parameters<typeof sendMessageToAgent>[0] | null {
  const endpoint = getLocalTaskDispatcherEndpoint()
  const epoch = getLocalTaskDispatcherEpoch()
  const worktreeId = knownDispatcherWorktreeId(endpoint)
  const pane = parsePaneKey(paneKey)
  const current = (): boolean => {
    const state = useAppStore.getState()
    return Boolean(
      worktreeId &&
      isLocalTaskDispatcherSourceCurrent(endpoint, epoch) &&
      liveDispatcherPaneKey(state) === paneKey &&
      !dispatcherNeedsStartupTerminal(state, paneKey) &&
      (worktreeId === FLOATING_TERMINAL_WORKTREE_ID
        ? endpoint === 'local'
        : getExecutionHostIdForWorktree(state, worktreeId) === endpoint)
    )
  }
  if (!worktreeId || !pane || !current()) {
    return null
  }
  return {
    worktreeId,
    target: { kind: 'terminal', tabId: pane.tabId, leafId: pane.leafId },
    prompt,
    beforeTerminalSend: current
  }
}
