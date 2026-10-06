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
  createStagedMediaFileAttachmentPicker,
  readStagedMediaBase64Chunks,
  type StagedMediaVerbs
} from './file-attachment-picker.web'
import { FileAttachmentShellLimitError } from './picked-attachment-file'

function verbsReading(bytes: Uint8Array): Pick<StagedMediaVerbs, 'readMedia'> {
  return {
    readMedia: vi.fn(async (_handle: string, offset: number, length: number) => {
      const slice = bytes.subarray(offset, offset + length)
      return {
        base64: Buffer.from(slice).toString('base64'),
        eof: offset + slice.byteLength >= bytes.byteLength
      }
    })
  }
}

describe('readStagedMediaBase64Chunks', () => {
  it('reads the staged item one upload chunk at a time', async () => {
    const bytes = new Uint8Array(10).map((_, index) => index)
    const verbs = verbsReading(bytes)
    const chunks: string[] = []
    for await (const chunk of readStagedMediaBase64Chunks(
      verbs,
      { handle: 'h', mime: 'application/zip', byteLength: 10 },
      4
    )) {
      chunks.push(chunk)
    }
    expect(chunks.map((chunk) => Buffer.from(chunk, 'base64').byteLength)).toEqual([4, 4, 2])
    expect(verbs.readMedia).toHaveBeenNthCalledWith(3, 'h', 8, 2)
  })

  it('fails when the shell answers fewer bytes than it declared', async () => {
    const verbs = verbsReading(new Uint8Array(3))
    const read = async () => {
      for await (const _ of readStagedMediaBase64Chunks(
        verbs,
        { handle: 'h', mime: 'text/plain', byteLength: 5 },
        4
      )) {
        // drain
      }
    }
    await expect(read()).rejects.toThrow('declared as 5')
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
