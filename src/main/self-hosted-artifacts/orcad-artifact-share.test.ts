import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { startOrcadArtifactShare } from './orcad-artifact-share'
import { requireArtifactShareRuntime } from './artifact-share-runtime-registry'
import { ARTIFACT_SHARE_HOME_ENV } from './store/artifact-share-store-layout'

vi.mock('../../shared/app-environment', () => ({
  getAppEnvironment: () => ({ getPath: () => process.env.ORCA_ARTIFACT_SHARE_HOME })
}))
let base: string
let stop: () => Promise<void>
beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'orca-artifact-orcad-')))
  vi.stubEnv(ARTIFACT_SHARE_HOME_ENV, join(base, 'shares'))
  stop = startOrcadArtifactShare({
    getSettings: () => ({ artifactSharingEnabled: false }),
    onSettingsChanged: () => undefined
  })
})
afterEach(async () => {
  await stop()
  vi.unstubAllEnvs()
  await rm(base, { recursive: true, force: true })
})

it('answers from the SSH runtime’s filesystem while sharing is disabled', async () => {
  const root = join(base, 'workspace')
  await mkdir(root)
  const sourcePath = join(root, 'plan.md')
  await writeFile(sourcePath, '# plan')
  const runtime = requireArtifactShareRuntime()
  expect(await runtime.owner.status()).toMatchObject({
    host: { executionHostId: 'local' },
    service: { state: 'sharing-off' }
  })
  expect(await runtime.owner.lookup({ workspaceRoot: root, sourcePath })).toMatchObject({
    file: { rootPath: root, relativePath: 'plan.md' }
  })
  await expect(runtime.owner.share({ workspaceRoot: root, sourcePath })).rejects.toThrow()
  await stop()
  expect(() => requireArtifactShareRuntime()).toThrow()
})

it('never forwards the owner’s paths to a second remote host', async () => {
  const runtime = requireArtifactShareRuntime()
  expect(runtime.isEnvironmentReachable('other')).toBe(false)
  await expect(
    runtime.callRuntimeEnvironment(base, 'other', 'artifactShare.share', {})
  ).rejects.toThrow('Orca Server connection')
})
