import { z } from 'zod'
import { DurableChatTranscriptBoundary } from '../../shared/native-chat-view-recovery/durable-chat-submit'
import {
  boundaryFingerprint,
  readTranscriptFileVersion
} from '../native-chat/transcript-file-version'

const Receipt = z.object({
  send: z.object({ prompt: z.object({ chatTranscript: DurableChatTranscriptBoundary }) })
})

export async function verifyDurableChatTranscriptReceipt(receipt: unknown): Promise<boolean> {
  const parsed = Receipt.safeParse(receipt)
  if (!parsed.success) {
    return false
  }
  const proof = parsed.data.send.prompt.chatTranscript
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
