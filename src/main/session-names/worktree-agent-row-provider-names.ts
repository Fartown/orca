import type { ConversationNameTab } from '../../shared/agent-status/presentation/agent-row-conversation-name'
import {
  isAiVaultTitleAgent,
  type AiVaultSessionTitle,
  type AiVaultSessionTitleRequest,
  type AiVaultSessionTitlesResult
} from '../../shared/ai-vault/contracts/ai-vault-session-title'
import { projectSessionNameSlot } from '../../shared/session-names/session-name-slot'
import { resolveLocalAiVaultSessionTitles } from '../ai-vault/session-titles/session-title-resolver'
import type { RuntimeWorktreeAgentSource } from '../runtime/workspaces/process-listing/runtime-worktree-agent-source'

const DEFAULT_RESOLVE_TIMEOUT_MS = 1_500
const MAX_CACHED_HOST_TITLES = 1_024

const hostProviderTitleCache = new Map<string, AiVaultSessionTitle>()
const hostWarmInFlight = new Set<string>()

function rememberHostProviderTitle(key: string, slot: AiVaultSessionTitle): void {
  hostProviderTitleCache.delete(key)
  hostProviderTitleCache.set(key, slot)
  while (hostProviderTitleCache.size > MAX_CACHED_HOST_TITLES) {
    const oldest = hostProviderTitleCache.keys().next().value
    if (oldest === undefined) {
      break
    }
    hostProviderTitleCache.delete(oldest)
  }
}

export function getCachedHostProviderTitleMap(): ReadonlyMap<string, AiVaultSessionTitle> {
  return hostProviderTitleCache
}

export function warmHostProviderSessionTitle(args: {
  agent: string | null | undefined
  sessionId: string | null | undefined
  transcriptPath?: string | null
  connectionId?: string | null
  resolveTitles?: ProviderNameResolver
}): void {
  const agent = args.agent
  const sessionId = args.sessionId?.trim()
  if (args.connectionId != null || !agent || !sessionId || !isAiVaultTitleAgent(agent)) {
    return
  }
  const key = worktreeAgentRowProviderTitleKey(agent, sessionId)
  if (
    hostProviderTitleCache.get(key)?.providerName?.kind === 'named' ||
    hostWarmInFlight.has(key)
  ) {
    return
  }
  hostWarmInFlight.add(key)
  const transcriptPath = args.transcriptPath?.trim()
  const resolveTitles = args.resolveTitles ?? resolveLocalAiVaultSessionTitles
  void resolveTitles(
    [{ agent, sessionId, ...(transcriptPath ? { transcriptPath } : {}) }],
    AbortSignal.timeout(DEFAULT_RESOLVE_TIMEOUT_MS)
  )
    .then((result) => {
      const title = result.titles[0]
      const evidence = result.nameEvidence?.[0]
      if (!title && !evidence) {
        return
      }
      const slot = projectSessionNameSlot({
        agent,
        sessionId,
        previous: hostProviderTitleCache.get(key) ?? null,
        title,
        evidence,
        manualTitle: null
      })
      if (slot) {
        rememberHostProviderTitle(key, slot)
      }
    })
    .catch(() => undefined)
    .finally(() => {
      hostWarmInFlight.delete(key)
    })
}

export function worktreeAgentRowProviderTitleKey(agent: string, sessionId: string): string {
  return `${agent}\0${sessionId}`
}

type ProviderNameResolver = (
  requests: AiVaultSessionTitleRequest[],
  signal?: AbortSignal
) => Promise<AiVaultSessionTitlesResult>

/**
 * Resolve host-local provider session names for `worktree.ps` rows so headless `orca serve` and
 * managed SSH `orcad` hosts report the same native/generated names as desktop tabs.
 */
export async function resolveWorktreeAgentRowProviderNames(
  rowSources: ReadonlyMap<string, RuntimeWorktreeAgentSource>,
  options: {
    resolveTitles?: ProviderNameResolver
    timeoutMs?: number
  } = {}
): Promise<Map<string, AiVaultSessionTitle>> {
  const byKey = new Map<string, AiVaultSessionTitleRequest>()
  for (const source of rowSources.values()) {
    // Only resolve transcripts owned by this execution host; never guess across SSH/remote hops.
    if (source.connectionId !== null) {
      continue
    }
    const agent = source.agentType
    const sessionId = source.providerSessionId?.trim()
    if (!agent || !sessionId || !isAiVaultTitleAgent(agent)) {
      continue
    }
    const key = worktreeAgentRowProviderTitleKey(agent, sessionId)
    const previous = byKey.get(key)
    const transcriptPath = source.transcriptPath?.trim()
    if (!previous || (!previous.transcriptPath && transcriptPath)) {
      byKey.set(key, {
        agent,
        sessionId,
        ...(transcriptPath ? { transcriptPath } : {})
      })
    }
  }
  const resolved = new Map<string, AiVaultSessionTitle>()
  if (byKey.size === 0) {
    return resolved
  }
  const resolveTitles = options.resolveTitles ?? resolveLocalAiVaultSessionTitles
  const timeoutMs = options.timeoutMs ?? DEFAULT_RESOLVE_TIMEOUT_MS
  try {
    const result = await resolveTitles([...byKey.values()], AbortSignal.timeout(timeoutMs))
    const evidenceByKey = new Map(
      (result.nameEvidence ?? []).map((entry) => [
        worktreeAgentRowProviderTitleKey(entry.agent, entry.sessionId),
        entry
      ])
    )
    for (const title of result.titles) {
      const key = worktreeAgentRowProviderTitleKey(title.agent, title.sessionId)
      const slot = projectSessionNameSlot({
        agent: title.agent,
        sessionId: title.sessionId,
        previous: hostProviderTitleCache.get(key) ?? null,
        title,
        evidence: evidenceByKey.get(key),
        manualTitle: null
      })
      if (slot) {
        resolved.set(key, slot)
        rememberHostProviderTitle(key, slot)
      }
    }
    for (const [key, evidence] of evidenceByKey) {
      if (resolved.has(key)) {
        continue
      }
      const slot = projectSessionNameSlot({
        agent: evidence.agent,
        sessionId: evidence.sessionId,
        previous: hostProviderTitleCache.get(key) ?? null,
        evidence,
        manualTitle: null
      })
      if (slot) {
        resolved.set(key, slot)
        rememberHostProviderTitle(key, slot)
      }
    }
  } catch {
    // Never stall or fail worktree.ps if the local vault scanner is slow or unavailable.
  }
  for (const [key, request] of byKey) {
    if (!resolved.has(key)) {
      const cached = hostProviderTitleCache.get(key)
      if (cached && cached.agent === request.agent && cached.sessionId === request.sessionId) {
        resolved.set(key, cached)
      }
    }
  }
  return resolved
}

export function mergeWorktreeAgentRowProviderTitle(
  tab: ConversationNameTab | null,
  source: Pick<RuntimeWorktreeAgentSource, 'agentType' | 'providerSessionId'> & {
    connectionId?: string | null
  },
  resolvedSessionTitles: ReadonlyMap<string, AiVaultSessionTitle> | undefined
): ConversationNameTab | null {
  const { agentType } = source
  const providerSessionId = source.providerSessionId?.trim()
  if (
    source.connectionId != null ||
    !agentType ||
    !providerSessionId ||
    !resolvedSessionTitles?.size
  ) {
    return tab
  }
  const resolvedSlot = resolvedSessionTitles.get(
    worktreeAgentRowProviderTitleKey(agentType, providerSessionId)
  )
  if (!resolvedSlot) {
    return tab
  }
  if (!tab) {
    return { title: '', customTitle: null, aiVaultTitle: resolvedSlot }
  }
  const existing =
    tab.aiVaultTitle?.agent === resolvedSlot.agent &&
    tab.aiVaultTitle.sessionId === resolvedSlot.sessionId
      ? tab.aiVaultTitle
      : null
  const mergedSlot = projectSessionNameSlot({
    agent: resolvedSlot.agent,
    sessionId: resolvedSlot.sessionId,
    previous: existing,
    title: resolvedSlot,
    manualTitle:
      existing?.manualTitle ??
      (existing?.source === 'conversation-override' ? existing.title : null)
  })
  return mergedSlot ? { ...tab, aiVaultTitle: mergedSlot } : tab
}
