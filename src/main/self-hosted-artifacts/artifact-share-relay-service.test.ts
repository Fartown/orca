import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MethodHandler } from '../../relay/dispatcher-contract'
import { ARTIFACT_SHARE_RELAY_METHODS } from '../../shared/self-hosted-artifacts/artifact-share-contract'
import { ARTIFACT_SHARE_ERROR_CODES } from '../../shared/self-hosted-artifacts/artifact-share-errors'
import { registerRelayArtifactShare } from './artifact-share-relay-service'
import { ARTIFACT_SHARE_HOME_ENV } from './store/artifact-share-store-layout'

let base: string
const handlers = new Map<string, MethodHandler>()

function invoke(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const handler = handlers.get(method)
  if (!handler) {
    throw new Error(`${method} is not registered`)
  }
  return handler(params, { clientId: 1, isStale: () => false })
}

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'orca-artifact-share-relay-')))
  vi.stubEnv(ARTIFACT_SHARE_HOME_ENV, join(base, 'share-home'))
  handlers.clear()
  registerRelayArtifactShare({
    onRequest: (method, handler) => {
      handlers.set(method, handler)
    }
  })
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(base, { recursive: true, force: true })
})

describe('relay artifact share service', () => {
  it('registers every question the asking computer routes here', () => {
    expect([...handlers.keys()].sort()).toEqual(Object.values(ARTIFACT_SHARE_RELAY_METHODS).sort())
  })

  it('reports that Orca is not open when no app on this host serves', async () => {
    await expect(invoke(ARTIFACT_SHARE_RELAY_METHODS.status)).resolves.toMatchObject({
      ok: true,
      value: { host: { executionHostId: 'local' }, service: { state: 'orca-not-running' } }
    })
  })

  it('answers lookups but refuses to share without the app, keeping the code', async () => {
    const workspace = join(base, 'octo')
    await mkdir(workspace)
    await writeFile(join(workspace, 'plan.md'), '# plan')
    const params = { workspaceRoot: workspace, sourcePath: join(workspace, 'plan.md') }

    await expect(invoke(ARTIFACT_SHARE_RELAY_METHODS.lookup, params)).resolves.toMatchObject({
      ok: true,
      value: { file: { workspace: null, rootPath: workspace, relativePath: 'plan.md' } }
    })
    await expect(invoke(ARTIFACT_SHARE_RELAY_METHODS.share, params)).resolves.toMatchObject({
      ok: false,
      code: ARTIFACT_SHARE_ERROR_CODES.orcaNotRunning
    })
  })

  it('returns malformed requests as envelopes instead of throwing across the relay', async () => {
    await expect(
      invoke(ARTIFACT_SHARE_RELAY_METHODS.stopWorkspace, { token: 'short' })
    ).resolves.toMatchObject({ ok: false, code: 'runtime_error' })
  })
})
