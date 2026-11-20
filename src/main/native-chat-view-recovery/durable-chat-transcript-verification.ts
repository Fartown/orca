import { z } from 'zod'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { DurableChatTranscriptBoundary } from '../../shared/native-chat-view-recovery/durable-chat-submit'
import {
  boundaryFingerprint,
  readTranscriptFileVersion
} from '../native-chat/transcript-watching/transcript-file-version'

const Receipt = z
  .object({
    send: z
      .object({
        handle: z.string().optional(),
        prompt: z
          .object({
            processIncarnation: z.string().optional(),
            chatTranscript: DurableChatTranscriptBoundary
          })
          .passthrough()
      })
      .passthrough()
  })
  .passthrough()

export async function reconcileDurableChatMutationReceipt(
  runtime: Pick<OrcaRuntimeService, 'verifyRestoredChatProviderSession' | 'getOrchestrationDb'>,
  callerFingerprint: string,
  requestId: string
) {
  const db = runtime.getOrchestrationDb()
  const row = db.getMutationReceipt(callerFingerprint, requestId)
  if (!row?.receipt || row.method !== 'terminal.send') {
    return { verified: false, receipt: undefined }
  }
  let receipt: unknown
  try {
    receipt = JSON.parse(row.receipt)
  } catch {
    return { verified: false, receipt: undefined }
  }
  const verification = await reconcileDurableChatTranscriptReceipt(receipt, runtime)
  if (verification.upgraded && row.state === 'completed') {
    const latest = db.getMutationReceipt(callerFingerprint, requestId)
    if (latest?.state === 'completed' && latest.receipt === row.receipt) {
      db.completeMutationReceipt({
        callerFingerprint,
        requestId,
        method: row.method,
        payloadHash: row.payload_hash,
        receipt: JSON.stringify(verification.receipt)
      })
    }
  }
  return verification
}

export async function reconcileDurableChatTranscriptReceipt(
  receipt: unknown,
  runtime: Pick<OrcaRuntimeService, 'verifyRestoredChatProviderSession'>
) {
  const parsed = Receipt.safeParse(receipt)
  if (!parsed.success) {
    return { verified: false, upgraded: false, receipt }
  }
  const { send } = parsed.data
  const proof = send.prompt.chatTranscript
  const needsSession = proof.sessionUnverifiedAtSubmit && !proof.sessionVerifiedAfterSubmit
  if (needsSession) {
    if (
      !send.handle ||
      !send.prompt.processIncarnation ||
      !proof.submitPtyId ||
      !runtime.verifyRestoredChatProviderSession(
        send.handle,
        proof.submitPtyId,
        send.prompt.processIncarnation,
        proof.sessionId,
        proof.submittedAt
      )
    ) {
      return { verified: false, upgraded: false, receipt }
    }
    proof.sessionVerifiedAfterSubmit = true
  }
  const verified = await verifyDurableChatTranscriptReceipt(parsed.data)
  return { verified, upgraded: verified && !!needsSession, receipt: parsed.data }
}

export async function verifyDurableChatTranscriptReceipt(receipt: unknown): Promise<boolean> {
  const parsed = Receipt.safeParse(receipt)
  if (!parsed.success) {
    return false
  }
  const proof = parsed.data.send.prompt.chatTranscript
  if (proof.sessionUnverifiedAtSubmit && !proof.sessionVerifiedAfterSubmit) {
    return false
  }
  try {
    const before = await readTranscriptFileVersion(proof.transcriptPath)
    if (before.identity !== proof.fileIdentity || before.size < proof.afterByteOffset) {
      return false
    }
    const fingerprint = await boundaryFingerprint(proof.transcriptPath, proof.afterByteOffset)
    const after = await readTranscriptFileVersion(proof.transcriptPath)
    return (
      before.identity === after.identity &&
      after.size >= proof.afterByteOffset &&
      fingerprint === proof.boundaryFingerprint
    )
  } catch {
    return false
  }
}
