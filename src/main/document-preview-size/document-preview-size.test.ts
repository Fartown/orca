import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createRuntimeFileCommands,
  useRuntimeFileCommandsLifecycle
} from '../runtime/orca-runtime-files-test-harness'
import {
  getSshFilesystemProviderMock,
  resolveAuthorizedPathMock
} from '../runtime/orca-runtime-files-mock-registry'
import { readAuthorizedDocPreviewFile } from '../../shared/doc-preview-file-access'
import { REMOTE_RPC_MAX_CONTENT_BYTES } from '../../shared/remote-rpc-content-budget'
import { readDocPreviewFile } from '../browser/doc-preview-file-reader'
import { callRuntimeEnvironment } from '../ipc/runtime-environment-transport-routing'
import { RpcDispatcher } from '../runtime/rpc/dispatcher'
import { FILE_METHODS } from '../runtime/rpc/methods/files'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { serializeRemoteRuntimePayload } from '../../shared/remote-runtime-memory-limits'
import {
  mintDocPreviewGrant,
  revokeAllDocPreviewGrants
} from '../browser/doc-preview-grant-registry'

vi.mock('fs', async () =>
  (await import('../runtime/orca-runtime-files-mock-registry')).fsModuleMock()
)
vi.mock(
  '../runtime/file-watcher-host',
  async () => (await import('../runtime/orca-runtime-files-mock-registry')).fileWatcherHostMock
)
vi.mock('../ipc/filesystem-auth', async () =>
  (await import('../runtime/orca-runtime-files-mock-registry')).filesystemAuthModuleMock()
)
vi.mock('../git/runner', async () =>
  (await import('../runtime/orca-runtime-files-mock-registry')).gitRunnerModuleMock()
)
vi.mock(
  '../ipc/rg-availability',
  async () => (await import('../runtime/orca-runtime-files-mock-registry')).rgAvailabilityMock
)
vi.mock(
  '../ipc/local-worktree-runtime-options',
  async () =>
    (await import('../runtime/orca-runtime-files-mock-registry')).localWorktreeRuntimeOptionsMock
)
vi.mock(
  '../ipc/filesystem-search-git',
  async () => (await import('../runtime/orca-runtime-files-mock-registry')).filesystemSearchGitMock
)
vi.mock(
  '../providers/ssh-filesystem-dispatch',
  async () =>
    (await import('../runtime/orca-runtime-files-mock-registry')).sshFilesystemDispatchMock
)
vi.mock('../ipc/runtime-environment-transport-routing', () => ({ callRuntimeEnvironment: vi.fn() }))
vi.mock('../persistence', () => ({ getCanonicalUserDataPath: () => '/unused-user-data' }))

const TEXT_CAP = 20 * 1024 * 1024
const END_MARKER = '<!--preview-complete-->'
const roots: string[] = []

async function fixture(size: number) {
  const root = await mkdtemp(join(tmpdir(), 'orca-document-preview-size-'))
  roots.push(root)
  const buffer = Buffer.alloc(size, 0x61)
  buffer.write('<!doctype html><meta charset="utf-8"><p>中文预览</p>')
  if (size > 256 * 1024 + 10) {
    buffer.write('中🙂', 256 * 1024 - 1)
  }
  buffer.write(END_MARKER, size - Buffer.byteLength(END_MARKER))
  const entryPath = join(root, 'index.html')
  await writeFile(entryPath, buffer)
  return { root, entryPath, content: buffer.toString('utf8') }
}

describe('document preview text size', () => {
  useRuntimeFileCommandsLifecycle()

  afterEach(async () => {
    revokeAllDocPreviewGrants()
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  it.each([512 * 1024 + 1, TEXT_CAP])(
    'reads all %i bytes through the local runtime',
    async (size) => {
      const { root, content } = await fixture(size)
      const { commands } = createRuntimeFileCommands({ path: root })

      const result = await commands.readDocPreviewFile(
        'id:wt-1',
        'index.html',
        'index.html',
        null,
        []
      )

      expect(result.isBinary).toBe(false)
      expect(Buffer.byteLength(result.content, 'utf8')).toBe(size)
      expect(result.content === content).toBe(true)
      expect(result.content.endsWith(END_MARKER)).toBe(true)
    }
  )

  it.each([512 * 1024 + 1, TEXT_CAP, TEXT_CAP + 1])(
    'routes %i bytes from a runtime-owned preview through bounded RPC replies',
    async (size) => {
      const { root, content } = await fixture(size)
      const { commands } = createRuntimeFileCommands({ path: root })
      const dispatcher = new RpcDispatcher({
        runtime: {
          getRuntimeId: () => 'preview-test',
          readDocPreviewFile: commands.readDocPreviewFile.bind(commands)
        } as unknown as OrcaRuntimeService,
        methods: FILE_METHODS
      })
      let requestCount = 0
      let largestReply = 0
      vi.mocked(callRuntimeEnvironment).mockImplementation(
        async (_store, _owner, method, params) => {
          requestCount++
          const response = await dispatcher.dispatch(
            {
              id: `preview-${requestCount}`,
              authToken: 'test-token',
              method,
              params
            },
            { clientKind: 'runtime' }
          )
          const wire = serializeRemoteRuntimePayload(response)
          largestReply = Math.max(largestReply, Buffer.byteLength(wire))
          return JSON.parse(wire)
        }
      )
      const grant = mintDocPreviewGrant({
        owner: {
          kind: 'runtime',
          environmentId: 'env-preview',
          worktreeSelector: 'id:wt-1',
          worktreeRoot: root
        },
        root,
        entryRelativePath: 'index.html',
        browserPageId: 'runtime-preview-size'
      })
      const result = await readDocPreviewFile(grant, 'index.html')
      if (size > TEXT_CAP) {
        expect(result).toMatchObject({ ok: false, status: 413, reason: 'too-large' })
        expect(requestCount).toBe(1)
      } else {
        expect(result.ok).toBe(true)
        if (!result.ok) {
          throw new Error(result.message)
        }
        expect(result.bytes.toString('utf8') === content).toBe(true)
        expect(requestCount).toBe(Math.ceil(size / (256 * 1024)))
      }
      expect(largestReply).toBeLessThan(512 * 1024)
    }
  )

  it.each([512 * 1024 + 1, TEXT_CAP])(
    'reads all %i bytes through the direct SSH adapter',
    async (size) => {
      const { root, content } = await fixture(size)
      getSshFilesystemProviderMock.mockReturnValue({
        readDocPreviewFile: readAuthorizedDocPreviewFile
      })
      const grant = mintDocPreviewGrant({
        owner: { kind: 'ssh', connectionId: 'ssh-preview-size' },
        root,
        entryRelativePath: 'index.html',
        browserPageId: 'preview-size-test'
      })

      const result = await readDocPreviewFile(grant, 'index.html')

      expect(result.ok).toBe(true)
      if (!result.ok) {
        throw new Error(result.message)
      }
      expect(result.bytes.byteLength).toBe(size)
      expect(result.bytes.toString('utf8') === content).toBe(true)
    }
  )

  it('rejects 20 MiB plus one byte without returning partial content', async () => {
    const { root, entryPath } = await fixture(TEXT_CAP + 1)
    const { commands } = createRuntimeFileCommands({ path: root })

    await expect(
      commands.readDocPreviewFile('id:wt-1', 'index.html', 'index.html', null, [])
    ).rejects.toThrow('file_too_large')
    await expect(
      readAuthorizedDocPreviewFile({
        boundaryPath: root,
        entryPath,
        targetPath: entryPath,
        implicitRootPath: null,
        authorizedRootPaths: [],
        maxTextBytes: TEXT_CAP * 2,
        maxBinaryBytes: 10 * 1024 * 1024
      })
    ).rejects.toThrow('file_too_large')

    getSshFilesystemProviderMock.mockReturnValue({
      readDocPreviewFile: readAuthorizedDocPreviewFile
    })
    const grant = mintDocPreviewGrant({
      owner: { kind: 'ssh', connectionId: 'ssh-preview-size' },
      root,
      entryRelativePath: 'index.html',
      browserPageId: 'preview-size-test'
    })
    await expect(readDocPreviewFile(grant, 'index.html')).resolves.toMatchObject({
      ok: false,
      status: 413,
      reason: 'too-large'
    })
  })

  it('preserves the paired and ordinary file text caps', async () => {
    const { root } = await fixture(512 * 1024 + 1)
    const { commands } = createRuntimeFileCommands({ path: root })
    resolveAuthorizedPathMock.mockImplementation(async (path: string) => path)

    await expect(
      commands.readDocPreviewFile(
        'id:wt-1',
        'index.html',
        'index.html',
        null,
        [],
        REMOTE_RPC_MAX_CONTENT_BYTES
      )
    ).rejects.toThrow('file_too_large')
    await expect(commands.readFileExplorerPreview('id:wt-1', 'index.html')).rejects.toThrow(
      'file_too_large'
    )
  })

  it('still enforces the encoded paired response budget', async () => {
    const { root, entryPath } = await fixture(64)
    await writeFile(entryPath, '\u0001'.repeat(64))
    const { commands } = createRuntimeFileCommands({ path: root })

    await expect(
      commands.readDocPreviewFile('id:wt-1', 'index.html', 'index.html', null, [], 128)
    ).rejects.toThrow('file_too_large')
  })

  it('enforces chunk length and file version on the execution host', async () => {
    const { root, entryPath } = await fixture(128)
    const { commands } = createRuntimeFileCommands({ path: root })
    const read = (chunk: { offset: number; length: number; version?: string }) =>
      commands.readDocPreviewFile(
        'id:wt-1',
        'index.html',
        'index.html',
        null,
        [],
        REMOTE_RPC_MAX_CONTENT_BYTES,
        chunk
      )
    await expect(read({ offset: 0, length: 256 * 1024 + 1 })).rejects.toThrow('exceeds')
    const first = await read({ offset: 0, length: 64 })
    expect(first.chunk?.offset).toBe(0)
    await writeFile(entryPath, 'changed')
    await expect(read({ offset: 0, length: 64, version: first.chunk?.version })).rejects.toThrow(
      'Document changed'
    )
  })
})
