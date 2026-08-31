import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentProviderSessionMetadata } from '../../../shared/agent-session-resume'
import {
  AI_VAULT_SESSION_TITLE_REQUEST_MAX_COUNT,
  isAiVaultTitleAgent,
  type AiVaultSessionTitle
} from '../../../shared/ai-vault-session-title'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { ConversationSummary } from '../../../shared/issues/types'
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

/** Reuses the native title resolver already used by AI Vault-backed tabs. */
export function useConversationSessionTitles(
  sources: readonly ConversationSessionTitleSource[]
): ReadonlyMap<string, string> {
  const requests = useMemo(() => collectConversationSessionTitleRequests(sources), [sources])
  // Why: callers rebuild `sources` on every store publish; only a changed identity set warrants another resolve.
  const requestsKey = useMemo(
    () => requests.map((request) => request.conversationKey).join('\n'),
    [requests]
  )
  const latestRequests = useRef(requests)
  useEffect(() => {
    latestRequests.current = requests
  }, [requests])
  const [titles, setTitles] = useState<ReadonlyMap<string, string>>(() => new Map())

  useEffect(() => {
    let cancelled = false
    const pending = latestRequests.current
    if (pending.length === 0) {
      setTitles((previous) => (previous.size === 0 ? previous : new Map()))
      return
    }

    const resolve = async (): Promise<void> => {
      const resolved = new Map<string, string>()
      await Promise.all(
        buildConversationTitleRequestBatches(pending).map(async (batch) => {
          const first = batch[0]
          if (!first) {
            return
          }
          try {
            const result = await window.api.aiVault.resolveSessionTitles({
              executionHostScope: first.executionHostId,
              requests: batch.map((request) => ({
                agent: request.agent,
                sessionId: request.providerSession.id,
                ...(request.providerSession.transcriptPath
                  ? { transcriptPath: request.providerSession.transcriptPath }
                  : {})
              }))
            })
            const titleByIdentity = new Map(
              result.titles
                .filter((title) => title.title.trim())
                .map((title) => [`${title.agent}\0${title.sessionId}`, title.title.trim()])
            )
            for (const request of batch) {
              const title = titleByIdentity.get(`${request.agent}\0${request.providerSession.id}`)
              if (title) {
                resolved.set(request.conversationKey, title)
              }
            }
          } catch {
            // An unavailable host must not suppress titles resolved from other hosts.
          }
        })
      )
      // Why: the previous titles stay on screen until the fresh set lands — no blank frame between polls.
      if (!cancelled) {
        setTitles(resolved)
      }
    }

    void resolve()
    return () => {
      cancelled = true
    }
  }, [requestsKey])

  return titles
}

function buildConversationTitleRequestBatches(
  requests: readonly ConversationSessionTitleRequest[]
): ConversationSessionTitleRequest[][] {
  const byHost = new Map<ExecutionHostId, ConversationSessionTitleRequest[]>()
  for (const request of requests) {
    const hostRequests = byHost.get(request.executionHostId) ?? []
    hostRequests.push(request)
    byHost.set(request.executionHostId, hostRequests)
  }
  return [...byHost.values()].flatMap((hostRequests) => {
    const batches: ConversationSessionTitleRequest[][] = []
    for (
      let index = 0;
      index < hostRequests.length;
      index += AI_VAULT_SESSION_TITLE_REQUEST_MAX_COUNT
    ) {
      batches.push(hostRequests.slice(index, index + AI_VAULT_SESSION_TITLE_REQUEST_MAX_COUNT))
    }
    return batches
  })
}
