import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SshChannelMultiplexer, type MultiplexerTransport } from '../ssh/ssh-channel-multiplexer'
import { readSshDocPreviewFile } from '../providers/ssh-filesystem-doc-preview'
import { RelayContext } from '../../relay/context'
import { RelayDispatcher } from '../../relay/dispatcher'
import { FsHandler } from '../../relay/fs-handler'
import { GitHandler } from '../../relay/git-handler'
import { GitResponseStreamRegistry } from '../../relay/git-response-stream'
import { DISPATCHER_CONTROL_QUEUE_MAX_BYTES } from '../../relay/dispatcher-writer-admission'
import { MAX_MESSAGE_SIZE } from '../../shared/relay-frame-decoder'

vi.mock('@parcel/watcher', () => ({ subscribe: vi.fn() }))

describe('document preview over the real relay codec', () => {
  let mux: SshChannelMultiplexer
  let dispatcher: RelayDispatcher
  let fsHandler: FsHandler
  let gitHandler: GitHandler
  let root: string
  let largestFrame: number

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'orca-preview-relay-'))
    largestFrame = 0
    let relayFeed: (data: Buffer) => void
    const callbacks: ((data: Buffer) => void)[] = []
    const transport: MultiplexerTransport = {
      write: (data) => {
        setImmediate(() => relayFeed(data))
      },
      onData: (callback) => {
        callbacks.push(callback)
      },
      onClose: () => {}
    }
    dispatcher = new RelayDispatcher((data) => {
      largestFrame = Math.max(largestFrame, data.length)
      setImmediate(() => {
        for (const callback of callbacks) {
          callback(data)
        }
      })
      return true
    })
    relayFeed = (data) => dispatcher.feed(data)
    const registry = new GitResponseStreamRegistry()
    const context = new RelayContext()
    fsHandler = new FsHandler(dispatcher, context, undefined, registry)
    gitHandler = new GitHandler(dispatcher, context, undefined, registry)
    mux = new SshChannelMultiplexer(transport)
  })

  afterEach(async () => {
    mux.dispose()
    dispatcher.dispose()
    fsHandler.dispose()
    gitHandler.dispose()
    await rm(root, { recursive: true, force: true })
  })

  async function fixture(size: number) {
    const content = Buffer.alloc(size, 0x61)
    content.write('<!doctype html><p>中文预览</p>')
    content.write('<!--complete-->', size - Buffer.byteLength('<!--complete-->'))
    const path = join(root, 'index.html')
    await writeFile(path, content)
    return {
      content,
      request: {
        boundaryPath: root,
        entryPath: path,
        targetPath: path,
        implicitRootPath: null,
        authorizedRootPaths: [],
        maxTextBytes: 20 * 1024 * 1024,
        maxBinaryBytes: 10 * 1024 * 1024
      }
    }
  }

  it('delivers all 20 MiB without exceeding the existing frame budget', async () => {
    const { content, request } = await fixture(20 * 1024 * 1024)
    expect(content.length).toBeGreaterThan(MAX_MESSAGE_SIZE)
    const result = await readSshDocPreviewFile(mux, request)
    expect(result.isBinary).toBe(false)
    expect(Buffer.from(result.content).equals(content)).toBe(true)
    expect(largestFrame).toBeLessThan(DISPATCHER_CONTROL_QUEUE_MAX_BYTES)
  })

  it('rejects 20 MiB plus one byte', async () => {
    const { request } = await fixture(20 * 1024 * 1024 + 1)
    await expect(readSshDocPreviewFile(mux, request)).rejects.toThrow('file_too_large')
  })

  it('still serves an old client without streaming negotiation', async () => {
    const { request, content } = await fixture(1024)
    await expect(mux.request('fs.readDocPreview', request)).resolves.toMatchObject({
      content: content.toString('utf8'),
      isBinary: false
    })
  })
})
