import { describe, expect, it } from 'vitest'
import { readRuntimeFileContent } from '../runtime/files/reads/runtime-file-read-client'
import {
  runtimeEnvironmentCall,
  installRuntimeFileClientEnvironment
} from '../runtime/files/runtime-file-client-test-harness'

installRuntimeFileClientEnvironment()

const READ_ARGS = {
  target: { kind: 'environment' as const, environmentId: 'env-1' },
  filePath: '/remote/repo/large.log',
  relativePath: 'large.log',
  worktreeId: 'wt-1'
}

function truncatedRead(content: string) {
  return Promise.resolve({
    id: 'rpc-read',
    ok: true,
    result: {
      worktree: 'id:wt-1',
      relativePath: 'large.log',
      content,
      truncated: true,
      byteLength: 524_288
    },
    _meta: { runtimeId: 'remote-runtime' }
  })
}

describe('remote editor large file read', () => {
  it('finishes a truncated remote read over files.readChunk instead of refusing it', async () => {
    const whole = 'line one\nline two\nline three\n'
    let binary = ''
    for (const byte of new TextEncoder().encode(whole)) {
      binary += String.fromCharCode(byte)
    }
    runtimeEnvironmentCall.mockImplementation((args: { method: string }) =>
      args.method === 'files.read'
        ? truncatedRead('line one\n')
        : args.method === 'files.stat'
          ? Promise.resolve({
              id: 'rpc-stat',
              ok: true,
              result: { size: binary.length, mtime: 1, isDirectory: false },
              _meta: { runtimeId: 'remote-runtime' }
            })
          : Promise.resolve({
              id: 'rpc-chunk',
              ok: true,
              result: {
                contentBase64: globalThis.btoa(binary),
                bytesRead: binary.length,
                eof: true
              },
              _meta: { runtimeId: 'remote-runtime' }
            })
    )

    await expect(readRuntimeFileContent(READ_ARGS)).resolves.toEqual({
      content: whole,
      isBinary: false
    })
  })

  it('names the remedy when the host predates chunked reads', async () => {
    runtimeEnvironmentCall.mockImplementation((args: { method: string }) =>
      args.method === 'files.read'
        ? truncatedRead('partial')
        : Promise.resolve({
            id: 'rpc-chunk',
            ok: false,
            error: { code: 'method_not_found', message: 'files.readChunk' },
            _meta: { runtimeId: 'remote-runtime' }
          })
    )

    await expect(readRuntimeFileContent(READ_ARGS)).rejects.toThrow('Update the server to open it.')
  })
})
