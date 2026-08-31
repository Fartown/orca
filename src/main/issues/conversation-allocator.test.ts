import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ConversationAllocator } from './conversation-allocator'
import type { ConversationRuntimeDeleteState } from './conversation-forget-service'
import { ConversationForgetService } from './conversation-forget-service'
import {
  createIssueTestUserDataPath,
  removeIssueTestDirectories
} from './issue-database.test-environment'
import { IssueRepository, issueMutationIdentity } from './issue-repository'

const transcriptDirectories: string[] = []

afterEach(() => {
  removeIssueTestDirectories()
  for (const directory of transcriptDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('Conversation allocator v1', () => {
  it('stores only a launch-token fingerprint and replays the same mutation once', () => {
    const repository = openRepository('prepare')
    const launchToken = token('prepare')
    const params = {
      identity: issueMutationIdentity('caller-a', 'prepare-1'),
      input: launchInput(launchToken)
    }

    const first = repository.conversationAllocator.prepareLaunch(params)
    const replay = repository.conversationAllocator.prepareLaunch(params)

    expect(replay).toEqual(first)
    expect(repository.conversations.list()).toHaveLength(1)
    expect(
      repository.conversationLaunchClaims.listForConversation(first.conversation.id)
    ).toHaveLength(1)
    expect(repository.conversationIdentities.listForConversation(first.conversation.id)).toEqual([])
    expect(repository.rounds.list(first.conversation.id)).toEqual([])
    const persisted = repository.database
      .prepare(
        `SELECT launch_token_hash AS fingerprint FROM conversation_launch_claims
         WHERE claim_id = ?`
      )
      .get(first.claimId) as { fingerprint: string }
    expect(persisted.fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(first)).not.toContain(launchToken)
    expect(databaseSecretSurface(repository)).not.toContain(launchToken)
    repository.close()
  })

  it('does not reuse a consumed token for a later provider session', () => {
    const repository = openRepository('token-retirement')
    const launchToken = token('shared-shell')
    const prepared = repository.conversationAllocator.prepareLaunch({
      identity: issueMutationIdentity('caller-a', 'prepare-1'),
      input: launchInput(launchToken)
    })
    repository.conversationAllocator.attachProviderIdentity({
      executionHostId: 'local',
      workspaceRef: workspaceRef('worktree-1'),
      agent: 'codex',
      providerSession: providerSession('session-1'),
      launchToken,
      observedAt: 10
    })

    expect(
      captureError(() =>
        repository.conversationAllocator.attachProviderIdentity({
          executionHostId: 'local',
          workspaceRef: workspaceRef('worktree-1'),
          agent: 'codex',
          providerSession: providerSession('session-2'),
          launchToken,
          observedAt: 20
        })
      )
    ).toMatchObject({ code: 'conversation_launch_claim_invalid' })

    const later = repository.conversationAllocator.resolveObservedIdentityOrAllocate({
      ...conversationInput('worktree-1'),
      providerSession: providerSession('session-2'),
      observedAt: 20
    })
    expect(later.conversation.id).not.toBe(prepared.conversation.id)
    expect(
      repository.conversationLaunchClaims.listForConversation(prepared.conversation.id)[0]
    ).toMatchObject({ settlement: 'attached' })
    repository.close()
  })

  it('keeps a known transcript path when later identity evidence omits it', () => {
    const repository = openRepository('identity-path-retention')
    const first = repository.conversationAllocator.resolveObservedIdentityOrAllocate({
      ...conversationInput('worktree-1'),
      providerSession: {
        ...providerSession('session-with-path'),
        transcriptPath: '/workspace/session-with-path.jsonl'
      },
      observedAt: 10
    })

    repository.conversationAllocator.resolveObservedIdentityOrAllocate({
      ...conversationInput('worktree-1'),
      providerSession: providerSession('session-with-path'),
      observedAt: 20
    })

    expect(
      repository.conversationIdentities.listForConversation(first.conversation.id)[0]
    ).toMatchObject({
      session: { transcriptPath: '/workspace/session-with-path.jsonl' }
    })
    repository.close()
  })

  it('rejects expired and ambiguous claims without attaching an identity', () => {
    const repository = openRepository('claim-errors')
    const expiredToken = token('expired')
    const expired = repository.conversationAllocator.prepareLaunch({
      identity: issueMutationIdentity('caller-a', 'expired-prepare'),
      input: { ...launchInput(expiredToken), now: 1, claimTtlMs: 10 }
    })
    expect(
      captureError(() =>
        repository.conversationAllocator.attachProviderIdentity({
          executionHostId: 'local',
          workspaceRef: workspaceRef('worktree-1'),
          agent: 'codex',
          providerSession: providerSession('expired-session'),
          launchToken: expiredToken,
          observedAt: 20
        })
      )
    ).toMatchObject({ code: 'conversation_launch_claim_expired' })
    expect(repository.conversationIdentities.listForConversation(expired.conversation.id)).toEqual(
      []
    )

    for (const mutationId of ['ambiguous-a', 'ambiguous-b']) {
      repository.conversationAllocator.prepareLaunch({
        identity: issueMutationIdentity('caller-a', mutationId),
        input: {
          ...launchInput(token(mutationId), `worktree-${mutationId}`),
          paneKey: 'shared-pane',
          now: 30,
          claimTtlMs: 1_000
        }
      })
    }
    expect(
      captureError(() =>
        repository.conversationLaunchClaims.resolveActive({
          hostPartitionKey: 'local',
          paneKey: 'shared-pane',
          now: 31
        })
      )
    ).toMatchObject({ code: 'conversation_launch_claim_ambiguous' })
    repository.close()
  })

  it('retries a failed preparation with the same conversationId and a new claim', () => {
    const repository = openRepository('retry')
    const prepared = repository.conversationAllocator.prepareLaunch({
      identity: issueMutationIdentity('caller-a', 'prepare-1'),
      input: launchInput(token('retry-first'))
    })
    const failureParams = {
      identity: issueMutationIdentity('caller-a', 'failure-1'),
      input: {
        conversationId: prepared.conversation.id,
        claimId: prepared.claimId,
        expectedRecordRevision: prepared.conversation.recordRevision,
        failure: 'launcher failed',
        occurredAt: 20
      }
    }
    const failed = repository.conversationAllocator.recordLaunchFailure(failureParams)
    const replayedFailure = repository.conversationAllocator.recordLaunchFailure(failureParams)

    expect(replayedFailure).toEqual(failed)
    expect(failed).toMatchObject({
      id: prepared.conversation.id,
      recordRevision: 1,
      launchFailure: { message: 'launcher failed', failedAt: 20 }
    })

    const retried = repository.conversationAllocator.prepareRetry({
      identity: issueMutationIdentity('caller-a', 'retry-1'),
      input: {
        conversationId: failed.id,
        expectedRecordRevision: failed.recordRevision,
        launchToken: token('retry-second'),
        now: 30
      }
    })

    expect(retried).toMatchObject({
      conversation: {
        id: prepared.conversation.id,
        recordRevision: failed.recordRevision + 1,
        launchFailure: null
      },
      disposition: 'retried'
    })
    expect(repository.conversationLaunchClaims.listForConversation(failed.id)).toHaveLength(2)
    expect(databaseSecretSurface(repository)).not.toContain(token('retry-second'))
    repository.close()
  })

  it('records launcher failure after a rename without overwriting live runtime evidence', () => {
    const repository = openRepository('failure-after-rename')
    const prepared = repository.conversationAllocator.prepareLaunch({
      identity: issueMutationIdentity('caller-a', 'rename-prepare'),
      input: launchInput(token('failure-after-rename'))
    })
    const renamed = repository.conversations.updateTitle({
      identity: issueMutationIdentity('caller-a', 'rename-before-failure'),
      input: {
        id: prepared.conversation.id,
        title: 'Named while starting',
        expectedRecordRevision: prepared.conversation.recordRevision
      }
    }).conversation

    const failed = repository.conversationAllocator.recordLaunchFailure({
      identity: issueMutationIdentity('caller-a', 'rename-failure'),
      input: {
        conversationId: prepared.conversation.id,
        claimId: prepared.claimId,
        expectedRecordRevision: prepared.conversation.recordRevision,
        failure: 'launcher failed after rename',
        occurredAt: 20
      }
    })

    expect(failed).toMatchObject({
      id: prepared.conversation.id,
      title: 'Named while starting',
      recordRevision: renamed.recordRevision + 1,
      launchFailure: { message: 'launcher failed after rename', failedAt: 20 }
    })

    const runtimeProtectedAllocator = new ConversationAllocator(
      repository.database,
      repository.conversations,
      repository.conversationIdentities,
      repository.conversationLaunchClaims,
      (conversationId) => conversationId === prepared.conversation.id
    )
    const retried = repository.conversationAllocator.prepareRetry({
      identity: issueMutationIdentity('caller-a', 'rename-retry'),
      input: {
        conversationId: failed.id,
        expectedRecordRevision: failed.recordRevision,
        launchToken: token('runtime-protected-failure'),
        now: 30
      }
    })
    expect(
      captureError(() =>
        runtimeProtectedAllocator.recordLaunchFailure({
          identity: issueMutationIdentity('caller-a', 'runtime-protected-failure'),
          input: {
            conversationId: retried.conversation.id,
            claimId: retried.claimId,
            expectedRecordRevision: retried.conversation.recordRevision,
            failure: 'must not overwrite live evidence',
            occurredAt: 40
          }
        })
      )
    ).toMatchObject({ code: 'conversation_resume_runtime_present' })
    expect(
      repository.conversationLaunchClaims.listForConversation(failed.id)[0]?.settlement
    ).toBeNull()
    expect(repository.conversations.get(failed.id)?.launchFailure).toBeNull()
    repository.close()
  })

  it('rejects retry after identity, Round, attachment, or a pending claim exists', () => {
    const repository = openRepository('retry-blockers')
    const pending = repository.conversationAllocator.prepareLaunch({
      identity: issueMutationIdentity('caller-a', 'pending'),
      input: launchInput(token('pending'))
    })
    expect(retryError(repository, pending.conversation.id, 0, 'pending-retry')).toMatchObject({
      code: 'conversation_retry_not_allowed',
      details: { blockers: { pendingClaim: true } }
    })

    const identityPrepared = repository.conversationAllocator.prepareLaunch({
      identity: issueMutationIdentity('caller-a', 'identity-prepare'),
      input: launchInput(token('identity'))
    })
    repository.conversationAllocator.attachProviderIdentity({
      executionHostId: 'local',
      workspaceRef: workspaceRef('worktree-1'),
      agent: 'codex',
      providerSession: providerSession('identity-session'),
      launchToken: token('identity'),
      observedAt: 10
    })
    expect(
      retryError(repository, identityPrepared.conversation.id, 0, 'identity-retry')
    ).toMatchObject({
      code: 'conversation_retry_not_allowed',
      details: { blockers: { identity: true } }
    })

    const roundPrepared = repository.conversationAllocator.prepareLaunch({
      identity: issueMutationIdentity('caller-a', 'round-prepare'),
      input: launchInput(token('round'))
    })
    const roundFailed = repository.conversationAllocator.recordLaunchFailure({
      identity: issueMutationIdentity('caller-a', 'round-failure'),
      input: {
        conversationId: roundPrepared.conversation.id,
        claimId: roundPrepared.claimId,
        expectedRecordRevision: roundPrepared.conversation.recordRevision,
        failure: 'failed before Round import',
        occurredAt: 30
      }
    })
    insertRound(repository, roundPrepared.conversation.id, 'round-blocker')
    expect(
      retryError(
        repository,
        roundPrepared.conversation.id,
        roundFailed.recordRevision,
        'round-retry'
      )
    ).toMatchObject({
      code: 'conversation_retry_not_allowed',
      details: { blockers: { round: true } }
    })

    const attachedPrepared = repository.conversationAllocator.prepareLaunch({
      identity: issueMutationIdentity('caller-a', 'attached-prepare'),
      input: launchInput(token('attached'), 'worktree-attached')
    })
    const attachedFailed = repository.conversationAllocator.recordLaunchFailure({
      identity: issueMutationIdentity('caller-a', 'attached-failure'),
      input: {
        conversationId: attachedPrepared.conversation.id,
        claimId: attachedPrepared.claimId,
        expectedRecordRevision: attachedPrepared.conversation.recordRevision,
        failure: 'failed but runtime appeared',
        occurredAt: 40
      }
    })
    const attachedAllocator = new ConversationAllocator(
      repository.database,
      repository.conversations,
      repository.conversationIdentities,
      repository.conversationLaunchClaims,
      (conversationId) => conversationId === attachedPrepared.conversation.id
    )
    expect(
      captureError(() =>
        attachedAllocator.prepareRetry({
          identity: issueMutationIdentity('caller-a', 'attached-retry'),
          input: {
            conversationId: attachedPrepared.conversation.id,
            expectedRecordRevision: attachedFailed.recordRevision,
            launchToken: token('attached-retry'),
            now: 50
          }
        })
      )
    ).toMatchObject({
      code: 'conversation_retry_not_allowed',
      details: { blockers: { runtimeEvidence: true } }
    })
    repository.close()
  })

  it('forgets only detached stopped facts and leaves the provider transcript intact', () => {
    const repository = openRepository('forget')
    const transcriptDirectory = mkdtempSync(join(tmpdir(), 'orca-issues-transcript-'))
    transcriptDirectories.push(transcriptDirectory)
    const transcriptPath = join(transcriptDirectory, 'session.jsonl')
    writeFileSync(transcriptPath, '{}\n')
    const launchToken = token('forget')
    const prepared = repository.conversationAllocator.prepareLaunch({
      identity: issueMutationIdentity('caller-a', 'prepare-forget'),
      input: launchInput(launchToken)
    })
    repository.conversationAllocator.attachProviderIdentity({
      executionHostId: 'local',
      workspaceRef: workspaceRef('worktree-1'),
      agent: 'codex',
      providerSession: {
        ...providerSession('forget-session'),
        transcriptPath
      },
      launchToken,
      observedAt: 10
    })

    const runtime = new MutableDeleteProbe()
    runtime.state = { attachmentGeneration: 1, attached: true, executionState: 'running' }
    const service = new ConversationForgetService(
      repository.database,
      repository.conversations,
      repository.conversationLaunchClaims,
      runtime,
      () => 100
    )
    expect(service.prepare(prepared.conversation.id)).toMatchObject({
      canDelete: false,
      blockers: expect.arrayContaining(['attached', 'running']),
      preflightToken: null
    })

    runtime.state = {
      attachmentGeneration: 3,
      attached: false,
      executionState: 'stopped'
    }
    const preflight = service.prepare(prepared.conversation.id)
    expect(preflight).toMatchObject({
      canDelete: true,
      identityCount: 1,
      hasTranscriptLocator: true,
      preflightToken: expect.any(String)
    })
    service.forget({
      identity: issueMutationIdentity('caller-a', 'forget-commit'),
      conversationId: prepared.conversation.id,
      expectedRecordRevision: preflight.conversation.recordRevision,
      preflightToken: preflight.preflightToken!
    })

    expect(repository.conversations.get(prepared.conversation.id)).toBeUndefined()
    expect(
      repository.database
        .prepare('SELECT COUNT(*) AS count FROM conversation_provider_identities')
        .get()
    ).toEqual({ count: 0 })
    expect(existsSync(transcriptPath)).toBe(true)
    repository.close()
  })

  it('rejects stale preflight and runtime changes with zero deletion or receipt', () => {
    const repository = openRepository('forget-guards')
    const prepared = repository.conversationAllocator.prepareLaunch({
      identity: issueMutationIdentity('caller-a', 'prepare-guarded-forget'),
      input: launchInput(token('guarded-forget'))
    })
    const failed = repository.conversationAllocator.recordLaunchFailure({
      identity: issueMutationIdentity('caller-a', 'fail-guarded-forget'),
      input: {
        conversationId: prepared.conversation.id,
        claimId: prepared.claimId,
        expectedRecordRevision: prepared.conversation.recordRevision,
        failure: 'launcher failed',
        occurredAt: 10
      }
    })
    const runtime = new MutableDeleteProbe()
    runtime.state = { attachmentGeneration: 1, attached: false, executionState: 'failed' }
    const service = new ConversationForgetService(
      repository.database,
      repository.conversations,
      repository.conversationLaunchClaims,
      runtime,
      () => 100
    )
    const stalePreflight = service.prepare(failed.id)
    expect(
      captureError(() =>
        service.forget({
          identity: issueMutationIdentity('caller-a', 'forget-stale'),
          conversationId: failed.id,
          expectedRecordRevision: failed.recordRevision + 1,
          preflightToken: stalePreflight.preflightToken!
        })
      )
    ).toMatchObject({ code: 'conversation_delete_preflight_invalid' })
    expect(receiptExists(repository, 'forget-stale')).toBe(false)

    const changedRuntimePreflight = service.prepare(failed.id)
    runtime.state = { attachmentGeneration: 2, attached: true, executionState: 'running' }
    expect(
      captureError(() =>
        service.forget({
          identity: issueMutationIdentity('caller-a', 'forget-runtime-changed'),
          conversationId: failed.id,
          expectedRecordRevision: failed.recordRevision,
          preflightToken: changedRuntimePreflight.preflightToken!
        })
      )
    ).toMatchObject({ code: 'conversation_delete_blocked' })
    expect(repository.conversations.get(failed.id)).toEqual(failed)
    expect(receiptExists(repository, 'forget-runtime-changed')).toBe(false)
    repository.close()
  })
})

class MutableDeleteProbe {
  state: ConversationRuntimeDeleteState = {
    attachmentGeneration: 0,
    attached: false,
    executionState: 'stopped'
  }

  getDeleteState(): ConversationRuntimeDeleteState {
    return this.state
  }
}

function openRepository(suffix: string): IssueRepository {
  return IssueRepository.open({
    profileId: 'profile-a',
    userDataPath: createIssueTestUserDataPath(`orca-issues-allocator-${suffix}`)
  })
}

function launchInput(launchToken: string, worktreeId = 'worktree-1') {
  return { ...conversationInput(worktreeId), launchToken, now: 1, claimTtlMs: 1_000 }
}

function conversationInput(worktreeId: string) {
  return {
    executionHostId: 'local' as const,
    workspaceRef: workspaceRef(worktreeId),
    workspaceSnapshot: { name: worktreeId, path: `/workspace/${worktreeId}` },
    agent: 'codex' as const,
    issueId: null
  }
}

function workspaceRef(worktreeId: string) {
  return { type: 'worktree' as const, worktreeId }
}

function providerSession(id: string) {
  return { key: 'session_id' as const, id }
}

function token(label: string): string {
  return `token-${label}-0123456789-abcdefghijklmnopqrstuvwxyz`
}

function databaseSecretSurface(repository: IssueRepository): string {
  const claims = repository.database
    .prepare('SELECT launch_token_hash FROM conversation_launch_claims')
    .all()
  const receipts = repository.database
    .prepare('SELECT payload_hash, result_json FROM issue_mutation_receipts')
    .all()
  return JSON.stringify({ claims, receipts })
}

function insertRound(repository: IssueRepository, conversationId: string, dedupeKey: string): void {
  repository.database
    .prepare(
      `INSERT INTO round_records (
         id, conversation_id, kind, waiting_reason, state_source, occurred_at, dedupe_key,
         user_input_preview, user_input_completeness,
         agent_output_preview, output_completeness,
         pending_question_preview, question_completeness,
         read_at, resolved_at, resolution, created_at
       ) VALUES (?, ?, 'completion', NULL, 'hook', 1, ?,
                 NULL, 'not-captured', NULL, 'not-captured', NULL, 'not-captured',
                 NULL, NULL, NULL, 1)`
    )
    .run(randomUUID(), conversationId, dedupeKey)
}

function retryError(
  repository: IssueRepository,
  conversationId: string,
  expectedRecordRevision: number,
  mutationId: string
): unknown {
  return captureError(() =>
    repository.conversationAllocator.prepareRetry({
      identity: issueMutationIdentity('caller-a', mutationId),
      input: {
        conversationId,
        expectedRecordRevision,
        launchToken: token(mutationId),
        now: 20
      }
    })
  )
}

function receiptExists(repository: IssueRepository, mutationId: string): boolean {
  return Boolean(
    repository.database
      .prepare('SELECT 1 FROM issue_mutation_receipts WHERE mutation_id = ?')
      .get(mutationId)
  )
}

function captureError(operation: () => unknown): unknown {
  try {
    operation()
  } catch (error) {
    return error
  }
  throw new Error('Expected operation to throw.')
}
