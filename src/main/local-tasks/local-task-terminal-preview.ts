import { parseExecutionHostId } from '../../shared/execution-host'
import { makePaneKey, parsePaneKey } from '../../shared/stable-pane-id'
import type { WorkspaceSessionState } from '../../shared/workspace-session-state-types'
import type { LocalTaskSessionLink } from '../../shared/local-tasks/local-task-link-types'
import type { RuntimeNotifier } from '../runtime/runtime-notifier-contract'
import { getRegisteredSshState } from '../ssh/targets/ssh-target-registry'

type LivePreviewTerminal = {
  handle: string
  ptyId: string
  incarnationId: string | null
  worktreeId: string
  paneKey: string | null
  connected: boolean
}

export type LocalTaskTerminalPreviewSource = {
  session(hostId: string): WorkspaceSessionState | null
  terminal(paneKey: string): LivePreviewTerminal | null
  notifier: Pick<RuntimeNotifier, 'revealTerminalSession'> | null
  sshInContact?: (targetId: string) => boolean
}

/** Project a persisted live pane into the window without creating work or navigating. */
export async function prepareLocalTaskTerminalPreview(
  link: LocalTaskSessionLink,
  source: LocalTaskTerminalPreviewSource
): Promise<boolean> {
  const host = parseExecutionHostId(link.hostId)
  const reveal = source.notifier?.revealTerminalSession?.bind(source.notifier)
  if (
    !host ||
    host.kind === 'runtime' ||
    !reveal ||
    link.surface !== 'terminal' ||
    !link.worktreeId
  ) {
    return false
  }
  if (
    host.kind === 'ssh' &&
    !(
      source.sshInContact?.(host.targetId) ??
      getRegisteredSshState(host.targetId)?.status === 'connected'
    )
  ) {
    return false
  }
  const pane = link.paneKey ? parsePaneKey(link.paneKey) : null
  if (link.paneKey && (!pane || (link.tabId && link.tabId !== pane.tabId))) {
    return false
  }
  const tabId = pane?.tabId ?? link.tabId
  const session = source.session(host.id)
  const tab = session?.tabsByWorktree[link.worktreeId]?.find((candidate) => candidate.id === tabId)
  const layout = tabId ? session?.terminalLayoutsByTabId[tabId] : undefined
  const leafId = pane?.leafId ?? layout?.activeLeafId
  if (!tab || !tabId || !leafId) {
    return false
  }
  const paneKey = makePaneKey(tabId, leafId)
  const live = source.terminal(paneKey)
  const persistedPtyId = layout?.ptyIdsByLeafId?.[leafId]
  if (
    !live?.connected ||
    !live.incarnationId ||
    live.worktreeId !== link.worktreeId ||
    live.paneKey !== paneKey ||
    persistedPtyId !== live.ptyId ||
    session?.terminalPtyIncarnationsByPaneKey?.[paneKey] !== live.incarnationId
  ) {
    return false
  }
  const revealed = await reveal(link.worktreeId, {
    ptyId: live.ptyId,
    tabId,
    leafId,
    title: tab.customTitle ?? tab.title,
    activate: false,
    focus: false,
    presentation: 'background',
    surfaceOwner: false,
    expectedProcessIdentity: { terminalHandle: live.handle, incarnationId: live.incarnationId }
  })
  const current = source.terminal(paneKey)
  return Boolean(
    revealed?.tabId === tabId &&
    revealed.identity?.worktreeId === link.worktreeId &&
    revealed.identity.tabId === tabId &&
    revealed.identity.leafId === leafId &&
    revealed.identity.ptyId === live.ptyId &&
    current?.connected &&
    current.handle === live.handle &&
    current.ptyId === live.ptyId &&
    current.incarnationId === live.incarnationId
  )
}
