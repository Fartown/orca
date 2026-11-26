import type { Tab } from '../../../shared/workspace-layout/tab-groups/tab-types'
import type { TerminalTab } from '../../../shared/workspace-layout/terminal-tab-types'
import { resolveUnifiedTabLabel } from '../../../shared/workspace-layout/tab-groups/tab-title-resolution'
import { getCachedTerminalTabForWorktree } from '@/components/terminal-pane/controller/tab-state/terminal-tab-lookup'
import { readStructuredChatTabName } from '@/runtime/native-chat/naming/structured-chat-tab-name'
import type { AppState } from '@/store/types'

export function terminalGroupLabelFields(group: Tab, terminal: TerminalTab | null | undefined) {
  const groupSlot = group.aiVaultTitle
  const terminalSlot = terminal?.aiVaultTitle
  // Group recovery data has no independent session binding once the terminal publishes its own.
  const savedGroup =
    terminal?.sessionTitleFromHost || terminalSlot || (groupSlot && terminalSlot === null)
      ? undefined
      : group
  return {
    label:
      (terminal?.ptyId && terminal.launchAgent && terminal.title.trim()) ||
      savedGroup?.label ||
      terminal?.title ||
      '',
    aiVaultTitle: terminalSlot !== undefined ? terminalSlot : savedGroup?.aiVaultTitle,
    customLabel: terminal?.customTitle ?? savedGroup?.customLabel ?? null,
    generatedLabel: terminal?.generatedTitle ?? savedGroup?.generatedLabel,
    quickCommandLabel: terminal?.quickCommandLabel ?? savedGroup?.quickCommandLabel,
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
  return resolveUnifiedTabLabel(
    fields,
    state.settings?.tabAutoGenerateTitle === true,
    (tab?.contentType === 'terminal' && fields?.label) || fallback
  )
}
