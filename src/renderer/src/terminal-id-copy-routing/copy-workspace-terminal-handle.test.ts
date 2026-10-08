import { beforeEach, describe, expect, it, vi } from 'vitest'
import { copyWorkspaceTerminalHandle } from './copy-workspace-terminal-handle'
import { replaceRuntimeEnvironmentRevisions } from '@/runtime/runtime-environment-revision'
import type { ExecutionHostId } from '../../../shared/execution-host'

const { getState, localCall, remoteCall, writeClipboardText } = vi.hoisted(() => ({
  getState: vi.fn(),
  localCall: vi.fn(),
  remoteCall: vi.fn(),
  writeClipboardText: vi.fn()
}))
vi.mock('@/store', () => ({ useAppStore: { getState } }))

const worktreeId = 'repo::/workspace'
const tabId = 'tab'
const leafId = '11111111-1111-4111-8111-111111111111'
const request = {
  method: 'terminal.resolvePane',
  params: { paneKey: `${tabId}:${leafId}`, worktreeId }
}
const success = {
  id: 'request',
  ok: true,
  result: { terminal: { handle: 'term_remote' } },
  _meta: { runtimeId: 'host-runtime' }
}

function state(hostId: ExecutionHostId = 'local', runtimeOwnerEnvironmentId?: string) {
  return {
    repos: [{ id: 'repo', executionHostId: hostId }],
    worktreesByRepo: {
      repo: [{ id: worktreeId, repoId: 'repo', hostId, runtimeOwnerEnvironmentId }]
    },
    runtimeEnvironments: [{ id: 'mini', createdAt: 1 }],
    runtimeEnvironmentCatalogHydrated: true,
    settings: { activeRuntimeEnvironmentId: 'other-host' },
    runtimeStatusByEnvironmentId: new Map([
      [
        'mini',
        {
          status: null,
          checkedAt: 1,
          snapshot: {
            environmentId: 'mini',
            pairingRevision: 7,
            sequence: 1,
            checkedAt: 1,
            status: null,
            verification: 'unavailable',
            transport: 'ready'
          }
        }
      ]
    ]),
    sshConnectionStates: new Map([['ssh-target', { status: 'connected' }]]),
    sshStateByEnvironment: new Map([
      [
        'mini',
        {
          targetsHydrated: true,
          connectionStates: new Map([['ssh-target', { status: 'connected' }]])
        }
      ]
    ])
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getState.mockReturnValue(state())
  localCall.mockResolvedValue({ ...success, result: { terminal: { handle: 'term_local' } } })
  remoteCall.mockResolvedValue(success)
  writeClipboardText.mockResolvedValue(undefined)
  vi.stubGlobal('window', {
    api: {
      runtime: { call: localCall },
      runtimeEnvironments: { call: remoteCall },
      ui: { writeTerminalClipboardText: writeClipboardText }
    }
  })
  replaceRuntimeEnvironmentRevisions([{ id: 'mini', createdAt: 1, pairingRevision: 7 }])
})

describe('copyWorkspaceTerminalHandle', () => {
  it('keeps local terminals local despite another focused runtime', async () => {
    await expect(copyWorkspaceTerminalHandle(worktreeId, tabId, leafId)).resolves.toBe('term_local')
    expect(localCall).toHaveBeenCalledExactlyOnceWith(request)
    expect(remoteCall).not.toHaveBeenCalled()
    expect(writeClipboardText).toHaveBeenCalledExactlyOnceWith('term_local')
  })

  it('queries the paired owner and writes its ID on the client', async () => {
    getState.mockReturnValue(state('runtime:mini'))
    await expect(copyWorkspaceTerminalHandle(worktreeId, tabId, leafId)).resolves.toBe(
      'term_remote'
    )
    expect(remoteCall).toHaveBeenCalledExactlyOnceWith({
      ...request,
      selector: 'mini',
      expectedEnvironmentPairingRevision: 7
    })
    expect(localCall).not.toHaveBeenCalled()
    expect(writeClipboardText).toHaveBeenCalledExactlyOnceWith('term_remote')
  })

  it('resolves the host pane identity of a mirrored tab', async () => {
    getState.mockReturnValue(state('runtime:mini'))
    await copyWorkspaceTerminalHandle(worktreeId, 'web-terminal-tab', leafId)
    expect(remoteCall).toHaveBeenCalledExactlyOnceWith({
      ...request,
      selector: 'mini',
      expectedEnvironmentPairingRevision: 7
    })
  })

  it('keeps a direct SSH terminal on its controlling local runtime', async () => {
    getState.mockReturnValue(state('ssh:ssh-target'))
    await copyWorkspaceTerminalHandle(worktreeId, tabId, leafId)
    expect(localCall).toHaveBeenCalledExactlyOnceWith(request)
    expect(remoteCall).not.toHaveBeenCalled()
  })

  it('routes paired-host SSH terminals through that paired runtime', async () => {
    getState.mockReturnValue(state('ssh:ssh-target', 'mini'))
    await copyWorkspaceTerminalHandle(worktreeId, tabId, leafId)
    expect(remoteCall).toHaveBeenCalledExactlyOnceWith({
      ...request,
      selector: 'mini',
      expectedEnvironmentPairingRevision: 7
    })
    expect(localCall).not.toHaveBeenCalled()
  })

  it.each(['local', 'runtime:mini'] as const)(
    'supports %s folder workspaces',
    async (executionHostId) => {
      getState.mockReturnValue({
        ...state(),
        folderWorkspaces: [{ id: 'folder', executionHostId }]
      })
      await copyWorkspaceTerminalHandle('folder:folder', tabId, leafId)
      const expected = { ...request, params: { ...request.params, worktreeId: 'folder:folder' } }
      if (executionHostId === 'local') {
        expect(localCall).toHaveBeenCalledExactlyOnceWith(expected)
        expect(remoteCall).not.toHaveBeenCalled()
      } else {
        expect(remoteCall).toHaveBeenCalledExactlyOnceWith({
          ...expected,
          selector: 'mini',
          expectedEnvironmentPairingRevision: 7
        })
        expect(localCall).not.toHaveBeenCalled()
      }
    }
  )

  it('does not read a paired runtime out of contact', async () => {
    getState.mockReturnValue({ ...state('runtime:mini'), runtimeStatusByEnvironmentId: new Map() })
    await expect(copyWorkspaceTerminalHandle(worktreeId, tabId, leafId)).rejects.toThrow(
      'Terminal host unavailable'
    )
    expect(localCall).not.toHaveBeenCalled()
    expect(remoteCall).not.toHaveBeenCalled()
    expect(writeClipboardText).not.toHaveBeenCalled()
  })

  it.each([undefined, 'mini'])(
    'does not read a disconnected SSH host through %s',
    async (owner) => {
      getState.mockReturnValue({
        ...state('ssh:ssh-target', owner),
        sshConnectionStates: new Map(),
        sshStateByEnvironment: new Map()
      })
      await expect(copyWorkspaceTerminalHandle(worktreeId, tabId, leafId)).rejects.toThrow(
        'Terminal SSH host unavailable'
      )
      expect(localCall).not.toHaveBeenCalled()
      expect(remoteCall).not.toHaveBeenCalled()
      expect(writeClipboardText).not.toHaveBeenCalled()
    }
  )

  it('rejects an unresolved workspace owner', async () => {
    await expect(copyWorkspaceTerminalHandle('unknown::/workspace', tabId, leafId)).rejects.toThrow(
      'Terminal owner unavailable'
    )
    expect(localCall).not.toHaveBeenCalled()
    expect(remoteCall).not.toHaveBeenCalled()
    expect(writeClipboardText).not.toHaveBeenCalled()
  })

  it('never falls back locally after a remote lookup failure', async () => {
    getState.mockReturnValue(state('runtime:mini'))
    remoteCall.mockResolvedValue({
      id: 'request',
      ok: false,
      error: { code: 'terminal_not_found', message: 'terminal_not_found' }
    })
    await expect(copyWorkspaceTerminalHandle(worktreeId, tabId, leafId)).rejects.toThrow(
      'terminal_not_found'
    )
    expect(remoteCall).toHaveBeenCalledTimes(1)
    expect(localCall).not.toHaveBeenCalled()
    expect(writeClipboardText).not.toHaveBeenCalled()
  })

  it('preserves the clipboard on a transport failure', async () => {
    getState.mockReturnValue(state('runtime:mini'))
    remoteCall.mockRejectedValue(new Error('disconnected'))
    await expect(copyWorkspaceTerminalHandle(worktreeId, tabId, leafId)).rejects.toThrow(
      'disconnected'
    )
    expect(remoteCall).toHaveBeenCalledTimes(1)
    expect(localCall).not.toHaveBeenCalled()
    expect(writeClipboardText).not.toHaveBeenCalled()
  })

  it('propagates clipboard failure to the existing menu error handling', async () => {
    writeClipboardText.mockRejectedValue(new Error('clipboard unavailable'))
    await expect(copyWorkspaceTerminalHandle(worktreeId, tabId, leafId)).rejects.toThrow(
      'clipboard unavailable'
    )
    expect(localCall).toHaveBeenCalledTimes(1)
    expect(remoteCall).not.toHaveBeenCalled()
  })
})
