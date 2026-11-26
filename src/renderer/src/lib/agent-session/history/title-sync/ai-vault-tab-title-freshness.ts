import { AI_VAULT_SESSION_TITLE_REFRESH_RUNTIME_CAPABILITY } from '../../../../../../shared/ai-vault/contracts/ai-vault-runtime-capabilities'
import { lastVerifiedRuntimeStatus } from '../../../../../../shared/remote-runtime/host-status/runtime-host-status'
import { getDecorativeAgentTitleSignature } from '../../../../../../shared/agent-status/title/agent-decorative-title-signature'
import { makePaneKey } from '../../../../../../shared/workspace-layout/stable-pane-id'
import { findRegisteredTerminalTab } from '@/runtime/hosted-terminals/mounted-surfaces/mounted-terminal-tab-registry'
import { isAiVaultTitleAgent } from '../../../../../../shared/ai-vault/contracts/ai-vault-session-title'
import type { AppState } from '@/store/types'
import type { RuntimeStatuses } from '@/store/slices/runtime-status/views/runtime-status-owner'
import type { TerminalTab } from '../../../../../../shared/workspace-layout/terminal-tab-types'
import type { AiVaultTitleRequest } from './ai-vault-tab-title-requests'
import { collectAgentPaneConversations } from '../../identity/pane-agent-conversations'

export function aiVaultTitleRequestKey(request: AiVaultTitleRequest): string {
  return `${request.tabId}\0${request.paneKey}\0${request.executionHostId}\0${request.agent}\0${request.providerSession.id}\0${request.providerSession.transcriptPath ?? ''}`
}

export function supportsSessionTitleRefresh(
  statuses: RuntimeStatuses,
  request: AiVaultTitleRequest
): boolean {
  const host = request.executionHostId
  return (
    host === 'local' ||
    (host.startsWith('runtime:') && runtimeSupportsSessionTitleRefresh(statuses, host.slice(8)))
  )
}

function runtimeSupportsSessionTitleRefresh(
  statuses: RuntimeStatuses,
  environmentId: string
): boolean {
  return Boolean(
    lastVerifiedRuntimeStatus(statuses.get(environmentId))?.capabilities?.includes(
      AI_VAULT_SESSION_TITLE_REFRESH_RUNTIME_CAPABILITY
    )
  )
}

/** Execution hosts whose title-refresh support flipped. Host-status pings arrive constantly, so callers check this
 * before paying for a full tab/conversation catalog walk. */
export function changedTitleRefreshHosts(
  current: RuntimeStatuses,
  prior: RuntimeStatuses
): Set<string> {
  const changed = new Set<string>()
  if (current === prior) {
    return changed
  }
  for (const environmentId of new Set([...current.keys(), ...prior.keys()])) {
    if (
      current.get(environmentId) !== prior.get(environmentId) &&
      runtimeSupportsSessionTitleRefresh(current, environmentId) !==
        runtimeSupportsSessionTitleRefresh(prior, environmentId)
    ) {
      changed.add(`runtime:${environmentId}`)
    }
  }
  return changed
}

type StoredTitle = TerminalTab['aiVaultTitle']

function storedTitleKey(worktreeId: string, tabId: string): string {
  return `${worktreeId}\0${tabId}`
}

/** Reads each request's saved title from its own workspace, visiting only the request workspaces' tabs. */
export function storedAiVaultTitles(
  state: AppState,
  requests: readonly AiVaultTitleRequest[]
): (request: AiVaultTitleRequest) => StoredTitle {
  const stored = new Map<string, StoredTitle>()
  for (const worktreeId of new Set(requests.map((request) => request.worktreeId))) {
    for (const tab of state.tabsByWorktree[worktreeId] ?? []) {
      const key = storedTitleKey(worktreeId, tab.id)
      if (!stored.has(key)) {
        stored.set(key, tab.aiVaultTitle)
      }
    }
  }
  return (request) => stored.get(storedTitleKey(request.worktreeId, request.tabId))
}

export function titleRefreshInterval(
  statuses: RuntimeStatuses,
  request: AiVaultTitleRequest,
  stored: StoredTitle
): number {
  const missing =
    stored?.agent !== request.agent ||
    stored.sessionId !== request.providerSession.id ||
    !stored.title.trim() ||
    // A prompt or minted fallback is not the provider's own name; keep asking at the missing-title pace.
    stored.providerName?.kind !== 'named'
  return missing || supportsSessionTitleRefresh(statuses, request) ? 20_000 : 5 * 60_000
}

function titleKey(title: string): string {
  const folded = title.replace('[ . ] Action Required', '[ ! ] Action Required')
  return getDecorativeAgentTitleSignature(folded) ?? folded
}

export function changedPaneTitleRequests(
  state: AppState,
  previous: AppState,
  statuses: RuntimeStatuses
): AiVaultTitleRequest[] {
  const currentTitles = state.runtimePaneTitlesByTabId ?? {}
  const previousTitles = previous.runtimePaneTitlesByTabId ?? {}
  const changed: AiVaultTitleRequest[] = []
  for (const tabId of new Set([...Object.keys(currentTitles), ...Object.keys(previousTitles)])) {
    const titles = currentTitles[tabId]
    if (titles === previousTitles[tabId]) {
      continue
    }
    const prior = previousTitles[tabId]
    for (const rawId of new Set([...Object.keys(titles ?? {}), ...Object.keys(prior ?? {})])) {
      const id = Number(rawId)
      if (titleKey(titles?.[id] ?? '') === titleKey(prior?.[id] ?? '')) {
        continue
      }
      const mounted = findRegisteredTerminalTab(tabId)
      const leaf = mounted?.tab.getManager()?.getLeafId(id)
      if (!mounted || !leaf) {
        continue
      }
      const layout = state.terminalLayoutsByTabId[tabId]
      const background =
        layout?.root?.type === 'split' && layout.activeLeafId && layout.activeLeafId !== leaf
      const request = collectAgentPaneConversations(state, isAiVaultTitleAgent, {
        pane: { worktreeId: mounted.tab.worktreeId, paneKey: makePaneKey(tabId, leaf) },
        skipHostNamedTabs: !background
      })[0]
      if (request?.refresh && supportsSessionTitleRefresh(statuses, request)) {
        changed.push(request)
      }
    }
  }
  return changed
}
