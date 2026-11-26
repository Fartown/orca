import type { Tab } from '../../../shared/workspace-layout/tab-groups/tab-types'
import type { TerminalTab } from '../../../shared/workspace-layout/terminal-tab-types'
import { resolveUnifiedTabLabel } from '../../../shared/workspace-layout/tab-groups/tab-title-resolution'
import { getCachedTerminalTabForWorktree } from '@/components/terminal-pane/controller/tab-state/terminal-tab-lookup'
import { readStructuredChatTabName } from '@/runtime/native-chat/naming/structured-chat-tab-name'
import type { AppState } from '@/store/types'

export function terminalGroupLabelFields(group: Tab, terminal: TerminalTab | null | undefined) {
  return {
    label: group.label,
    aiVaultTitle: terminal?.aiVaultTitle !== undefined ? terminal.aiVaultTitle : group.aiVaultTitle,
    customLabel: group.customLabel ?? terminal?.customTitle ?? null,
    generatedLabel: group.generatedLabel ?? terminal?.generatedTitle,
    quickCommandLabel: group.quickCommandLabel ?? terminal?.quickCommandLabel,
    launchAgent: terminal?.launchAgent
  }
}

export function resolveStoredTabLabel(state: AppState, tab: Tab | undefined, fallback = '') {
  if (tab?.contentType === 'agent-session') {
    return readStructuredChatTabName(tab, state)
  }
  const fields =
    tab?.contentType === 'terminal'
      ? terminalGroupLabelFields(
          tab,
          getCachedTerminalTabForWorktree(state.tabsByWorktree, tab.worktreeId, tab.entityId)
        )
      : tab
  return resolveUnifiedTabLabel(fields, state.settings?.tabAutoGenerateTitle === true, fallback)
}
