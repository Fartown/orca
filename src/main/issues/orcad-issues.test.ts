import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { startOrcadIssues } from './orcad-issues'
import { issueFeatureReadinessRegistry } from './issue-feature-readiness'

const state = vi.hoisted(() => ({ root: '', hooks: true }))
vi.mock('../../shared/app-environment', () => ({
  getAppEnvironment: () => ({ getPath: () => state.root })
}))
vi.mock('../orca-profiles/profile-index-store', () => ({
  ensureActiveOrcaProfile: () => ({ profile: { id: 'orcad-test', name: 'SSH owner' } })
}))
vi.mock('../agent-hooks/managed-agent-hook-controls', () => ({
  isAgentStatusHooksEnabled: () => state.hooks
}))
vi.mock('../agent-hooks/server', () => ({
  agentHookServer: {
    buildPtyEnv: () => ({ ORCA_HOOK_PORT: '1234' }),
    subscribeProviderSessionChanges: () => () => {},
    subscribeEnrichedStatus: () => () => {},
    subscribePaneStatusClear: () => () => {},
    subscribeStatusChanges: () => () => {},
    getHydratedAuthorityCommitments: () => [],
    getCurrentAuthorityObservations: () => [],
    getStatusSnapshot: () => [],
    getProviderSessionIdentities: () => []
  }
}))
vi.mock('../ipc/ai-vault-session-title-routing', () => ({
  resolveAiVaultSessionTitlesByHost: async () => ({ titles: [] })
}))
let stop: (() => void) | undefined
afterEach(async () => {
  stop?.()
  if (state.root) {
    await rm(state.root, { recursive: true, force: true })
  }
})
it.each([true, false])(
  'opens host storage with hook availability %s and disposes it',
  async (hooks) => {
    state.root = await mkdtemp(join(tmpdir(), 'orcad-issues-'))
    state.hooks = hooks
    stop = await startOrcadIssues(
      { getTerminalWorktreeIdForPaneKey: () => null },
      {
        getFolderWorkspace: () => undefined,
        getSshTarget: () => undefined,
        getSettings: () => ({})
      }
    )
    expect(issueFeatureReadinessRegistry.status('local')).toMatchObject({
      status: hooks ? 'ready' : 'degraded',
      storage: 'ready',
      hookEvidence: hooks ? 'ready' : 'disabled',
      authority: { profileLabel: 'SSH owner' }
    })
    stop()
    expect(issueFeatureReadinessRegistry.status('local').storage).toBe('failed')
  }
)
