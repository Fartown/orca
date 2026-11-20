import { mkdtemp, appendFile, rename, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import {
  readTranscriptFileVersion,
  boundaryFingerprint
} from '../native-chat/transcript-watching/transcript-file-version'
import {
  reconcileDurableChatTranscriptReceipt,
  verifyDurableChatTranscriptReceipt
} from './durable-chat-transcript-verification'

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

it('keeps restored input provisional until provider proof and persists that proof across repeated recovery queries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'orca-chat-restored-'))
  directories.push(dir)
  const file = join(dir, 'session.jsonl')
  await writeFile(file, 'original boundary\n')
  const version = await readTranscriptFileVersion(file)
  const receipt = {
    send: {
      handle: 'terminal',
      accepted: true,
      prompt: {
        requestId: 'original-request',
        processIncarnation: 'inc',
        stages: ['input_accepted'],
        chatTranscript: {
          sessionId: 'session',
          transcriptPath: file,
          fileIdentity: version.identity,
          afterByteOffset: version.size,
          boundaryFingerprint: await boundaryFingerprint(file, version.size),
          afterMessageId: null,
          empty: false,
          submittedAt: 100,
          sessionUnverifiedAtSubmit: true,
          submitPtyId: 'original-pty'
        }
      }
    }
  }
  const runtime = { verifyRestoredChatProviderSession: vi.fn(() => false) }
  await appendFile(file, 'new actual user\n')
  expect(await verifyDurableChatTranscriptReceipt(receipt)).toBe(false)
  expect((await reconcileDurableChatTranscriptReceipt(receipt, runtime)).verified).toBe(false)
  runtime.verifyRestoredChatProviderSession.mockReturnValue(true)
  const observed = await reconcileDurableChatTranscriptReceipt(receipt, runtime)
  expect(observed).toMatchObject({
    verified: true,
    upgraded: true,
    receipt: {
      send: {
        accepted: true,
        prompt: {
          requestId: 'original-request',
          chatTranscript: { sessionUnverifiedAtSubmit: true, sessionVerifiedAfterSubmit: true }
        }
      }
    }
  })
  expect(runtime.verifyRestoredChatProviderSession).toHaveBeenLastCalledWith(
    'terminal',
    'original-pty',
    'inc',
    'session',
    100
  )
  runtime.verifyRestoredChatProviderSession.mockClear().mockReturnValue(false)
  expect(await reconcileDurableChatTranscriptReceipt(observed.receipt, runtime)).toMatchObject({
    verified: true,
    upgraded: false
  })
  expect(runtime.verifyRestoredChatProviderSession).not.toHaveBeenCalled()
  expect(receipt.send.prompt.chatTranscript).not.toHaveProperty('sessionVerifiedAfterSubmit')
  await writeFile(file, 'short')
  expect((await reconcileDurableChatTranscriptReceipt(observed.receipt, runtime)).verified).toBe(
    false
  )
})
