import { describe, expect, it, vi } from 'vitest'
import { MediaHandleRegistry } from '../mobile-web-shell/media-handle-registry'
import { BRIDGE_FILE_VERBS } from './bridge-file-verbs'
import {
  createNativeFileVerbServer,
  FILE_PICK_MAX_TOTAL_BYTES,
  type NativeFileVerbDeps
} from './native-file-verbs'

const MiB = 1024 * 1024

function shell(
  assets: { uri: string; name: string; mimeType?: string }[],
  sizes: Record<string, number>
) {
  const discarded: string[] = []
  const registry = new MediaHandleRegistry({ now: () => 1, discard: (uri) => discarded.push(uri) })
  const deps: NativeFileVerbDeps = {
    registry,
    launchFiles: vi.fn(async () => ({ canceled: false, assets })),
    sizeOf: (uri) => sizes[uri] ?? 0,
    ownsStagedUri: (uri) => uri.startsWith('file:'),
    discard: (uri) => discarded.push(uri)
  }
  return { pick: createNativeFileVerbServer(deps), deps, registry, discarded }
}

describe('native.file.pick', () => {
  it('stages a named file into the media registry, readable past the image ceiling', async () => {
    const { pick, registry } = shell(
      [{ uri: 'file:///c/big.pdf', name: 'big.pdf', mimeType: 'application/pdf' }],
      { 'file:///c/big.pdf': 50 * MiB }
    )
    const picked = BRIDGE_FILE_VERBS['native.file.pick'].result.parse(
      await pick({ multiple: false })
    )
    expect(picked.items).toEqual([
      { handle: expect.any(String), name: 'big.pdf', mime: 'application/pdf', byteLength: 50 * MiB }
    ])
    // `native.media.read` serves the same handle: the range past 18 MiB resolves to the file.
    const range = registry.read(picked.items[0]!.handle, 40 * MiB, 1024)
    expect(range).toMatchObject({ uri: 'file:///c/big.pdf', start: 40 * MiB })
  })

  it('names an untyped file as octet-stream', async () => {
    const { pick } = shell([{ uri: 'file:///c/blob', name: 'blob' }], { 'file:///c/blob': 3 })
    const picked = BRIDGE_FILE_VERBS['native.file.pick'].result.parse(
      await pick({ multiple: false })
    )
    expect(picked.items[0]?.mime).toBe('application/octet-stream')
  })

  it('refuses a file over the upload ceiling and deletes the whole pick', async () => {
    const { pick, discarded } = shell(
      [
        { uri: 'file:///c/a.txt', name: 'a.txt' },
        { uri: 'file:///c/huge.bin', name: 'huge.bin' }
      ],
      { 'file:///c/a.txt': 1, 'file:///c/huge.bin': 100 * MiB + 1 }
    )
    await expect(pick({ multiple: true })).rejects.toMatchObject({ code: 'native_media_too_large' })
    expect(discarded).toEqual(['file:///c/a.txt', 'file:///c/huge.bin'])
  })

  it('refuses a pick whose files together pass the staging budget', async () => {
    const files = Array.from({ length: 3 }, (_, index) => ({
      uri: `file:///c/f${index}.zip`,
      name: `f${index}.zip`
    }))
    const sizes = Object.fromEntries(files.map((file) => [file.uri, FILE_PICK_MAX_TOTAL_BYTES / 2]))
    const { pick, registry } = shell(files, sizes)
    await expect(pick({ multiple: true })).rejects.toMatchObject({ code: 'native_media_too_large' })
    expect(registry.liveCount()).toBe(0)
  })

  it('refuses a picker answer that is not a copy this shell owns', async () => {
    const { pick } = shell([{ uri: 'content://provider/doc', name: 'doc.pdf' }], {})
    await expect(pick({ multiple: false })).rejects.toThrow('does not own')
  })

  it('answers nothing for a cancelled pick', async () => {
    const { pick, deps } = shell([], {})
    vi.mocked(deps.launchFiles).mockResolvedValueOnce({ canceled: true, assets: null })
    expect(await pick({ multiple: true })).toEqual({ items: [] })
  })
})
