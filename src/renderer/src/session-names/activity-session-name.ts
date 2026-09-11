import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type { TerminalTab } from '../../../shared/terminal-tab-types'
import type { AiVaultSessionTitle } from '../../../shared/ai-vault-session-title'
import { getAgentRowConversationName } from '../../../shared/agent-row-conversation-name'
import { mintAgentSessionFallbackTitle } from '../../../shared/agent-session-fallback-title'
import { deriveGeneratedTabTitle } from '../../../shared/agent-tab-title'
import { formatAgentTypeLabel } from '../../../shared/agent-type-label'
import { isTuiAgent } from '../../../shared/tui-agent-config'
import { projectSessionNameSlot } from '../../../shared/session-names/session-name-slot'
import { orchestrationLabelForEntry } from '../lib/activity-thread-display'
import { firstSessionNamePrompt } from './session-name-prompt-projection'

export function getActivitySessionName(
  entry: AgentStatusEntry,
  tab: TerminalTab,
  generatedTitlesEnabled: boolean,
  context: {
    record?: AiVaultSessionTitle
    manualTitle?: string
    ownsContainer?: boolean
    paneLiveTitle?: string | null
  } = {}
): string {
  const agent = entry.agentType
  const sessionId = entry.providerSession?.id
  const ownSlot =
    sessionId && tab.aiVaultTitle?.agent === agent && tab.aiVaultTitle?.sessionId === sessionId
      ? tab.aiVaultTitle
      : null
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
    (generatedTitlesEnabled ? deriveGeneratedTabTitle(firstSessionNamePrompt(entry) ?? '') : null)
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
