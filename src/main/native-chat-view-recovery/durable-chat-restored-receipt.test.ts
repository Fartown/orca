import '../runtime/rpc/dispatch/testing/unused-default-rpc-methods.test-fixture'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../runtime/orca-runtime'
import { OrchestrationDb } from '../runtime/orchestration/db/orchestration-db'
import { RpcDispatcher } from '../runtime/rpc/dispatcher'
import { ORCHESTRATION_MUTATION_REQUEST_METHODS } from '../runtime/rpc/methods/orchestration/runs/mutation-request-show'
import {
  readTranscriptFileVersion,
  boundaryFingerprint
} from '../native-chat/transcript-watching/transcript-file-version'

it('checkpoints restored provider proof on the original caller receipt and retains it after host state disappears', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'orca-restored-ledger-'))
  const db = new OrchestrationDb(':memory:')
  try {
    const file = join(directory, 'session.jsonl')
    await writeFile(file, 'original boundary\n')
    const version = await readTranscriptFileVersion(file)
    const runtime = new OrcaRuntimeService(null)
    runtime.setOrchestrationDb(db)
    const verify = vi.spyOn(runtime, 'verifyRestoredChatProviderSession').mockReturnValue(true)
    const callerFingerprint = db.getOrCreateLocalMutationCallerFingerprint()
    const mutation = {
      callerFingerprint,
      requestId: 'original-request',
      method: 'terminal.send',
      payloadHash: 'original-hash'
    }
    db.beginMutationReceipt(mutation)
    db.completeMutationReceipt({
      ...mutation,
      receipt: JSON.stringify({
        send: {
          handle: 'term',
          accepted: true,
          prompt: {
            requestId: mutation.requestId,
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
              submitPtyId: 'pty'
            }
          }
        }
      })
    })
    const dispatcher = new RpcDispatcher({
      runtime,
      methods: ORCHESTRATION_MUTATION_REQUEST_METHODS
    })
    const query = {
      id: 'query',
      authToken: 'token',
      method: 'orchestration.requestShow',
      params: { request: mutation.requestId, verifyChatTranscript: true }
    }
    expect(await dispatcher.dispatch(query)).toMatchObject({
      ok: true,
      result: {
        chatTranscriptVerified: true,
        receipt: {
          send: {
            accepted: true,
            prompt: {
              requestId: mutation.requestId,
              chatTranscript: { sessionVerifiedAfterSubmit: true }
            }
          }
        }
      }
    })
    verify.mockClear().mockReturnValue(false)
    expect(await dispatcher.dispatch(query)).toMatchObject({
      ok: true,
      result: { chatTranscriptVerified: true }
    })
    expect(verify).not.toHaveBeenCalled()
    expect(
      JSON.parse(db.getMutationReceipt(callerFingerprint, mutation.requestId)!.receipt!)
    ).toMatchObject({ send: { prompt: { chatTranscript: { sessionVerifiedAfterSubmit: true } } } })
  } finally {
    db.close()
    await rm(directory, { recursive: true, force: true })
  }
})
