import type { AgentProviderSessionMetadata } from '../../shared/agent-session-resume'
import type { AgentStatusState, AgentType } from '../../shared/agent-status-types'
import type { WorkspaceScope } from '../../shared/folder-workspace-types'
import type { AuthorityExecutionHostId, WorkspaceSnapshot } from '../../shared/issues/types'
import { isTuiAgent } from '../../shared/tui-agent-config'
import type { TuiAgent } from '../../shared/tui-agent'
import {
  canonicalizeAgentSessionIdentityWithPathAccess,
  type AgentSessionIdentityPathAccess
} from '../runtime/agent-session-claim-identity'
import type { IssueRepository } from './issue-repository'
import { IssueRepositoryError } from './issue-repository-error'
import type { ConversationRuntimeAttachmentRegistry } from './conversation-runtime-attachment-registry'

export type ConversationHookIdentityContext = {
  executionHostId: AuthorityExecutionHostId
  workspaceRef: WorkspaceScope
  workspaceSnapshot: WorkspaceSnapshot
  processIncarnation: string | null
  connectionId: string | null
  hostPlatform: NodeJS.Platform
  wslDistro?: string | null
}

export type ConversationHookIdentityEvent = {
  paneKey: string
  tabId?: string | null
  worktreeId?: string
  connectionId?: string | null
  launchToken?: string
  providerSession?: AgentProviderSessionMetadata
  providerSessionOnly?: boolean
  restoredUnconfirmed?: true
  isReplay?: boolean
  payload: {
    state?: AgentStatusState
    agentType?: AgentType
  }
  receivedAt: number
}

export type ConversationHookIdentityIngestResult =
  | {
      disposition: 'attached' | 'created' | 'replayed'
      conversationId: string
    }
  | {
      disposition: 'ignored'
      reason:
        | 'identity-missing'
        | 'workspace-unresolved'
        | 'runtime-evidence-mismatch'
        | 'identity-invalid'
        | 'claim-unresolved'
    }

export type ConversationHookIdentityIngestorDependencies = {
  resolveContext(
    paneKey: string,
    expectedWorktreeId?: string,
    connectionId?: string | null
  ): Promise<ConversationHookIdentityContext | null>
  resolvePathAccess?(
    context: ConversationHookIdentityContext
  ): AgentSessionIdentityPathAccess | null
  onDiagnostic?(
    result: ConversationHookIdentityIngestResult,
    event: ConversationHookIdentityEvent
  ): void
  attachments?: ConversationRuntimeAttachmentRegistry
}

const CLAIM_RESOLUTION_ERRORS = new Set([
  'conversation_launch_claim_not_found',
  'conversation_launch_claim_invalid',
  'conversation_launch_claim_expired',
  'conversation_launch_claim_ambiguous'
])

export class ConversationHookIdentityIngestor {
  constructor(
    private readonly repository: IssueRepository,
    private readonly dependencies: ConversationHookIdentityIngestorDependencies
  ) {}

  async ingest(
    event: ConversationHookIdentityEvent
  ): Promise<ConversationHookIdentityIngestResult> {
    if (
      event.restoredUnconfirmed ||
      !event.providerSession ||
      !isTuiAgent(event.payload.agentType)
    ) {
      return this.finish({ disposition: 'ignored', reason: 'identity-missing' }, event)
    }
    const context = await this.dependencies
      .resolveContext(event.paneKey, event.worktreeId, event.connectionId)
      .catch(() => null)
    if (!context) {
      return this.finish({ disposition: 'ignored', reason: 'workspace-unresolved' }, event)
    }
    if (event.connectionId !== undefined && (event.connectionId ?? null) !== context.connectionId) {
      return this.finish({ disposition: 'ignored', reason: 'runtime-evidence-mismatch' }, event)
    }

    let providerSession: AgentProviderSessionMetadata
    try {
      const pathAccess = this.dependencies.resolvePathAccess?.(context) ?? undefined
      if (
        (event.payload.agentType === 'pi' || event.payload.agentType === 'prime-agent') &&
        context.connectionId &&
        !pathAccess
      ) {
        throw new Error('agent_session_identity_required')
      }
      providerSession = (
        await canonicalizeAgentSessionIdentityWithPathAccess(
          event.payload.agentType,
          event.providerSession,
          pathAccess
        )
      ).providerSession
    } catch {
      return this.finish({ disposition: 'ignored', reason: 'identity-invalid' }, event)
    }

    if (event.isReplay && !event.launchToken) {
      const existing = this.repository.conversationIdentities.findActiveForExecutionHost({
        executionHostId: context.executionHostId,
        agent: event.payload.agentType,
        providerSession
      })
      if (!existing) {
        return this.finish({ disposition: 'ignored', reason: 'identity-missing' }, event)
      }
    }

    if (event.launchToken) {
      try {
        const attached = this.repository.conversationAllocator.attachProviderIdentity({
          executionHostId: context.executionHostId,
          workspaceRef: context.workspaceRef,
          agent: event.payload.agentType,
          providerSession,
          resumeLocator: providerSession.transcriptPath ?? null,
          launchToken: event.launchToken,
          paneKey: event.paneKey,
          processIncarnation: context.processIncarnation,
          connectionId: context.connectionId,
          observedAt: event.receivedAt
        })
        this.recordAttachment(
          event,
          context,
          attached.conversation.id,
          attached.identity.identityFingerprint
        )
        return this.finish(
          { disposition: 'attached', conversationId: attached.conversation.id },
          event
        )
      } catch (error) {
        if (
          error instanceof IssueRepositoryError &&
          error.code === 'conversation_launch_claim_not_found'
        ) {
          return this.resolveOrdinaryIdentity(
            event,
            context,
            providerSession,
            event.payload.agentType
          )
        }
        if (error instanceof IssueRepositoryError && CLAIM_RESOLUTION_ERRORS.has(error.code)) {
          return this.finish({ disposition: 'ignored', reason: 'claim-unresolved' }, event)
        }
        throw error
      }
    }

    return this.resolveOrdinaryIdentity(event, context, providerSession, event.payload.agentType)
  }

  private resolveOrdinaryIdentity(
    event: ConversationHookIdentityEvent,
    context: ConversationHookIdentityContext,
    providerSession: AgentProviderSessionMetadata,
    agent: TuiAgent
  ): ConversationHookIdentityIngestResult {
    const resolved = this.repository.conversationAllocator.resolveObservedIdentityOrAllocate({
      executionHostId: context.executionHostId,
      workspaceRef: context.workspaceRef,
      workspaceSnapshot: context.workspaceSnapshot,
      agent,
      issueId: null,
      providerSession,
      resumeLocator: providerSession.transcriptPath ?? null,
      observedAt: event.receivedAt
    })
    this.recordAttachment(
      event,
      context,
      resolved.conversation.id,
      resolved.identity.identityFingerprint
    )
    return this.finish(
      {
        disposition: resolved.disposition,
        conversationId: resolved.conversation.id
      },
      event
    )
  }

  private finish(
    result: ConversationHookIdentityIngestResult,
    event: ConversationHookIdentityEvent
  ): ConversationHookIdentityIngestResult {
    this.dependencies.onDiagnostic?.(result, event)
    return result
  }

  private recordAttachment(
    event: ConversationHookIdentityEvent,
    context: ConversationHookIdentityContext,
    conversationId: string,
    providerIdentityFingerprint: string
  ): void {
    this.dependencies.attachments?.upsert({
      conversationId,
      paneKey: event.paneKey,
      tabId: event.tabId ?? null,
      worktreeId: context.workspaceRef.type === 'worktree' ? context.workspaceRef.worktreeId : null,
      connectionId: context.connectionId,
      providerIdentityFingerprint,
      executionState: executionState(event.payload.state),
      observedAt: event.receivedAt
    })
  }
}

function executionState(
  state: AgentStatusState | undefined
): 'launching' | 'running' | 'waiting' | 'stopped' | 'failed' {
  if (state === 'working') {
    return 'running'
  }
  if (state === 'waiting' || state === 'blocked') {
    return 'waiting'
  }
  return 'stopped'
}
