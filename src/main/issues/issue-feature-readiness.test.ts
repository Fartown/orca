import { describe, expect, it } from 'vitest'
import { IssueFeatureReadinessRegistry } from './issue-feature-readiness'

const authority = {
  authorityId: '11111111-1111-4111-8111-111111111111',
  hostPartitionKey: 'local' as const,
  authorityExecutionHostId: 'local' as const,
  profileLabel: 'Default'
}

describe('IssueFeatureReadinessRegistry', () => {
  it('keeps status readable when storage construction fails', () => {
    const registry = new IssueFeatureReadinessRegistry()
    registry.setUnavailable('storage-migration-failed')

    expect(registry.status('local')).toEqual({
      status: 'unavailable',
      storage: 'failed',
      hookEvidence: 'failed',
      reason: 'storage-migration-failed',
      authority: null
    })
    expect(captureError(() => registry.requireService())).toMatchObject({
      code: 'issue_feature_unavailable'
    })
  })

  it('separates degraded hook evidence from protocol and storage support', () => {
    const registry = new IssueFeatureReadinessRegistry()
    const service = { authorityDescriptor: () => authority }
    const unregister = registry.register(service, 'disabled')

    expect(registry.status('local')).toMatchObject({
      status: 'degraded',
      storage: 'ready',
      hookEvidence: 'disabled',
      reason: 'hook-disabled',
      authority
    })
    expect(registry.requireService()).toBe(service)
    unregister()
    expect(registry.status('local').status).toBe('unavailable')
  })
})

function captureError(operation: () => unknown): unknown {
  try {
    operation()
  } catch (error) {
    return error
  }
  throw new Error('Expected operation to throw.')
}
