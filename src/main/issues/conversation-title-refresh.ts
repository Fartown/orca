import { mintAgentSessionFallbackTitle } from '../../shared/agent-session-fallback-title'
import type {
  AiVaultSessionTitle,
  AiVaultSessionTitlesArgs,
  AiVaultSessionTitlesResult
} from '../../shared/ai-vault-session-title'
import {
  AI_VAULT_SESSION_TITLE_REQUEST_MAX_COUNT,
  isAiVaultTitleAgent
} from '../../shared/ai-vault-session-title'
import { ISSUE_TITLE_MAX_BYTES } from '../../shared/issues/constants'
import type { ConversationRecord } from '../../shared/issues/types'
import { clampUtf8TextPrefix } from '../../shared/utf8-byte-limits'
import { IssueRepositoryError } from './issue-repository-error'
import type { IssueRepository } from './issue-repository'

type ResolveSessionTitles = (args: AiVaultSessionTitlesArgs) => Promise<AiVaultSessionTitlesResult>

type TitleRefreshCandidate = {
  conversationId: string
  executionHostId: ConversationRecord['executionHostId']
  agent: AiVaultSessionTitle['agent']
  sessionId: string
  transcriptPath?: string
}

/**
 * Last-known Provider title refresh, run inside the owning authority.
 *
 * Identity attachment, Issue binding, settled rounds, and one startup backfill
 * all reuse this host-routed resolver and the same authority gate. No poller or
 * retry chain is introduced.
 */
export class ConversationTitleRefresh {
  private readonly inFlight = new Set<string>()
  private readonly pending = new Set<string>()
  private disposed = false

  constructor(
    private readonly repository: IssueRepository,
    private readonly resolveSessionTitles: ResolveSessionTitles
  ) {}

  schedule(conversationId: string): void {
    if (this.disposed) {
      return
    }
    // A trigger landing mid-flight (next round, buffered replay) must not be
    // dropped: the in-flight read may predate the title it announces.
    if (this.inFlight.has(conversationId)) {
      this.pending.add(conversationId)
      return
    }
    this.inFlight.add(conversationId)
    void this.refresh(conversationId)
      .catch((error) => {
        console.error('[issues] conversation title refresh failed:', error)
      })
      .finally(() => {
        this.inFlight.delete(conversationId)
        if (this.pending.delete(conversationId)) {
          this.schedule(conversationId)
        }
      })
  }

  async backfillMissingSnapshots(): Promise<void> {
    const candidates = this.repository.conversations
      .list()
      .filter((conversation) => !conversation.providerTitle?.trim())
      .map((conversation) => this.candidateFor(conversation.id))
      .filter((candidate): candidate is TitleRefreshCandidate => candidate !== null)
    const candidatesByHost = new Map<
      ConversationRecord['executionHostId'],
      TitleRefreshCandidate[]
    >()
    for (const candidate of candidates) {
      const hostCandidates = candidatesByHost.get(candidate.executionHostId) ?? []
      hostCandidates.push(candidate)
      candidatesByHost.set(candidate.executionHostId, hostCandidates)
    }
    for (const hostCandidates of candidatesByHost.values()) {
      for (
        let offset = 0;
        offset < hostCandidates.length;
        offset += AI_VAULT_SESSION_TITLE_REQUEST_MAX_COUNT
      ) {
        if (this.disposed) {
          return
        }
        const batch = hostCandidates.slice(
          offset,
          offset + AI_VAULT_SESSION_TITLE_REQUEST_MAX_COUNT
        )
        try {
          await this.resolveAndApply(batch)
        } catch (error) {
          console.error('[issues] conversation title backfill failed:', error)
        }
      }
    }
  }

  dispose(): void {
    this.disposed = true
    this.pending.clear()
  }

  private async refresh(conversationId: string): Promise<void> {
    const candidate = this.candidateFor(conversationId)
    if (!candidate) {
      return
    }
    await this.resolveAndApply([candidate])
  }

  private candidateFor(conversationId: string): TitleRefreshCandidate | null {
    const conversation = this.repository.conversations.get(conversationId)
    if (!conversation) {
      return null
    }
    const agent = conversation.agent
    if (!isAiVaultTitleAgent(agent)) {
      return null
    }
    const identity = this.repository.conversationIdentities
      .listForConversation(conversationId)
      .find((candidate) => candidate.retiredAt === null)
    if (!identity) {
      return null
    }
    return {
      conversationId,
      executionHostId: conversation.executionHostId,
      agent,
      sessionId: identity.session.id,
      ...(identity.session.transcriptPath
        ? { transcriptPath: identity.session.transcriptPath }
        : {})
    }
  }

  private async resolveAndApply(candidates: TitleRefreshCandidate[]): Promise<void> {
    const first = candidates[0]
    if (!first) {
      return
    }
    const result = await this.resolveSessionTitles({
      executionHostScope: first.executionHostId,
      requests: candidates.map(({ agent, sessionId, transcriptPath }) => ({
        agent,
        sessionId,
        ...(transcriptPath ? { transcriptPath } : {})
      }))
    })
    if (this.disposed) {
      return
    }
    for (const candidate of candidates) {
      this.applyResolvedTitle(candidate, result)
    }
  }

  private applyResolvedTitle(
    candidate: TitleRefreshCandidate,
    result: AiVaultSessionTitlesResult
  ): void {
    // The wire validator bounds titles in UTF-16 code units while the storage
    // gate rejects over ISSUE_TITLE_MAX_BYTES of UTF-8 — truncate to bytes so
    // a long remote CJK title converges instead of failing every round.
    const title = clampUtf8TextPrefix(
      result.titles
        .find(
          (entry) =>
            entry.agent === candidate.agent &&
            entry.sessionId === candidate.sessionId &&
            entry.source !== 'conversation-override'
        )
        ?.title.trim() ?? '',
      ISSUE_TITLE_MAX_BYTES
    ).trim()
    // An empty result or the scanner's own fallback string means the provider
    // has not generated a name yet — never degrade the stored value.
    if (!title || title === mintAgentSessionFallbackTitle(candidate.agent, candidate.sessionId)) {
      return
    }
    const fresh = this.repository.conversations.get(candidate.conversationId)
    if (!fresh) {
      return
    }
    try {
      const applied = this.repository.database.transaction(() =>
        this.repository.conversations.applyProviderTitleWithinTransaction({
          id: candidate.conversationId,
          expectedRecordRevision: fresh.recordRevision,
          title
        })
      )
      if (applied.outcome === 'written') {
        console.log(
          `[issues] conversation title refreshed: ${candidate.conversationId} -> ${JSON.stringify(title)}`
        )
      }
    } catch (error) {
      // A concurrent mutation won this snapshot; the next settled round will
      // refresh again. Anything else must be visible, not silently retried.
      if (
        error instanceof IssueRepositoryError &&
        error.code === 'conversation_record_revision_stale'
      ) {
        return
      }
      console.error('[issues] conversation title refresh write failed:', error)
    }
  }
}
