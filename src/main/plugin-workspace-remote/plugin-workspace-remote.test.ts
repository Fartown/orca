import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { pluginRuntimeDelegate, readPluginWorkspaceChange } from '../plugins/plugin-runtime-binding'
import { executePluginHostCall } from '../plugins/workers/plugin-host-methods'
import type { PluginRuntimeDelegate } from '../plugins/workers/plugin-host-service-bindings'
import { bindPluginHostServices } from '../plugins/workers/plugin-host-service-bindings'
import type { PluginRuntimeRpc } from '../plugins/workers/plugin-host-workspace-method-bindings'

const RECORDED = {
  remoteName: 'origin',
  remoteUrl: 'https://bot:secret@code.example.test/team/app.git',
  canonicalKey: 'code.example.test/team/app'
}
const PUBLISHED = { name: 'origin', url: 'https://code.example.test/team/app.git' }

function runtime(repos: { id: string; gitRemoteIdentity: typeof RECORDED | null }[]) {
  return {
    resolveActiveWorktreeContext: vi.fn(async () => ({
      worktreeId: 'repo-1::/srv/app',
      path: '/srv/app',
      branch: 'refs/heads/feature/review',
      displayName: 'app'
    })),
    listTerminals: vi.fn(async () => ({ terminals: [] })),
    sendTerminal: vi.fn(),
    dispatchPluginNotification: vi.fn(),
    listVisibleRepos: () => repos
  }
}

function hostCall(
  method: string,
  services: Parameters<typeof executePluginHostCall>[0]['services']
): ReturnType<typeof executePluginHostCall> {
  return executePluginHostCall({
    pluginId: 'acme.mod',
    method,
    params: undefined,
    surface: 'worker',
    grantedCapabilities: ['workspace:read'],
    services,
    audit: { record: vi.fn().mockResolvedValue(undefined) }
  })
}

function readContext(delegate: PluginRuntimeDelegate): ReturnType<typeof executePluginHostCall> {
  return hostCall(
    'workspace.readContext',
    bindPluginHostServices({ delegate, pluginsDataDir: join(tmpdir(), 'plugin-workspace-remote') })
  )
}

describe('plugin workspace remote', () => {
  it('gives readContext and workspace.changed the focused repository remote without credentials', async () => {
    const delegate = pluginRuntimeDelegate(
      runtime([
        { id: 'repo-0', gitRemoteIdentity: { ...RECORDED, remoteUrl: 'git@host:team/other.git' } },
        { id: 'repo-1', gitRemoteIdentity: RECORDED }
      ]),
      () => []
    )

    await expect(readContext(delegate)).resolves.toEqual({
      ok: true,
      value: { branch: 'feature/review', displayName: 'app', terminals: [], remote: PUBLISHED }
    })
    await expect(readPluginWorkspaceChange(delegate)).resolves.toEqual({
      context: { branch: 'feature/review', displayName: 'app', terminals: [], remote: PUBLISHED }
    })
  })

  it('leaves the field out when the repository has no recorded remote', async () => {
    const delegate = pluginRuntimeDelegate(
      runtime([{ id: 'repo-1', gitRemoteIdentity: null }]),
      () => []
    )
    await expect(readContext(delegate)).resolves.toEqual({
      ok: true,
      value: { branch: 'feature/review', displayName: 'app', terminals: [] }
    })
  })

  it('gives each workspace.list worktree the remote of its own repository', async () => {
    const answers: Record<string, unknown> = {
      'worktree.list': {
        worktrees: [
          { id: 'repo-1::/srv/app', repoId: 'repo-1', displayName: 'app', path: '/srv/app' },
          { id: 'repo-2::/srv/notes', repoId: 'repo-2', displayName: 'notes', path: '/srv/notes' }
        ],
        totalCount: 2
      },
      'repo.list': {
        repos: [
          { id: 'repo-1', kind: 'git', gitRemoteIdentity: RECORDED },
          { id: 'repo-2', kind: 'git' }
        ]
      },
      'folderWorkspace.list': { folderWorkspaces: [] }
    }
    const runtimeRpc: PluginRuntimeRpc = async (method) => answers[method]
    const delegate = pluginRuntimeDelegate(runtime([]), () => [], runtimeRpc)
    const services = bindPluginHostServices({
      delegate,
      pluginsDataDir: join(tmpdir(), 'plugin-workspace-remote')
    })

    const outcome = await hostCall('workspace.list', services)

    expect(outcome).toMatchObject({
      ok: true,
      value: {
        workspaces: [{ id: 'repo-1::/srv/app', remote: PUBLISHED }, { id: 'repo-2::/srv/notes' }]
      }
    })
    expect(outcome.ok && outcome.value).not.toHaveProperty(['workspaces', 1, 'remote'])
  })
})
