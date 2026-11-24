import { useAppStore } from '@/store'
import { isTuiAgent } from '../../../shared/agent-launch/catalog/tui-agent-config'
import type { AgentType } from '../../../shared/agent-status/contracts/agent-status-types'
import type { TerminalTab } from '../../../shared/workspace-layout/terminal-tab-types'
import { resolveTerminalTabTitle } from '../../../shared/workspace-layout/tab-groups/tab-title-resolution'
import { stripLeadingAgentTitleDecoration } from '../../../shared/agent-status/title/agent-title-decoration'

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
