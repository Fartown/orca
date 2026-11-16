import { mkdtemp, appendFile, rename, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  readTranscriptFileVersion,
  boundaryFingerprint
} from '../native-chat/transcript-file-version'
import { verifyDurableChatTranscriptReceipt } from './durable-chat-transcript-verification'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((p) => rm(p, { recursive: true, force: true })))
})
it('permits appends but rejects inode replacement, truncation and same-inode rewrite at the receipt boundary', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'orca-chat-generation-'))
  directories.push(dir)
  const file = join(dir, 'session.jsonl')
  await writeFile(file, 'original transcript boundary\n')
  const version = await readTranscriptFileVersion(file)
  const proof = {
    sessionId: 'session',
    transcriptPath: file,
    fileIdentity: version.identity,
    afterByteOffset: version.size,
    boundaryFingerprint: await boundaryFingerprint(file, version.size),
    afterMessageId: null,
    empty: false,
    submittedAt: 100
  }
  const receipt = { send: { prompt: { chatTranscript: proof } } }
  await appendFile(file, 'actual new user row\n')
  expect(await verifyDurableChatTranscriptReceipt(receipt)).toBe(true)
  await writeFile(file, 'rewritten historical boundary with extra bytes\n')
  expect(await verifyDurableChatTranscriptReceipt(receipt)).toBe(false)
  await writeFile(file, 'short')
  expect(await verifyDurableChatTranscriptReceipt(receipt)).toBe(false)
  await writeFile(join(dir, 'replacement'), 'original transcript boundary\nactual new user row\n')
  await rename(join(dir, 'replacement'), file)
  expect(await verifyDurableChatTranscriptReceipt(receipt)).toBe(false)
})
