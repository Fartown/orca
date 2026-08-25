import { beforeEach, describe, expect, it, vi } from 'vitest'

const { callRuntimeRpc, runtimeEnvironmentSupportsCapability } = vi.hoisted(() => ({
  callRuntimeRpc: vi.fn(),
  runtimeEnvironmentSupportsCapability: vi.fn()
}))

vi.mock('../runtime/runtime-rpc-client', () => ({
  callRuntimeRpc,
  runtimeEnvironmentSupportsCapability
}))

import {
  IssueRuntimeClient,
  IssueRuntimeUnsupportedError,
  resolveIssueRuntimeRoute
} from './issue-runtime-client'

beforeEach(() => {
  callRuntimeRpc.mockReset()
  runtimeEnvironmentSupportsCapability.mockReset()
  runtimeEnvironmentSupportsCapability.mockResolvedValue(true)
})

describe('IssueRuntimeClient', () => {
  it('maps runtime routes to the remote local authority without persisting the alias', async () => {
    callRuntimeRpc.mockResolvedValue(statusResult('local'))
    const client = IssueRuntimeClient.forRoute('runtime:environment-1')

    await expect(client.status()).resolves.toMatchObject({ status: 'ready' })
    expect(runtimeEnvironmentSupportsCapability).toHaveBeenCalledWith(
      'environment-1',
      'orca-issues.v1'
    )
    expect(callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'environment-1' },
      'issues.status',
      { authorityExecutionHostId: 'local' }
    )
    expect(JSON.stringify(callRuntimeRpc.mock.calls)).not.toContain('runtime:environment-1')
  })

  it('keeps direct SSH as a local transport with an SSH authority selector', () => {
    expect(resolveIssueRuntimeRoute('ssh:build-box')).toEqual({
      routeExecutionHostId: 'ssh:build-box',
      target: { kind: 'local' },
      authorityExecutionHostId: 'ssh:build-box'
    })
  })

  it('fails unsupported remote routes before sending Issue methods', async () => {
    runtimeEnvironmentSupportsCapability.mockResolvedValue(false)
    const client = IssueRuntimeClient.forRoute('runtime:legacy')

    await expect(client.status()).rejects.toBeInstanceOf(IssueRuntimeUnsupportedError)
    expect(callRuntimeRpc).not.toHaveBeenCalled()
  })

  it('rejects an authority descriptor that does not match the client route mapping', async () => {
    callRuntimeRpc.mockResolvedValue(statusResult('ssh:other'))
    const client = IssueRuntimeClient.forRoute('local')

    await expect(client.status()).rejects.toThrow('issue_authority_route_mismatch')
  })
})

function statusResult(authorityExecutionHostId: 'local' | `ssh:${string}`) {
  return {
    status: 'ready',
    storage: 'ready',
    hookEvidence: 'ready',
    reason: null,
    authority: {
      authorityId: '11111111-1111-4111-8111-111111111111',
      hostPartitionKey: authorityExecutionHostId,
      authorityExecutionHostId
    }
  }
}
