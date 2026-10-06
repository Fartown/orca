import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { memoryFile, rpcError, rpcOk } from './file-attachment-test-fixtures'
import type { RpcResponse } from '../transport/types'
import type { FileAttachmentPicker, PickedAttachmentFile } from './picked-attachment-file'

const picker = vi.hoisted((): { current: FileAttachmentPicker | null } => ({ current: null }))
vi.mock('./file-attachment-picker', () => ({
  useFileAttachmentPicker: () => picker.current
}))

import {
  useMobileFileAttachments,
  type MobileFileAttachments,
  type MobileFileAttachmentsArgs
} from './use-mobile-file-attachments'

// Faking the raw request port belongs in a test file, which the port boundary census skips.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export type RecordedCall = { method: string; params: Record<string, unknown> }

/** A host that answers each method from a handler, recording every request. */
export function fakeHost(
  handlers: Record<string, (params: Record<string, unknown>) => RpcResponse>
) {
  const calls: RecordedCall[] = []
  return {
    calls,
    sendRequest: vi.fn(async (method: string, params?: unknown) => {
      const recorded = isRecord(params) ? params : {}
      calls.push({ method, params: recorded })
      const handler = handlers[method]
      if (!handler) {
        throw new Error(`unexpected request: ${method}`)
      }
      return handler(recorded)
    })
  }
}

function pickerOf(
  files: PickedAttachmentFile[],
  maxBytes = 100 * 1024 * 1024
): FileAttachmentPicker {
  return { maxBytes, pickFiles: vi.fn(async () => files) }
}

function uploadingHost(path = '/tmp/orca-file-attachments/1/report.pdf', fileName = 'report.pdf') {
  return fakeHost({
    'fileAttachment.startUpload': () => rpcOk({ uploadId: 'u1', maxChunkBase64Chars: 524288 }),
    'fileAttachment.appendUploadChunk': () => rpcOk({ receivedBytes: 1 }),
    'fileAttachment.commitUpload': () => rpcOk({ path, fileName, byteLength: 1 }),
    'fileAttachment.abortUpload': () => rpcOk({ aborted: true }),
    'terminal.send': () => rpcOk({ send: { accepted: true } })
  })
}

let renderer: ReactTestRenderer | null = null
let hook: MobileFileAttachments

function render(args: MobileFileAttachmentsArgs): void {
  function Harness(): null {
    hook = useMobileFileAttachments(args)
    return null
  }
  act(() => {
    renderer = create(createElement(Harness))
  })
}

function baseArgs(client: ReturnType<typeof fakeHost>) {
  return {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these flows call only `sendRequest`, which the fake host implements.
    client: client as unknown as RpcClient,
    worktreeId: 'repo::/w',
    connState: 'connected' as const,
    agent: 'claude',
    deviceTokenRef: { current: 'device-1' },
    getActiveWorktreeConnectionId: async () => null,
    showToast: vi.fn(),
    onSuccess: vi.fn(),
    onError: vi.fn(),
    terminal: {
      activeHandle: 'term-1',
      canSend: true,
      beforeSend: vi.fn(async () => true),
      attachPhoto: vi.fn()
    },
    chat: {
      scopeKey: 'scope-1',
      enabled: true,
      attachPhoto: vi.fn(),
      addUploadedImages: vi.fn(),
      setComposerText: vi.fn()
    }
  }
}

async function choose(target: 'terminal' | 'chat', source: 'photo' | 'file'): Promise<void> {
  act(() => (target === 'terminal' ? hook.openTerminalSheet() : hook.openChatSheet()))
  expect(hook.sheet.visible).toBe(true)
  // The sheet closes before the deferred choice runs.
  act(() => hook.sheet.onClose())
  await act(async () => {
    if (source === 'photo') {
      hook.sheet.onPhoto()
    } else {
      hook.sheet.onFile()
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => {
  picker.current = null
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

describe('useMobileFileAttachments', () => {
  it('keeps Photo on the existing image flow', async () => {
    const args = baseArgs(uploadingHost())
    render(args)
    await choose('terminal', 'photo')
    await choose('chat', 'photo')
    expect(args.terminal.attachPhoto).toHaveBeenCalledTimes(1)
    expect(args.chat.attachPhoto).toHaveBeenCalledTimes(1)
  })

  it('types an uploaded file path into the terminal and drops the staged copy', async () => {
    const file = memoryFile('report.pdf', new Uint8Array([1]))
    picker.current = pickerOf([file])
    const host = uploadingHost()
    const args = baseArgs(host)
    render(args)
    await choose('terminal', 'file')

    expect(host.calls.at(-1)).toEqual({
      method: 'terminal.send',
      params: {
        terminal: 'term-1',
        text: '/tmp/orca-file-attachments/1/report.pdf ',
        enter: false,
        client: { id: 'device-1', type: 'mobile' }
      }
    })
    expect(args.terminal.beforeSend).toHaveBeenCalledWith('term-1')
    expect(args.onSuccess).toHaveBeenCalled()
    expect(file.released()).toBe(true)
    expect(hook.isUploadingToTerminal).toBe(false)
  })

  it('puts a non-image into the chat draft as a plain path', async () => {
    picker.current = pickerOf([memoryFile('report.pdf', new Uint8Array([1]))])
    const args = baseArgs(uploadingHost())
    render(args)
    await choose('chat', 'file')

    const update = args.chat.setComposerText.mock.calls[0]?.[0]
    expect(typeof update).toBe('function')
    expect(update('look at')).toBe('look at /tmp/orca-file-attachments/1/report.pdf ')
    expect(args.chat.addUploadedImages).not.toHaveBeenCalled()
  })

  it('holds an agent-readable image as a chip and keeps its preview file', async () => {
    const image = memoryFile('shot.png', new Uint8Array([1]), {
      mimeType: 'image/png',
      previewUri: 'file:///cache/shot.png'
    })
    picker.current = pickerOf([image])
    const args = baseArgs(uploadingHost('/tmp/orca-file-attachments/2/shot.png', 'shot.png'))
    render(args)
    await choose('chat', 'file')

    expect(args.chat.addUploadedImages).toHaveBeenCalledWith('scope-1', [
      { path: '/tmp/orca-file-attachments/2/shot.png', previewUri: 'file:///cache/shot.png' }
    ])
    expect(args.chat.setComposerText).not.toHaveBeenCalled()
    expect(image.released()).toBe(false)
  })

  it('releases an image that rides as a path and every file of a failed attach', async () => {
    const heic = memoryFile('photo.heic', new Uint8Array([1]), {
      mimeType: 'image/heic',
      previewUri: 'file:///cache/photo.heic'
    })
    picker.current = pickerOf([heic])
    const args = baseArgs(uploadingHost('/tmp/orca-file-attachments/3/photo.heic', 'photo.heic'))
    render(args)
    await choose('chat', 'file')
    expect(args.chat.addUploadedImages).not.toHaveBeenCalled()
    expect(heic.released()).toBe(true)

    const shot = memoryFile('shot.png', new Uint8Array([1]), {
      mimeType: 'image/png',
      previewUri: 'file:///cache/shot.png'
    })
    picker.current = pickerOf([shot])
    const failing = baseArgs(
      fakeHost({
        'fileAttachment.startUpload': () => rpcError('runtime_error', 'disk full')
      })
    )
    act(() => renderer?.unmount())
    render(failing)
    await choose('chat', 'file')
    expect(shot.released()).toBe(true)
  })

  it('refuses a file over what this side can stage before uploading', async () => {
    const file = memoryFile('big.zip', new Uint8Array(11))
    picker.current = pickerOf([file], 10)
    const host = uploadingHost()
    const args = baseArgs(host)
    render(args)
    await choose('terminal', 'file')

    expect(host.calls).toEqual([])
    expect(args.showToast).toHaveBeenCalledWith(
      'Update the Orca app to attach files over 0 MB',
      2000
    )
    expect(file.released()).toBe(true)
  })

  it('reports an out-of-contact workspace host', async () => {
    picker.current = pickerOf([memoryFile('a.txt', new Uint8Array([1]))])
    const host = fakeHost({
      'fileAttachment.startUpload': () =>
        rpcError('runtime_error', 'The workspace host is not connected')
    })
    const args = baseArgs(host)
    render(args)
    await choose('chat', 'file')

    expect(args.onError).toHaveBeenCalled()
    expect(args.showToast).toHaveBeenCalledWith('Workspace host is not connected', 2000)
    expect(args.chat.setComposerText).not.toHaveBeenCalled()
  })
})
