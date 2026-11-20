import { locateTerminalTab } from '../store/terminals/ownership/terminal-tab-location'

export type TerminalChatRecoveryOwner = {
  tabId: string
  isVisibleTerminalChat?: () => boolean
}

export function allowsTerminalChatRecovery(
  state: {
    tabsByWorktree: Parameters<typeof locateTerminalTab>[0]
    getTab?: (tabId: string) => { viewMode?: 'terminal' | 'chat' } | null
  },
  tabId: string,
  owner: TerminalChatRecoveryOwner | undefined
): boolean {
  const row = locateTerminalTab(state.tabsByWorktree, tabId)?.tab
  if (row?.viewMode !== 'chat' && state.getTab?.(tabId)?.viewMode !== 'chat') {
    return true
  }
  return owner?.tabId === tabId && owner.isVisibleTerminalChat?.() === true
}
