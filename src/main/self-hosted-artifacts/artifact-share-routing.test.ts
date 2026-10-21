import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toSshExecutionHostId } from '../../shared/execution-host'
import { ARTIFACT_SHARE_RELAY_METHODS } from '../../shared/self-hosted-artifacts/artifact-share-contract'
import {
  ARTIFACT_SHARE_ERROR_CODES,
  ArtifactShareError
} from '../../shared/self-hosted-artifacts/artifact-share-errors'

const callRuntimeEnvironment = vi.fn()
let reachable = true

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
    runtimeEnvironment: () => ({
      userDataPath: '/tmp/user-data',
      call: callRuntimeEnvironment,
      isReachable: () => reachable
    })
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
  reachable = true
  callRuntimeEnvironment.mockReset()
})

describe('artifact share routing', () => {
  it('answers files on this computer locally', async () => {
    await expect(call('local')).resolves.toEqual({ value: 'local' })
    expect(callRuntimeEnvironment).not.toHaveBeenCalled()
  })

  it('never reads an unserved legacy SSH host locally', async () => {
    expect(await codeOf(call(toSshExecutionHostId('minizc')))).toBe(
      ARTIFACT_SHARE_ERROR_CODES.hostOutdated
    )
    expect(callRuntimeEnvironment).not.toHaveBeenCalled()
  })

  it('does not connect or request an out-of-contact runtime', async () => {
    reachable = false
    expect(await codeOf(call('runtime:env-1'))).toBe(ARTIFACT_SHARE_ERROR_CODES.hostUnreachable)
    expect(callRuntimeEnvironment).not.toHaveBeenCalled()
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
