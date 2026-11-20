import type { AgentStatusEntry } from '../../../shared/agent-status/contracts/agent-status-types'
import { isAiVaultTitleAgent } from '../../../shared/ai-vault/contracts/ai-vault-session-title'
import type { AiVaultSessionTitle } from '../../../shared/ai-vault/contracts/ai-vault-session-title'
import { getAgentRowConversationName } from '../../../shared/agent-status/presentation/agent-row-conversation-name'
import { mintAgentSessionFallbackTitle } from '../../../shared/agent-session-fallback-title'
import { projectSessionNameSlot } from '../../../shared/session-names/session-name-slot'
import { parsePaneKey } from '../../../shared/workspace-layout/stable-pane-id'
import { isTuiAgent } from '../../../shared/agent-launch/catalog/tui-agent-config'
import { withTimeout } from '../../../shared/concurrency/promise-timeout-fallback'
import type { AppState } from '../store/types'
import { canonicalSessionTitleKey, getCanonicalSessionTitle } from '../lib/canonical-session-titles'
import { resolveExplicitTerminalTitleAgentType as resolveCommittedTitleAgentType } from '../../../shared/agent-status/title/terminal-title-agent-type'
import { getExecutionHostIdForWorktree } from '../lib/workspace/ownership/worktree-runtime-owner'
import { sessionNameStore } from './session-name-store'

const COLD_NAME_READ_DEADLINE_MS = 1_500

export function captureNotificationSessionName(
  state: AppState,
  args: {
    worktreeId: string
    paneKey?: string
    terminalTitle?: string
    agentStatus?: Pick<AgentStatusEntry, 'agentType' | 'providerSession'>
  }
): string | undefined | Promise<string | undefined> {
  const agent =
    args.agentStatus?.agentType ?? resolveCommittedTitleAgentType(args.terminalTitle ?? '')
  if (!agent || agent === 'unknown') {
    return undefined
  }
  const pane = args.paneKey ? parsePaneKey(args.paneKey) : null
  const tab = pane
    ? state.tabsByWorktree[args.worktreeId]?.find((item) => item.id === pane.tabId)
    : undefined
  const layout = tab ? state.terminalLayoutsByTabId?.[tab.id] : undefined
  const current = args.paneKey ? state.agentStatusByPaneKey.get(args.paneKey) : undefined
  const sessionId = args.agentStatus?.providerSession?.id
  const sameCurrent = current?.agentType === agent && current?.providerSession?.id === sessionId
  const ownsContainerName =
    Boolean(sessionId) &&
    sameCurrent &&
    layout?.root?.type === 'leaf' &&
    layout.root.leafId === pane?.leafId
  const ownSlot =
    sessionId && tab?.aiVaultTitle?.agent === agent && tab.aiVaultTitle.sessionId === sessionId
      ? tab.aiVaultTitle
      : null
  const host = getExecutionHostIdForWorktree(state, args.worktreeId)
  const manualTitle = sessionId ? getCanonicalSessionTitle(host, agent, sessionId) : undefined
  const cached = sessionId
    ? sessionNameStore.getSnapshot().get(canonicalSessionTitleKey(host, agent, sessionId))
    : undefined
  const presentation = {
    title: args.terminalTitle ?? (sameCurrent ? current?.terminalTitle : '') ?? '',
    defaultTitle: tab?.defaultTitle,
    customTitle: ownsContainerName ? (tab?.customTitle ?? null) : null,
    quickCommandLabel: ownsContainerName ? tab?.quickCommandLabel : undefined,
    generatedTitle: ownsContainerName ? tab?.generatedTitle : undefined
  }
  const generatedTitlesEnabled = state.settings?.tabAutoGenerateTitle === true
  const render = (record: AiVaultSessionTitle | undefined): string | undefined => {
    const slot = record
      ? projectSessionNameSlot({
          agent: record.agent,
          sessionId: record.sessionId,
          previous: ownSlot,
          title: record,
          manualTitle: manualTitle ?? null
        })
      : ownSlot
    return (
      getAgentRowConversationName(
        { ...presentation, aiVaultTitle: slot },
        agent,
        generatedTitlesEnabled,
        undefined,
        {
          userTitle: manualTitle,
          identityFallbackTitle:
            sessionId && isTuiAgent(agent) ? mintAgentSessionFallbackTitle(agent, sessionId) : null
        }
      ) ?? undefined
    )
  }
  const fallback = render(cached)
  if (
    !sessionId ||
    !isAiVaultTitleAgent(agent) ||
    cached?.providerName?.kind === 'named' ||
    ownSlot?.providerName?.kind === 'named'
  ) {
    return fallback
  }
  // Capture identity and candidates now; a replacement pane cannot rename this event later.
  const request = {
    agent,
    sessionId,
    ...(args.agentStatus?.providerSession?.transcriptPath
      ? { transcriptPath: args.agentStatus.providerSession.transcriptPath }
      : {})
  }
  return withTimeout(
    sessionNameStore
      .readSnapshot({ ...request, executionHostId: host })
      .then((result) => render(result ?? cached)),
    COLD_NAME_READ_DEADLINE_MS,
    fallback
  )
}
