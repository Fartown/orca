import type { AgentStatusEntry } from '../../../shared/agent-status/contracts/agent-status-types'
import type { TerminalTab } from '../../../shared/workspace-layout/terminal-tab-types'
import type { AiVaultSessionTitle } from '../../../shared/ai-vault/contracts/ai-vault-session-title'
import { getAgentRowConversationName } from '../../../shared/agent-status/presentation/agent-row-conversation-name'
import { mintAgentSessionFallbackTitle } from '../../../shared/agent-session-fallback-title'
import { deriveGeneratedTabTitle } from '../../../shared/agent-status/presentation/agent-tab-title'
import { formatAgentTypeLabel } from '../../../shared/agent-status/presentation/agent-type-label'
import { isTuiAgent } from '../../../shared/agent-launch/catalog/tui-agent-config'
import { projectSessionNameSlot } from '../../../shared/session-names/session-name-slot'
import { orchestrationLabelForEntry } from '../lib/workspace/activity/activity-thread-display'
import { sessionNameSlotForPane } from './live-pane-name-session'
import { firstSessionNamePrompt } from './session-name-prompt-projection'

export function getActivitySessionName(
  entry: AgentStatusEntry,
  tab: TerminalTab,
  generatedTitlesEnabled: boolean,
  context: {
    sessionId?: string
    record?: AiVaultSessionTitle
    manualTitle?: string
    ownsContainer?: boolean
    paneLiveTitle?: string | null
  } = {}
): string {
  const agent = entry.agentType
  const sessionId = entry.providerSession?.id ?? context.sessionId
  const ownSlot = sessionNameSlotForPane(tab, agent, sessionId)
  const record = context.record
  const slot = record
    ? projectSessionNameSlot({
        agent: record.agent,
        sessionId: record.sessionId,
        previous: ownSlot,
        title: record,
        manualTitle: context.manualTitle ?? null
      })
    : ownSlot
  const generatedTitle =
    (context.ownsContainer && ownSlot && generatedTitlesEnabled ? tab.generatedTitle : null) ??
    (generatedTitlesEnabled
      ? deriveGeneratedTabTitle(firstSessionNamePrompt(entry, sessionId) ?? '')
      : null)
  return (
    getAgentRowConversationName(
      {
        aiVaultTitle: slot,
        title:
          context.paneLiveTitle ?? entry.terminalTitle ?? (context.ownsContainer ? tab.title : ''),
        defaultTitle: tab.defaultTitle,
        generatedTitle: generatedTitle ?? undefined,
        customTitle: context.ownsContainer ? tab.customTitle : null,
        quickCommandLabel:
          orchestrationLabelForEntry(entry) ??
          (context.ownsContainer ? tab.quickCommandLabel : undefined)
      },
      agent,
      true,
      undefined,
      {
        userTitle: context.manualTitle,
        identityFallbackTitle:
          agent && sessionId && isTuiAgent(agent)
            ? mintAgentSessionFallbackTitle(agent, sessionId)
            : formatAgentTypeLabel(agent)
      }
    ) ?? formatAgentTypeLabel(agent)
  )
}
