import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toSshExecutionHostId } from '../../shared/execution-host'
import { ARTIFACT_SHARE_RELAY_METHODS } from '../../shared/self-hosted-artifacts/artifact-share-contract'
import {
  ARTIFACT_SHARE_ERROR_CODES,
  ArtifactShareError
} from '../../shared/self-hosted-artifacts/artifact-share-errors'

const { getActiveMultiplexer } = vi.hoisted(() => ({ getActiveMultiplexer: vi.fn() }))
const callRuntimeEnvironment = vi.fn()

vi.mock('../ssh/ssh-target-registry', () => ({
  getActiveMultiplexer,
  listRegisteredSshTargets: () => [{ id: 'minizc', label: 'Mac mini' }]
}))

const { routeArtifactShareCall } = await import('./artifact-share-routing')

const Result = z.object({ value: z.string() })

function call(executionHostId: string, context = {}) {
  return routeArtifactShareCall({
    executionHostId,
    method: ARTIFACT_SHARE_RELAY_METHODS.lookup,
    params: { sourcePath: '/Users/me/octo/plan.md' },
    resultSchema: Result,
    local: async () => ({ value: 'local' }),
    context,
    runtimeEnvironment: () => ({ userDataPath: '/tmp/user-data', call: callRuntimeEnvironment })
  })
}

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught
  )
  return error instanceof ArtifactShareError ? error.code : null
}

beforeEach(() => {
  getActiveMultiplexer.mockReset()
  callRuntimeEnvironment.mockReset()
})

describe('artifact share routing', () => {
  it('answers files on this computer locally', async () => {
    await expect(call('local')).resolves.toEqual({ value: 'local' })
    expect(getActiveMultiplexer).not.toHaveBeenCalled()
  })

  it('asks the SSH host that owns the file and unwraps its envelope', async () => {
    const request = vi.fn(async () => ({ ok: true, value: { value: 'remote' } }))
    getActiveMultiplexer.mockReturnValue({ request })

    await expect(call(toSshExecutionHostId('minizc'))).resolves.toEqual({ value: 'remote' })
    expect(request).toHaveBeenCalledWith(
      ARTIFACT_SHARE_RELAY_METHODS.lookup,
      { sourcePath: '/Users/me/octo/plan.md' },
      { timeoutMs: expect.any(Number) }
    )
  })

  it('keeps the owner error code across the relay', async () => {
    getActiveMultiplexer.mockReturnValue({
      request: async () => ({
        ok: false,
        code: ARTIFACT_SHARE_ERROR_CODES.orcaNotRunning,
        message: "Orca isn't open on minizc."
      })
    })

    expect(await codeOf(call(toSshExecutionHostId('minizc')))).toBe(
      ARTIFACT_SHARE_ERROR_CODES.orcaNotRunning
    )
  })

  it('never answers for a disconnected or outdated SSH host locally', async () => {
    getActiveMultiplexer.mockReturnValue(undefined)
    expect(await codeOf(call(toSshExecutionHostId('minizc')))).toBe(
      ARTIFACT_SHARE_ERROR_CODES.hostUnreachable
    )

    getActiveMultiplexer.mockReturnValue({
      request: async () => {
        throw Object.assign(new Error('Method not found'), { code: -32601 })
      }
    })
    expect(await codeOf(call(toSshExecutionHostId('minizc')))).toBe(
      ARTIFACT_SHARE_ERROR_CODES.hostOutdated
    )

    getActiveMultiplexer.mockReturnValue({
      request: async () => {
        throw new Error('channel closed')
      }
    })
    expect(await codeOf(call(toSshExecutionHostId('minizc')))).toBe(
      ARTIFACT_SHARE_ERROR_CODES.hostUnreachable
    )
  })

  it('asks a paired Orca as its own local computer', async () => {
    callRuntimeEnvironment.mockResolvedValue({ ok: true, result: { value: 'paired' } })

    await expect(call('runtime:env-1')).resolves.toEqual({ value: 'paired' })
    expect(callRuntimeEnvironment).toHaveBeenCalledWith(
      '/tmp/user-data',
      'env-1',
      ARTIFACT_SHARE_RELAY_METHODS.lookup,
      { sourcePath: '/Users/me/octo/plan.md', executionHostId: 'local' },
      expect.any(Number)
    )

    callRuntimeEnvironment.mockResolvedValue({
      ok: false,
      error: { code: 'method_not_found', message: 'nope' }
    })
    expect(await codeOf(call('runtime:env-1'))).toBe(ARTIFACT_SHARE_ERROR_CODES.hostOutdated)

    callRuntimeEnvironment.mockResolvedValue({
      ok: false,
      error: { code: ARTIFACT_SHARE_ERROR_CODES.sharingDisabled, message: 'off' }
    })
    expect(await codeOf(call('runtime:env-1'))).toBe(ARTIFACT_SHARE_ERROR_CODES.sharingDisabled)
  })

  it('refuses unknown computers and a second remote hop from a paired caller', async () => {
    expect(await codeOf(call('nonsense'))).toBe(ARTIFACT_SHARE_ERROR_CODES.unsupportedHost)
    expect(
      await codeOf(
        call(toSshExecutionHostId('minizc'), { clientKind: 'runtime', pairedDeviceId: 'phone' })
      )
    ).toBe(ARTIFACT_SHARE_ERROR_CODES.unsupportedHost)
  })
})
