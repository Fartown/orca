import { createHash, randomUUID } from 'node:crypto'
import {
  normalizeAgentProviderSession,
  type AgentProviderSessionMetadata
} from '../../shared/agent-session-resume'
import type {
  AuthorityHostPartitionKey,
  ConversationProviderIdentity
} from '../../shared/issues/types'
import type { TuiAgent } from '../../shared/tui-agent'
import type { IssueDatabase } from './issue-database'
import { hostPartitionForExecutionHost } from './issue-host-partition'
import { IssueRepositoryError } from './issue-repository-error'

type ConversationProviderIdentityRow = {
  id: string
  conversation_id: string
  host_partition_key: AuthorityHostPartitionKey
  agent: TuiAgent
  session_key: AgentProviderSessionMetadata['key']
  session_id: string
  transcript_path: string | null
  identity_fingerprint: string
  resume_locator: string | null
  observed_at: number
  retired_at: number | null
}

export type AttachConversationProviderIdentityInput = {
  conversationId: string
  agent: TuiAgent
  providerSession: AgentProviderSessionMetadata
  resumeLocator?: string | null
  observedAt?: number
}

export type FindConversationProviderIdentityInput = {
  hostPartitionKey: AuthorityHostPartitionKey
  agent: TuiAgent
  providerSession: AgentProviderSessionMetadata
}

export function getConversationIdentityFingerprint(input: {
  hostPartitionKey: AuthorityHostPartitionKey
  agent: TuiAgent
  providerSession: AgentProviderSessionMetadata
}): string {
  const providerSession = normalizeAgentProviderSession(input.providerSession)
  if (!providerSession) {
    throw invalidIdentity('Provider session identity is invalid.')
  }
  const transcriptDiscriminator =
    input.agent === 'pi' || input.agent === 'prime-agent'
      ? providerSession.transcriptPath?.trim()
      : ''
  if ((input.agent === 'pi' || input.agent === 'prime-agent') && !transcriptDiscriminator) {
    throw invalidIdentity(`${input.agent} identity requires a canonical transcript path.`)
  }
  return createHash('sha256')
    .update(
      encodeFingerprintFields([
        'orca-conversation-provider-identity-v1',
        input.hostPartitionKey,
        input.agent,
        providerSession.key,
        providerSession.id,
        transcriptDiscriminator ?? ''
      ])
    )
    .digest('hex')
}

export class ConversationIdentityRepository {
  constructor(private readonly database: IssueDatabase) {}

  findActive(
    input: FindConversationProviderIdentityInput
  ): ConversationProviderIdentity | undefined {
    const fingerprint = getConversationIdentityFingerprint(input)
    const row = this.database
      .prepare(
        `SELECT * FROM conversation_provider_identities
         WHERE host_partition_key = ? AND agent = ?
           AND identity_fingerprint = ? AND retired_at IS NULL`
      )
      .get(input.hostPartitionKey, input.agent, fingerprint) as
      | ConversationProviderIdentityRow
      | undefined
    return row ? providerIdentityFromRow(row) : undefined
  }

  findActiveForExecutionHost(input: {
    executionHostId: Parameters<typeof hostPartitionForExecutionHost>[0]
    agent: TuiAgent
    providerSession: AgentProviderSessionMetadata
  }): ConversationProviderIdentity | undefined {
    return this.findActive({
      hostPartitionKey: hostPartitionForExecutionHost(input.executionHostId),
      agent: input.agent,
      providerSession: input.providerSession
    })
  }

  listForConversation(conversationId: string): ConversationProviderIdentity[] {
    return (
      this.database
        .prepare(
          `SELECT * FROM conversation_provider_identities
           WHERE conversation_id = ? ORDER BY observed_at DESC, id`
        )
        .all(conversationId) as ConversationProviderIdentityRow[]
    ).map(providerIdentityFromRow)
  }

  attach(input: AttachConversationProviderIdentityInput): ConversationProviderIdentity {
    return this.database.transaction(() => this.attachWithinTransaction(input))
  }

  attachWithinTransaction(
    input: AttachConversationProviderIdentityInput
  ): ConversationProviderIdentity {
    const conversation = this.database
      .prepare('SELECT host_partition_key, agent FROM conversations WHERE id = ?')
      .get(input.conversationId) as
      | { host_partition_key: AuthorityHostPartitionKey; agent: TuiAgent }
      | undefined
    if (!conversation) {
      throw new IssueRepositoryError(
        'conversation_not_found',
        `Conversation ${input.conversationId} was not found.`
      )
    }
    if (conversation.agent !== input.agent) {
      throw invalidIdentity(`Conversation ${input.conversationId} belongs to another agent.`)
    }
    const providerSession = normalizeAgentProviderSession(input.providerSession)
    if (!providerSession) {
      throw invalidIdentity('Provider session identity is invalid.')
    }
    const fingerprint = getConversationIdentityFingerprint({
      hostPartitionKey: conversation.host_partition_key,
      agent: input.agent,
      providerSession
    })
    const matching = this.database
      .prepare(
        `SELECT * FROM conversation_provider_identities
         WHERE host_partition_key = ? AND agent = ? AND identity_fingerprint = ?
         ORDER BY retired_at IS NULL DESC, observed_at DESC LIMIT 1`
      )
      .get(conversation.host_partition_key, input.agent, fingerprint) as
      | ConversationProviderIdentityRow
      | undefined
    if (matching && matching.conversation_id !== input.conversationId) {
      throw new IssueRepositoryError(
        'conversation_identity_conflict',
        `Provider identity is already owned by Conversation ${matching.conversation_id}.`
      )
    }

    const observedAt = input.observedAt ?? Date.now()
    if (matching) {
      this.database
        .prepare(
          `UPDATE conversation_provider_identities
           SET session_key = ?, session_id = ?, transcript_path = ?, resume_locator = ?,
               observed_at = MAX(observed_at, ?), retired_at = NULL
           WHERE id = ?`
        )
        .run(
          providerSession.key,
          providerSession.id,
          providerSession.transcriptPath ?? null,
          input.resumeLocator ?? matching.resume_locator,
          observedAt,
          matching.id
        )
      return this.requireById(matching.id)
    }

    const id = randomUUID()
    this.database
      .prepare(
        `INSERT INTO conversation_provider_identities (
           id, conversation_id, host_partition_key, agent, session_key, session_id,
           transcript_path, identity_fingerprint, resume_locator, observed_at, retired_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .run(
        id,
        input.conversationId,
        conversation.host_partition_key,
        input.agent,
        providerSession.key,
        providerSession.id,
        providerSession.transcriptPath ?? null,
        fingerprint,
        input.resumeLocator ?? null,
        observedAt
      )
    return this.requireById(id)
  }

  private requireById(id: string): ConversationProviderIdentity {
    const row = this.database
      .prepare('SELECT * FROM conversation_provider_identities WHERE id = ?')
      .get(id) as ConversationProviderIdentityRow | undefined
    if (!row) {
      throw new Error(`Conversation provider identity ${id} was not persisted.`)
    }
    return providerIdentityFromRow(row)
  }
}

function providerIdentityFromRow(
  row: ConversationProviderIdentityRow
): ConversationProviderIdentity {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    hostPartitionKey: row.host_partition_key,
    agent: row.agent,
    session: {
      key: row.session_key,
      id: row.session_id,
      ...(row.transcript_path ? { transcriptPath: row.transcript_path } : {})
    },
    identityFingerprint: row.identity_fingerprint,
    resumeLocator: row.resume_locator,
    observedAt: row.observed_at,
    retiredAt: row.retired_at
  }
}

function encodeFingerprintFields(fields: readonly string[]): Buffer {
  const chunks: Buffer[] = []
  for (const field of fields) {
    const value = Buffer.from(field, 'utf8')
    const length = Buffer.allocUnsafe(4)
    length.writeUInt32BE(value.length)
    chunks.push(length, value)
  }
  return Buffer.concat(chunks)
}

function invalidIdentity(message: string): IssueRepositoryError {
  return new IssueRepositoryError('conversation_identity_invalid', message)
}
