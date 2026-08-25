import { createHash, randomUUID } from 'node:crypto'
import { LAUNCH_TOKEN_MAX_LENGTH, LAUNCH_TOKEN_MIN_LENGTH } from '../../shared/issues/constants'
import type {
  AuthorityHostPartitionKey,
  ConversationLaunchClaim,
  ConversationLaunchClaimSettlement
} from '../../shared/issues/types'
import type { IssueDatabase } from './issue-database'
import { IssueRepositoryError } from './issue-repository-error'

type ConversationLaunchClaimRow = {
  claim_id: string
  conversation_id: string
  host_partition_key: AuthorityHostPartitionKey
  launch_token_hash: string
  pane_key: string | null
  process_incarnation: string | null
  connection_id: string | null
  created_at: number
  expires_at: number
  settled_at: number | null
  settlement: ConversationLaunchClaimSettlement | null
}

export type CreateConversationLaunchClaimInput = {
  conversationId: string
  launchToken: string
  paneKey?: string | null
  processIncarnation?: string | null
  connectionId?: string | null
  createdAt?: number
  expiresAt: number
}

export type ResolveConversationLaunchClaimInput = {
  hostPartitionKey: AuthorityHostPartitionKey
  launchToken?: string | null
  paneKey?: string | null
  processIncarnation?: string | null
  connectionId?: string | null
  now?: number
}

export function hashConversationLaunchToken(launchToken: string): string {
  if (
    launchToken.length < LAUNCH_TOKEN_MIN_LENGTH ||
    launchToken.length > LAUNCH_TOKEN_MAX_LENGTH ||
    !/^[A-Za-z0-9._:-]+$/.test(launchToken)
  ) {
    throw new IssueRepositoryError(
      'conversation_launch_claim_invalid',
      'Conversation launch token is invalid.'
    )
  }
  return createHash('sha256').update(launchToken).digest('hex')
}

export class ConversationLaunchClaimRepository {
  constructor(private readonly database: IssueDatabase) {}

  create(input: CreateConversationLaunchClaimInput): ConversationLaunchClaim {
    return this.database.transaction(() => this.createWithinTransaction(input))
  }

  createWithinTransaction(input: CreateConversationLaunchClaimInput): ConversationLaunchClaim {
    const createdAt = input.createdAt ?? Date.now()
    if (input.expiresAt <= createdAt) {
      throw new IssueRepositoryError(
        'conversation_launch_claim_invalid',
        'Conversation launch claim must expire after it is created.'
      )
    }
    const conversation = this.database
      .prepare('SELECT host_partition_key FROM conversations WHERE id = ?')
      .get(input.conversationId) as { host_partition_key: AuthorityHostPartitionKey } | undefined
    if (!conversation) {
      throw new IssueRepositoryError(
        'conversation_not_found',
        `Conversation ${input.conversationId} was not found.`
      )
    }
    const launchTokenFingerprint = hashConversationLaunchToken(input.launchToken)
    const existing = this.findLatestByTokenFingerprint(
      conversation.host_partition_key,
      launchTokenFingerprint
    )
    if (existing) {
      if (existing.conversationId === input.conversationId && existing.settlement === null) {
        return existing
      }
      throw new IssueRepositoryError(
        'conversation_launch_claim_invalid',
        'Conversation launch token has already been consumed or retired.'
      )
    }

    const claimId = randomUUID()
    this.database
      .prepare(
        `INSERT INTO conversation_launch_claims (
           claim_id, conversation_id, host_partition_key, launch_token_hash,
           pane_key, process_incarnation, connection_id,
           created_at, expires_at, settled_at, settlement
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`
      )
      .run(
        claimId,
        input.conversationId,
        conversation.host_partition_key,
        launchTokenFingerprint,
        input.paneKey ?? null,
        input.processIncarnation ?? null,
        input.connectionId ?? null,
        createdAt,
        input.expiresAt
      )
    return this.requireById(claimId)
  }

  resolveActive(input: ResolveConversationLaunchClaimInput): ConversationLaunchClaim {
    return this.database.transaction(() => this.resolveActiveWithinTransaction(input))
  }

  resolveActiveWithinTransaction(
    input: ResolveConversationLaunchClaimInput
  ): ConversationLaunchClaim {
    const now = input.now ?? Date.now()
    if (input.launchToken) {
      const claim = this.findLatestByTokenFingerprint(
        input.hostPartitionKey,
        hashConversationLaunchToken(input.launchToken)
      )
      if (!claim) {
        throw claimNotFound()
      }
      return this.requireActive(claim, now)
    }

    const conditions = ['host_partition_key = ?', 'settled_at IS NULL', 'expires_at > ?']
    const bindings: (string | number)[] = [input.hostPartitionKey, now]
    for (const [column, value] of [
      ['pane_key', input.paneKey],
      ['process_incarnation', input.processIncarnation],
      ['connection_id', input.connectionId]
    ] as const) {
      if (value) {
        conditions.push(`${column} = ?`)
        bindings.push(value)
      }
    }
    if (conditions.length === 3) {
      throw new IssueRepositoryError(
        'conversation_launch_claim_invalid',
        'Conversation launch claim resolution requires token or runtime evidence.'
      )
    }
    const rows = this.database
      .prepare(
        `SELECT * FROM conversation_launch_claims
         WHERE ${conditions.join(' AND ')}
         ORDER BY created_at DESC LIMIT 2`
      )
      .all(...bindings) as ConversationLaunchClaimRow[]
    if (rows.length === 0) {
      throw claimNotFound()
    }
    if (rows.length > 1) {
      throw new IssueRepositoryError(
        'conversation_launch_claim_ambiguous',
        'Conversation launch evidence matches more than one claim.'
      )
    }
    return launchClaimFromRow(rows[0])
  }

  settleWithinTransaction(
    claimId: string,
    settlement: ConversationLaunchClaimSettlement,
    settledAt = Date.now()
  ): ConversationLaunchClaim {
    const current = this.requireById(claimId)
    if (current.settlement !== null) {
      return current
    }
    this.database
      .prepare(
        `UPDATE conversation_launch_claims
         SET settled_at = ?, settlement = ?
         WHERE claim_id = ? AND settled_at IS NULL`
      )
      .run(settledAt, settlement, claimId)
    return this.requireById(claimId)
  }

  failPendingWithinTransaction(claimId: string, settledAt = Date.now()): ConversationLaunchClaim {
    const current = this.requireById(claimId)
    if (current.settlement !== null) {
      throw new IssueRepositoryError(
        'conversation_launch_claim_invalid',
        `Conversation launch claim ${claimId} was already ${current.settlement}.`
      )
    }
    return this.settleWithinTransaction(claimId, 'failed', settledAt)
  }

  expirePendingWithinTransaction(conversationId: string, now = Date.now()): number {
    return Number(
      this.database
        .prepare(
          `UPDATE conversation_launch_claims
         SET settled_at = ?, settlement = 'expired'
         WHERE conversation_id = ? AND settled_at IS NULL AND expires_at <= ?`
        )
        .run(now, conversationId, now).changes
    )
  }

  hasPending(conversationId: string, now = Date.now()): boolean {
    return Boolean(
      this.database
        .prepare(
          `SELECT 1 FROM conversation_launch_claims
           WHERE conversation_id = ? AND settled_at IS NULL AND expires_at > ? LIMIT 1`
        )
        .get(conversationId, now)
    )
  }

  listForConversation(conversationId: string): ConversationLaunchClaim[] {
    return (
      this.database
        .prepare(
          `SELECT * FROM conversation_launch_claims
           WHERE conversation_id = ? ORDER BY created_at DESC, claim_id`
        )
        .all(conversationId) as ConversationLaunchClaimRow[]
    ).map(launchClaimFromRow)
  }

  private requireActive(claim: ConversationLaunchClaim, now: number): ConversationLaunchClaim {
    if (claim.settlement !== null) {
      throw new IssueRepositoryError(
        'conversation_launch_claim_invalid',
        `Conversation launch claim ${claim.claimId} was already ${claim.settlement}.`
      )
    }
    if (claim.expiresAt <= now) {
      this.settleWithinTransaction(claim.claimId, 'expired', now)
      throw new IssueRepositoryError(
        'conversation_launch_claim_expired',
        `Conversation launch claim ${claim.claimId} has expired.`
      )
    }
    return claim
  }

  private findLatestByTokenFingerprint(
    hostPartitionKey: AuthorityHostPartitionKey,
    launchTokenFingerprint: string
  ): ConversationLaunchClaim | undefined {
    const row = this.database
      .prepare(
        `SELECT * FROM conversation_launch_claims
         WHERE host_partition_key = ? AND launch_token_hash = ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(hostPartitionKey, launchTokenFingerprint) as ConversationLaunchClaimRow | undefined
    return row ? launchClaimFromRow(row) : undefined
  }

  private requireById(claimId: string): ConversationLaunchClaim {
    const row = this.database
      .prepare('SELECT * FROM conversation_launch_claims WHERE claim_id = ?')
      .get(claimId) as ConversationLaunchClaimRow | undefined
    if (!row) {
      throw claimNotFound(claimId)
    }
    return launchClaimFromRow(row)
  }
}

function launchClaimFromRow(row: ConversationLaunchClaimRow): ConversationLaunchClaim {
  return {
    claimId: row.claim_id,
    conversationId: row.conversation_id,
    hostPartitionKey: row.host_partition_key,
    launchTokenFingerprint: row.launch_token_hash,
    paneKey: row.pane_key,
    processIncarnation: row.process_incarnation,
    connectionId: row.connection_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    settledAt: row.settled_at,
    settlement: row.settlement
  }
}

function claimNotFound(claimId?: string): IssueRepositoryError {
  return new IssueRepositoryError(
    'conversation_launch_claim_not_found',
    claimId
      ? `Conversation launch claim ${claimId} was not found.`
      : 'Conversation launch claim was not found.'
  )
}
