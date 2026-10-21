import { getDefaultSettings } from '../../shared/constants'
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startGoals } from './orcad-goals'
import { goalFeatureReadinessRegistry } from '../runtime/rpc/methods/goals'

vi.mock('../agent-hooks/server', () => ({
  agentHookServer: {
    buildPtyEnv: () => ({ ORCA_AGENT_HOOK_PORT: '1' }),
    getStatusSnapshotForPane: () => []
  }
}))
vi.mock('../../shared/app-environment', () => ({
  getAppEnvironment: () => ({ getPath: () => process.env.ORCA_GOAL_HOME })
}))
let root: string | undefined
let stop: (() => void) | undefined
afterEach(async () => {
  stop?.()
  vi.unstubAllEnvs()
  if (root) {await rm(root, { recursive: true, force: true })}
})

it('starts the host Goal store and cleans up readiness without a client relay callback', async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-goals-host-'))
  vi.stubEnv('ORCA_GOAL_HOME', join(root, 'goals'))
  vi.stubEnv('ORCA_GOAL_DRIVER_PATH', root)
  await writeFile(join(root, 'goal-driver.js'), '')
  const showTerminal = vi.fn(async () => {
    throw new Error('No terminal lookup is needed to list drafts')
  })
  stop = startGoals(
    { showTerminal, showManagedWorktree: vi.fn() },
    {
      getSettings: () => getDefaultSettings('/workspace'),
      getFolderWorkspaces: () => [],
      getRepos: () => [],
      getProjectGroups: () => []
    }
  )
  expect(goalFeatureReadinessRegistry.status()).toMatchObject({ status: 'ready' })
  expect(await goalFeatureReadinessRegistry.requireService().editorDrafts.list()).toEqual({
    items: []
  })
  expect(showTerminal).not.toHaveBeenCalled()
  stop()
  expect(goalFeatureReadinessRegistry.status()).toMatchObject({
    status: 'unavailable',
    reason: 'service-stopped'
  })
})
