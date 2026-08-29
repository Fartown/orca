import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentProviderSessionMetadata } from '../../../shared/agent-session-resume'
import {
  isAiVaultTitleAgent,
  type AiVaultSessionTitlesArgs,
  type AiVaultSessionTitlesResult,
  type AiVaultSessionTitle
} from '../../../shared/ai-vault-session-title'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { ConversationSummary } from '../../../shared/issues/types'
import { settleAiVaultSessionTitleRequestBatches } from '@/lib/ai-vault-tab-title-batches'
import { MISSING_AI_VAULT_TITLE_REFRESH_MS } from '@/lib/ai-vault-tab-title-sync'
import { conversationSessionTitleKey } from './issue-conversation-presentation'

export type ConversationSessionTitleRequest = {
  conversationKey: string
  executionHostId: ExecutionHostId
  agent: AiVaultSessionTitle['agent']
  providerSession: AgentProviderSessionMetadata
}

export type ConversationSessionTitleSource = {
  conversation: ConversationSummary
  executionHostScope: ExecutionHostId
}

type ResolveSessionTitles = (args: AiVaultSessionTitlesArgs) => Promise<AiVaultSessionTitlesResult>

export type ConversationSessionTitleResolution = {
  fingerprint: string
  retryAt: number | null
}

export type ConversationSessionTitleChanges = {
  titles: ReadonlyMap<string, string>
  resolutions: ReadonlyMap<string, ConversationSessionTitleResolution>
}

export function collectConversationSessionTitleRequests(
  sources: readonly ConversationSessionTitleSource[]
): ConversationSessionTitleRequest[] {
  const requests = new Map<string, ConversationSessionTitleRequest>()
  for (const { conversation, executionHostScope } of sources) {
    const conversationKey = conversationSessionTitleKey(conversation, executionHostScope)
    const providerSession = conversation.navigation?.providerSession
    if (
      conversation.title?.trim() ||
      !conversationKey ||
      !providerSession ||
      !isAiVaultTitleAgent(conversation.agent) ||
      requests.has(conversationKey)
    ) {
      continue
    }
    requests.set(conversationKey, {
      conversationKey,
      executionHostId: executionHostScope,
      agent: conversation.agent,
      providerSession
    })
  }
  return [...requests.values()]
}

export async function resolveConversationSessionTitles(
  requests: ConversationSessionTitleRequest[],
  resolveSessionTitles: ResolveSessionTitles
): Promise<ReadonlyMap<string, string>> {
  const titles = new Map<string, string>()
  await settleAiVaultSessionTitleRequestBatches(requests, async (batch) => {
    const executionHostId = batch[0]!.executionHostId
    const result = await resolveSessionTitles({
      executionHostScope: executionHostId,
      requests: batch.map(({ agent, providerSession }) => ({
        agent,
        sessionId: providerSession.id,
        ...(providerSession.transcriptPath
          ? { transcriptPath: providerSession.transcriptPath }
          : {})
      }))
    })
    const titleByIdentity = new Map(
      result.titles.map((title) => [`${title.agent}\0${title.sessionId}`, title.title.trim()])
    )
    for (const request of batch) {
      // An empty value records a successful exact lookup with no usable title.
      titles.set(
        request.conversationKey,
        titleByIdentity.get(`${request.agent}\0${request.providerSession.id}`) ?? ''
      )
    }
  })
  return titles
}

export async function resolveConversationSessionTitleChanges(
  requests: ConversationSessionTitleRequest[],
  cachedResolutions: ReadonlyMap<string, ConversationSessionTitleResolution>,
  resolveSessionTitles: ResolveSessionTitles,
  now = Date.now()
): Promise<ConversationSessionTitleChanges> {
  const unresolved = requests.filter((request) => {
    const cached = cachedResolutions.get(request.conversationKey)
    return (
      cached?.fingerprint !== requestFingerprint(request) ||
      (cached.retryAt !== null && cached.retryAt <= now)
    )
  })
  if (unresolved.length === 0) {
    return { titles: new Map(), resolutions: new Map() }
  }
  const titles = await resolveConversationSessionTitles(unresolved, resolveSessionTitles)
  const resolutions = new Map<string, ConversationSessionTitleResolution>()
  for (const request of unresolved) {
    const title = titles.get(request.conversationKey)?.trim()
    resolutions.set(request.conversationKey, {
      fingerprint: requestFingerprint(request),
      retryAt: title ? null : now + MISSING_AI_VAULT_TITLE_REFRESH_MS
    })
  }
  return { titles, resolutions }
}

function retainActiveTitles(
  previous: ReadonlyMap<string, string>,
  activeKeys: ReadonlySet<string>,
  resolved: ReadonlyMap<string, string>
): ReadonlyMap<string, string> {
  const next = new Map([...previous].filter(([key]) => activeKeys.has(key)))
  for (const [key, title] of resolved) {
    next.set(key, title)
  }
  return sameTitles(previous, next) ? previous : next
}

/** Reuses the native title resolver already used by AI Vault-backed tabs. */
export function useConversationSessionTitles(
  sources: readonly ConversationSessionTitleSource[]
): ReadonlyMap<string, string> {
  const requests = useMemo(() => collectConversationSessionTitleRequests(sources), [sources])
  const [titles, setTitles] = useState<ReadonlyMap<string, string>>(new Map())
  const [retryVersion, setRetryVersion] = useState(0)
  const cachedResolutions = useRef(new Map<string, ConversationSessionTitleResolution>())

  useEffect(() => {
    let disposed = false
    let retryTimer: number | null = null
    const activeKeys = new Set(requests.map((request) => request.conversationKey))
    for (const key of cachedResolutions.current.keys()) {
      if (!activeKeys.has(key)) {
        cachedResolutions.current.delete(key)
      }
    }
    if (requests.length === 0) {
      setTitles((previous) => (previous.size === 0 ? previous : new Map()))
      return
    }
    void resolveConversationSessionTitleChanges(requests, cachedResolutions.current, (args) =>
      window.api.aiVault.resolveSessionTitles(args)
    ).then((changes) => {
      if (!disposed) {
        for (const [key, resolution] of changes.resolutions) {
          cachedResolutions.current.set(key, resolution)
        }
        setTitles((previous) => retainActiveTitles(previous, activeKeys, changes.titles))
        const nextRetryAt = Math.min(
          ...[...cachedResolutions.current.entries()]
            .filter(([key, resolution]) => activeKeys.has(key) && resolution.retryAt !== null)
            .map(([, resolution]) => resolution.retryAt as number)
        )
        if (Number.isFinite(nextRetryAt)) {
          retryTimer = window.setTimeout(
            () => setRetryVersion((version) => version + 1),
            Math.max(0, nextRetryAt - Date.now())
          )
        }
      }
    })
    return () => {
      disposed = true
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
      }
    }
  }, [requests, retryVersion])

  return titles
}

function requestFingerprint(request: ConversationSessionTitleRequest): string {
  return JSON.stringify([
    request.executionHostId,
    request.agent,
    request.providerSession.key,
    request.providerSession.id,
    request.providerSession.transcriptPath ?? null
  ])
}

function sameTitles(
  left: ReadonlyMap<string, string>,
  right: ReadonlyMap<string, string>
): boolean {
  return left.size === right.size && [...left].every(([key, value]) => right.get(key) === value)
}
