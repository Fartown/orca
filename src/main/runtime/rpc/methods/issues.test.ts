import { afterEach, describe, expect, it } from 'vitest'
import { ISSUE_METHOD_NAMES } from '../../../../shared/issues/runtime-rpc-schemas'
import type { ConversationLaunchPreparation } from '../../../../shared/issues/types'
import { ConversationRuntimeAttachmentRegistry } from '../../../issues/conversation-runtime-attachment-registry'
import {
  createIssueTestUserDataPath,
  removeIssueTestDirectories
} from '../../../issues/issue-database.test-environment'
import { issueFeatureReadinessRegistry } from '../../../issues/issue-feature-readiness'
import { IssueRepository } from '../../../issues/issue-repository'
import { IssueRuntimeService } from '../../../issues/issue-runtime-service'
import type { RpcContext, RpcMethod } from '../core'
import { ALL_RPC_METHODS } from './index'
import { ISSUE_METHODS } from './issues'

afterEach(() => {
  issueFeatureReadinessRegistry.setUnavailable('storage-open-failed')
  removeIssueTestDirectories()
})

describe('Issue runtime RPC manifest', () => {
  it('registers only the core method set and keeps status available without storage', () => {
    expect(ISSUE_METHODS.map((method) => method.name)).toEqual(ISSUE_METHOD_NAMES)
    expect(
      ALL_RPC_METHODS.filter((method) =>
        ISSUE_METHOD_NAMES.includes(method.name as (typeof ISSUE_METHOD_NAMES)[number])
      )
    ).toHaveLength(ISSUE_METHOD_NAMES.length)
    expect(ISSUE_METHODS.map((method) => method.name)).not.toEqual(
      expect.arrayContaining([
        'issues.search',
        'issues.listActivity',
        'issues.projectDashboardPanes',
        'issues.pendingForMobile',
        'issues.readRoundBody'
      ])
    )
    issueFeatureReadinessRegistry.setUnavailable('storage-migration-failed', 'ready')
    expect(call('issues.status', { authorityExecutionHostId: 'local' }, {})).toEqual({
      status: 'unavailable',
      storage: 'failed',
      hookEvidence: 'ready',
      reason: 'storage-migration-failed',
      authority: null
    })
  })

  it('rejects paired-runtime SSH selectors before dispatch', () => {
    expect(() =>
      call('issues.status', { authorityExecutionHostId: 'ssh:known' }, { clientKind: 'runtime' })
    ).toThrow(/second SSH hop/)
  })

  it('dispatches mutations with authenticated caller identity and no clear token response', () => {
    const repository = IssueRepository.open({
      profileId: 'profile-a',
      userDataPath: createIssueTestUserDataPath('orca-issues-rpc')
    })
    const runtimeService = new IssueRuntimeService(repository, {
      attachments: new ConversationRuntimeAttachmentRegistry()
    })
    const unregister = issueFeatureReadinessRegistry.register(runtimeService, 'ready')
    const launchToken = token('rpc')
    const result = call(
      'conversations.prepareLaunch',
      {
        authorityExecutionHostId: 'local',
        mutationId: 'rpc-launch',
        launchToken,
        workspaceRef: { type: 'worktree', worktreeId: 'worktree-1' },
        workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
        agent: 'codex',
        issueId: null
      },
      { authenticatedCallerFingerprint: 'paired-client-a' }
    ) as ConversationLaunchPreparation

    const failureParams = {
      authorityExecutionHostId: 'local',
      mutationId: 'rpc-launch-failure',
      conversationId: result.conversation.id,
      claimId: result.claimId,
      expectedRecordRevision: result.conversation.recordRevision,
      failure: 'launcher returned no startup plan'
    }
    const failed = call('conversations.recordLaunchFailure', failureParams, {
      authenticatedCallerFingerprint: 'paired-client-a'
    })
    const replayed = call('conversations.recordLaunchFailure', failureParams, {
      authenticatedCallerFingerprint: 'paired-client-a'
    })

    expect(JSON.stringify(result)).not.toContain(launchToken)
    expect(replayed).toEqual(failed)
    expect(repository.conversations.get(result.conversation.id)).toMatchObject({
      recordRevision: 1,
      launchFailure: { message: 'launcher returned no startup plan' }
    })
    expect(
      repository.database.prepare('SELECT caller_fingerprint FROM issue_mutation_receipts').get()
    ).toEqual({ caller_fingerprint: 'paired-client-a' })
    unregister()
    repository.close()
  })
})

function call(name: string, params: unknown, context: Partial<RpcContext>): unknown {
  const method = ISSUE_METHODS.find((candidate) => candidate.name === name) as RpcMethod | undefined
  if (!method) {
    throw new Error(`Missing method ${name}`)
  }
  const parsed = method.params ? method.params.parse(params) : undefined
  return method.handler(parsed, context as RpcContext)
}

function token(label: string): string {
  return `token-${label}-0123456789-abcdefghijklmnopqrstuvwxyz`
}
