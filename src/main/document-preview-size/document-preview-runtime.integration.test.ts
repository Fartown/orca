import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRuntimeFileCommands } from '../runtime/orca-runtime-files-test-harness'
import { readDocumentPreviewInChunks } from './document-preview-chunk-reader'
import { DOCUMENT_PREVIEW_TEXT_MAX_BYTES } from '../../shared/document-preview-size/document-preview-size-limit'
import { REMOTE_RPC_MAX_CONTENT_BYTES } from '../../shared/remote-rpc-content-budget'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(size: number) {
  const root = await mkdtemp(join(tmpdir(), 'orca-document-runtime-'))
  roots.push(root)
  const content = Buffer.alloc(size, 97)
  content.write('<!doctype html><p>中文预览</p>')
  content.write('<!--complete-->', size - 15)
  await writeFile(join(root, 'index.html'), content)
  return { root, content, commands: createRuntimeFileCommands({ path: root }).commands }
}

describe('document preview on the owning runtime', () => {
  it('returns a full local 20 MiB document', async () => {
    const { content, commands } = await fixture(DOCUMENT_PREVIEW_TEXT_MAX_BYTES)
    const result = await commands.readDocPreviewFile(
      'id:wt-1',
      'index.html',
      'index.html',
      null,
      []
    )
    expect(Buffer.from(result.content).equals(content)).toBe(true)
  })

  it('round-trips 20 MiB through bounded JSON chunks for an SSH orcad client', async () => {
    const { content, commands } = await fixture(DOCUMENT_PREVIEW_TEXT_MAX_BYTES)
    let frames = 0
    const result = await readDocumentPreviewInChunks(async (chunk) => {
      const response = await commands.readDocPreviewFile(
        'id:wt-1',
        'index.html',
        'index.html',
        null,
        [],
        REMOTE_RPC_MAX_CONTENT_BYTES,
        chunk
      )
      const frame = JSON.stringify(response)
      expect(Buffer.byteLength(frame)).toBeLessThanOrEqual(REMOTE_RPC_MAX_CONTENT_BYTES)
      frames++
      return JSON.parse(frame)
    })
    expect(frames).toBeGreaterThan(1)
    expect(Buffer.from(result.content).equals(content)).toBe(true)
  })

  it('refuses oversized documents on both local and remote request paths', async () => {
    const { commands } = await fixture(DOCUMENT_PREVIEW_TEXT_MAX_BYTES + 1)
    await expect(
      commands.readDocPreviewFile('id:wt-1', 'index.html', 'index.html', null, [])
    ).rejects.toThrow('file_too_large')
    await expect(
      readDocumentPreviewInChunks((chunk) =>
        commands.readDocPreviewFile(
          'id:wt-1',
          'index.html',
          'index.html',
          null,
          [],
          REMOTE_RPC_MAX_CONTENT_BYTES,
          chunk
        )
      )
    ).rejects.toThrow('file_too_large')
  })

  it('never reads an unserved SSH workspace from this machine', async () => {
    const { root } = await fixture(1024)
    const { commands } = createRuntimeFileCommands({ path: root, hostId: 'ssh:unserved' })
    await expect(
      commands.readDocPreviewFile('id:wt-1', 'index.html', 'index.html', null, [])
    ).rejects.toThrow()
  })
})
