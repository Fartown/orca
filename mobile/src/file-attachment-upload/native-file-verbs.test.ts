import { describe, expect, it, vi } from 'vitest'
import { MediaHandleRegistry } from '../mobile-web-shell/media-handle-registry'
import { BRIDGE_FILE_VERBS } from './bridge-file-verbs'
import { createNativeFileVerbServer, type NativeFileVerbDeps } from './native-file-verbs'

function shell(
  files: Record<string, Uint8Array>,
  assets: { uri: string; name: string; mimeType?: string }[],
  sizes: Record<string, number> = {}
) {
  const discarded: string[] = []
  const registry = new MediaHandleRegistry({ now: () => 1, discard: (uri) => discarded.push(uri) })
  const deps: NativeFileVerbDeps = {
    registry,
    launchFiles: vi.fn(async () => ({ canceled: false, assets })),
    sizeOf: (uri) => sizes[uri] ?? files[uri]?.byteLength ?? 0,
    open: (uri) => {
      const handle = {
        offset: 0 as number | null,
        readBytes: (length: number) => {
          const start = handle.offset ?? 0
          const slice = (files[uri] ?? new Uint8Array()).subarray(start, start + length)
          handle.offset = start + slice.byteLength
          return slice
        },
        close: () => undefined
      }
      return handle
    },
    ownsStagedUri: (uri) => uri.startsWith('file:'),
    discard: (uri) => discarded.push(uri)
  }
  return { serve: createNativeFileVerbServer(deps), deps, discarded }
}

describe('native.file verbs', () => {
  it('stages a named file of any type and reads it back by range', async () => {
    const { serve } = shell({ 'file:///c/a.zip': new Uint8Array([9, 8, 7, 6]) }, [
      { uri: 'file:///c/a.zip', name: 'a.zip', mimeType: 'application/zip' }
    ])
    const picked = BRIDGE_FILE_VERBS['native.file.pick'].result.parse(
      await serve('native.file.pick', { multiple: false })
    )
    expect(picked.items).toEqual([
      { handle: expect.any(String), name: 'a.zip', mime: 'application/zip', byteLength: 4 }
    ])
    const handle = picked.items[0]!.handle
    const read = BRIDGE_FILE_VERBS['native.file.read'].result.parse(
      await serve('native.file.read', { handle, offset: 2, length: 2 })
    )
    expect(Buffer.from(read.base64, 'base64')).toEqual(Buffer.from([7, 6]))
    expect(read.eof).toBe(true)
    expect(await serve('native.file.release', { handle })).toEqual({ released: true })
  })

  it('stages a file past the image ceiling', async () => {
    const big = 50 * 1024 * 1024
    const { serve } = shell({}, [{ uri: 'file:///c/big.pdf', name: 'big.pdf' }], {
      'file:///c/big.pdf': big
    })
    const picked = BRIDGE_FILE_VERBS['native.file.pick'].result.parse(
      await serve('native.file.pick', { multiple: false })
    )
    expect(picked.items[0]).toMatchObject({ byteLength: big, mime: 'application/octet-stream' })
  })

  it('refuses the whole pick for a file over the upload ceiling and deletes its copies', async () => {
    const { serve, discarded } = shell(
      { 'file:///c/a.txt': new Uint8Array(1) },
      [
        { uri: 'file:///c/a.txt', name: 'a.txt' },
        { uri: 'file:///c/huge.bin', name: 'huge.bin' }
      ],
      { 'file:///c/huge.bin': 100 * 1024 * 1024 + 1 }
    )
    await expect(serve('native.file.pick', { multiple: true })).rejects.toMatchObject({
      code: 'native_media_too_large'
    })
    expect(discarded).toEqual(['file:///c/a.txt', 'file:///c/huge.bin'])
  })

  it('refuses a picker answer that is not a copy this shell owns', async () => {
    const { serve } = shell({}, [{ uri: 'content://provider/doc', name: 'doc.pdf' }])
    await expect(serve('native.file.pick', { multiple: false })).rejects.toThrow('does not own')
  })

  it('answers nothing for a cancelled pick', async () => {
    const { serve, deps } = shell({}, [])
    vi.mocked(deps.launchFiles).mockResolvedValueOnce({ canceled: true, assets: null })
    expect(await serve('native.file.pick', { multiple: true })).toEqual({ items: [] })
  })
})
