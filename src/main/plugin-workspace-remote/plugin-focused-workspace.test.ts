import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PluginFocusedWorkspace } from '../../shared/plugin-workspace-remote/plugin-workspace-remote'
import type { PluginViewRequestBody } from '../../shared/plugins/view/plugin-view-protocol'
import { pluginRuntimeDelegate, readPluginWorkspaceChange } from '../plugins/plugin-runtime-binding'
import {
  getPluginHostRendererActions,
  setPluginHostRendererRequest,
  type PluginHostRendererActions
} from '../plugins/view/plugin-host-renderer-actions'
import { pluginViewReplySchema } from '../plugins/view/plugin-view-reply-schema'
import { executePluginHostCall } from '../plugins/workers/plugin-host-methods'
import { bindPluginHostServices } from '../plugins/workers/plugin-host-service-bindings'

const FOCUSED: PluginFocusedWorkspace = {
  worktreeId: 'repo-9::/home/dev/app',
  branch: 'refs/heads/feature/review',
  displayName: 'app',
  remote: { name: 'origin', url: 'https://code.example.test/team/app.git' }
}
const CONTEXT = {
  branch: 'feature/review',
  displayName: 'app',
  terminals: [],
  remote: FOCUSED.remote
}

afterEach(() => setPluginHostRendererRequest(null))

function windowWith(
  readFocusedWorkspace: PluginHostRendererActions['readFocusedWorkspace']
): PluginHostRendererActions {
  return {
    openFile: vi.fn(),
    runAction: vi.fn(),
    openFolderWorkspace: vi.fn(),
    readFocusedWorkspace
  }
}

/** Main's runtime owns no focused workspace; the hook server still reports an agent there. */
function hostWithoutLocalFocus() {
  const listTerminals = vi.fn(async () => ({ terminals: [] }))
  const delegate = pluginRuntimeDelegate(
    {
      resolveActiveWorktreeContext: async () => null,
      listTerminals,
      sendTerminal: vi.fn(),
      dispatchPluginNotification: vi.fn(),
      listVisibleRepos: () => []
    },
    () => [{ paneKey: 't:l', worktreeId: FOCUSED.worktreeId, state: 'working', stateStartedAt: 1 }]
  )
  return { delegate, listTerminals }
}

function call(
  method: string,
  params: unknown,
  window: PluginHostRendererActions | null
): ReturnType<typeof executePluginHostCall> {
  const { delegate } = hostWithoutLocalFocus()
  return executePluginHostCall({
    pluginId: 'acme.mod',
    method,
    params,
    surface: 'worker',
    grantedCapabilities: ['workspace:read', 'agent:read', 'terminal:send'],
    services: bindPluginHostServices({
      delegate,
      pluginsDataDir: join(tmpdir(), 'plugin-focused-workspace'),
      renderer: window
    }),
    audit: { record: vi.fn().mockResolvedValue(undefined) }
  })
}

describe('a focused workspace main runtime does not own', () => {
  it('reads it from the window for readContext and workspace.changed, without terminals', async () => {
    const window = windowWith(async () => FOCUSED)
    const { delegate, listTerminals } = hostWithoutLocalFocus()

    await expect(call('workspace.readContext', undefined, window)).resolves.toEqual({
      ok: true,
      value: CONTEXT
    })
    await expect(readPluginWorkspaceChange(delegate, window)).resolves.toEqual({
      context: CONTEXT
    })
    expect(listTerminals).not.toHaveBeenCalled()
  })

  it('leaves agents.list and terminal.sendText as they were', async () => {
    const window = windowWith(async () => FOCUSED)
    await expect(call('agents.list', {}, window)).resolves.toEqual({
      ok: true,
      value: { agents: [] }
    })
    await expect(
      call('terminal.sendText', { terminalId: 'term-1', text: 'ls' }, window)
    ).resolves.toMatchObject({ ok: false })
  })

  it.each([
    ['no window', null],
    ['a window focusing no worktree', windowWith(async () => null)],
    [
      'a window that fails to answer',
      windowWith(async () => {
        throw new Error('gone')
      })
    ],
    ['an older window', windowWith(undefined)]
  ])('keeps the context null with %s', async (_name, window) => {
    await expect(call('workspace.readContext', undefined, window)).resolves.toEqual({
      ok: true,
      value: null
    })
    await expect(
      readPluginWorkspaceChange(hostWithoutLocalFocus().delegate, window)
    ).resolves.toEqual({ context: null })
  })

  it('carries the window answer through the reply check main applies', async () => {
    const asked: PluginViewRequestBody[] = []
    setPluginHostRendererRequest(async (body) => {
      asked.push(body)
      return pluginViewReplySchema.parse({ requestId: 'r', ok: true, workspace: FOCUSED })
    })
    await expect(getPluginHostRendererActions()?.readFocusedWorkspace?.()).resolves.toEqual(FOCUSED)
    expect(asked).toEqual([{ kind: 'read-focused-workspace' }])
    expect(() =>
      pluginViewReplySchema.parse({
        requestId: 'r',
        ok: true,
        workspace: { ...FOCUSED, path: '/home/dev/app' }
      })
    ).toThrow()
  })
})
