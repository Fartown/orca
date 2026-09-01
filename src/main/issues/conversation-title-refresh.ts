import { mintAgentSessionFallbackTitle } from '../../shared/agent-session-fallback-title'
import type {
  AiVaultSessionTitlesArgs,
  AiVaultSessionTitlesResult
} from '../../shared/ai-vault-session-title'
import { isAiVaultTitleAgent } from '../../shared/ai-vault-session-title'
import type { IssueRepository } from './issue-repository'

type ResolveSessionTitles = (args: AiVaultSessionTitlesArgs) => Promise<AiVaultSessionTitlesResult>

/**
 * Follow-mode canonical title refresh, run inside the owning authority.
 *
 * Triggered on round events (which includes the first trusted hook right after
 * identity attach). Reads the provider's current session title through the
 * existing host-routed resolver and submits it through the authority gate.
 * No poller, no retry chain: a missed update converges on the next round.
 */
export class ConversationTitleRefresh {
  private readonly inFlight = new Set<string>()

  constructor(
    private readonly repository: IssueRepository,
    private readonly resolveSessionTitles: ResolveSessionTitles
  ) {}

  schedule(conversationId: string): void {
    if (this.inFlight.has(conversationId)) {
      return
    }
    this.inFlight.add(conversationId)
    void this.refresh(conversationId)
      .catch((error) => {
        console.error('[issues] conversation title refresh failed:', error)
      })
      .finally(() => {
        this.inFlight.delete(conversationId)
      })
  }

  private async refresh(conversationId: string): Promise<void> {
    const conversation = this.repository.conversations.get(conversationId)
    // Frozen manual names and agents the title resolver cannot parse are
    // terminal states for automatic refresh.
    if (!conversation || conversation.titleSource === 'user') {
      return
    }
    const agent = conversation.agent
    if (!isAiVaultTitleAgent(agent)) {
      return
    }
    const identity = this.repository.conversationIdentities
      .listForConversation(conversationId)
      .find((candidate) => candidate.retiredAt === null)
    if (!identity) {
      return
    }
    const result = await this.resolveSessionTitles({
      executionHostScope: conversation.executionHostId,
      requests: [
        {
          agent,
          sessionId: identity.session.id,
          ...(identity.session.transcriptPath
            ? { transcriptPath: identity.session.transcriptPath }
            : {})
        }
      ]
    })
    const title = result.titles
      .find((entry) => entry.agent === agent && entry.sessionId === identity.session.id)
      ?.title.trim()
    // An empty result or the scanner's own fallback string means the provider
    // has not generated a name yet — never degrade the stored value.
    if (!title || title === mintAgentSessionFallbackTitle(agent, identity.session.id)) {
      return
    }
    const fresh = this.repository.conversations.get(conversationId)
    if (!fresh || fresh.titleSource === 'user') {
      return
    }
    try {
      const applied = this.repository.database.transaction(() =>
        this.repository.conversations.applyProviderTitleWithinTransaction({
          id: conversationId,
          expectedRecordRevision: fresh.recordRevision,
          title
        })
      )
      if (applied.outcome === 'written') {
        console.log(
          `[issues] conversation title refreshed: ${conversationId} -> ${JSON.stringify(title)}`
        )
      }
    } catch {
      // Stale revision: a concurrent rename won; the gate would reject a retry.
    }
  }
}
