import { useAppStore } from '@/store'
import { isTuiAgent } from '../../../shared/tui-agent-config'
import type { AgentType } from '../../../shared/agent-status-types'
import type { TerminalTab } from '../../../shared/terminal-tab-types'
import { resolveTerminalTabTitle } from '../../../shared/tab-title-resolution'
import { stripLeadingAgentTitleDecoration } from '../../../shared/agent-title-decoration'

/** Display fields only; the caller resolves the pane's agent identity separately. */
export type SessionTabTitleModel = Pick<
  TerminalTab,
  | 'id'
  | 'worktreeId'
  | 'title'
  | 'customTitle'
  | 'color'
  | 'shellOverride'
  | 'launchAgent'
  | 'aiVaultTitle'
>

export function useSessionTabTitles(
  tab: Pick<TerminalTab, 'title' | 'customTitle' | 'launchAgent' | 'aiVaultTitle'>,
  agent: AgentType | null | undefined
): { tabTitle: string; displayTitle: string } {
  const generatedTitlesEnabled = useAppStore(
    (state) => state.settings?.tabAutoGenerateTitle === true
  )
  const tabTitle = resolveTerminalTabTitle(
    { ...tab, launchAgent: tab.launchAgent ?? (isTuiAgent(agent) ? agent : undefined) },
    generatedTitlesEnabled,
    tab.title
  )
  const nativeTitle =
    tab.aiVaultTitle?.providerName?.kind === 'named' ? tab.aiVaultTitle.providerName.title : null
  return {
    tabTitle,
    displayTitle:
      nativeTitle === tabTitle || !agent ? tabTitle : stripLeadingAgentTitleDecoration(tabTitle)
  }
}
