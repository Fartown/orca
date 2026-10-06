import { describe, expect, it, vi } from 'vitest'

// `use-native-verbs` reaches the host-client hooks, whose real module imports the Expo runtime.
vi.mock('../transport/host-client-hooks', () => ({
  useDisconnectHostClient: () => () => {},
  useForceReconnect: () => null,
  useForgetHostClient: () => () => {},
  useHostClient: () => ({ client: null, clientId: null, state: 'disconnected' }),
  usePrimeHosts: () => () => {},
  useRefreshHostClient: () => () => {}
}))

import { NativeVerbError } from '../mobile-web-shell/bridge/use-native-verbs'
import { MEDIA_STAGED_MAX_BYTES } from '../mobile-web-shell/media-handle-registry'
import {
  createShellFileAttachmentPicker,
  createStagedMediaFileAttachmentPicker,
  readShellStagedBase64Chunks,
  type ShellFileVerbs,
  type StagedMediaVerbs
} from './file-attachment-picker.web'
import {
  FileAttachmentShellLimitError,
  FileAttachmentTooLargeError
} from './picked-attachment-file'

function reading(bytes: Uint8Array) {
  return vi.fn(async (offset: number, length: number) => {
    const slice = bytes.subarray(offset, offset + length)
    return {
      base64: Buffer.from(slice).toString('base64'),
      eof: offset + slice.byteLength >= bytes.byteLength
    }
  })
}

async function drain(chunks: AsyncIterable<string>): Promise<number[]> {
  const sizes: number[] = []
  for await (const chunk of chunks) {
    sizes.push(Buffer.from(chunk, 'base64').byteLength)
  }
  return sizes
}

describe('readShellStagedBase64Chunks', () => {
  it('reads the staged item one upload chunk at a time', async () => {
    const read = reading(new Uint8Array(10))
    expect(await drain(readShellStagedBase64Chunks(read, 'h', 10, 4))).toEqual([4, 4, 2])
    expect(read).toHaveBeenNthCalledWith(3, 8, 2)
  })

  it('fails when the shell answers fewer bytes than it declared', async () => {
    await expect(
      drain(readShellStagedBase64Chunks(reading(new Uint8Array(3)), 'h', 5, 4))
    ).rejects.toThrow('declared as 5')
  })
})

describe('createStagedMediaFileAttachmentPicker', () => {
  it('names a staged item from its type and caps it at the shell staging size', async () => {
    const verbs = {
      pickMedia: vi.fn(async () => [{ handle: 'h', mime: 'application/pdf', byteLength: 3 }]),
      readMedia: vi.fn(async () => ({ base64: '', eof: true })),
      releaseMedia: vi.fn(async () => true)
    } satisfies StagedMediaVerbs
    const picker = createStagedMediaFileAttachmentPicker(verbs)
    expect(picker.maxBytes).toBe(MEDIA_STAGED_MAX_BYTES)
    const [file] = await picker.pickFiles(false)
    expect(verbs.pickMedia).toHaveBeenCalledWith('files', false)
    expect(file?.name).toBe('attachment.pdf')
    await file?.release()
    expect(verbs.releaseMedia).toHaveBeenCalledWith('h')
  })

  it('turns the shell staging refusal into an app-update error', async () => {
    const verbs = {
      pickMedia: vi.fn(async (): Promise<never> => {
        throw new NativeVerbError('native_media_too_large', 'too big')
      }),
      readMedia: vi.fn(async () => ({ base64: '', eof: true })),
      releaseMedia: vi.fn(async () => true)
    } satisfies StagedMediaVerbs
    await expect(
      createStagedMediaFileAttachmentPicker(verbs).pickFiles(true)
    ).rejects.toBeInstanceOf(FileAttachmentShellLimitError)
  })
})

describe('createShellFileAttachmentPicker', () => {
  it('keeps the name the shell reports and reads through native.file.read', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    const read = reading(bytes)
    const files = {
      pickFiles: vi.fn(async () => [
        { handle: 'f1', name: 'report.pdf', mime: 'application/pdf', byteLength: 5 }
      ]),
      readFile: vi.fn((_handle: string, offset: number, length: number) => read(offset, length)),
      releaseFile: vi.fn(async () => true)
    } satisfies ShellFileVerbs
    const picker = createShellFileAttachmentPicker(files)
    expect(picker.maxBytes).toBe(100 * 1024 * 1024)
    const [file] = await picker.pickFiles(true)
    expect(file?.name).toBe('report.pdf')
    expect(await drain(file!.readBase64Chunks(3))).toEqual([3, 2])
    expect(files.readFile).toHaveBeenCalledWith('f1', 3, 2)
    await file?.release()
    await file?.release()
    expect(files.releaseFile).toHaveBeenCalledTimes(1)
  })

  it('reports a file over the upload ceiling as too large', async () => {
    const files = {
      pickFiles: vi.fn(async (): Promise<never> => {
        throw new NativeVerbError('native_media_too_large', 'too big')
      }),
      readFile: vi.fn(async () => ({ base64: '', eof: true })),
      releaseFile: vi.fn(async () => true)
    } satisfies ShellFileVerbs
    await expect(createShellFileAttachmentPicker(files).pickFiles(false)).rejects.toBeInstanceOf(
      FileAttachmentTooLargeError
    )
  })
})
