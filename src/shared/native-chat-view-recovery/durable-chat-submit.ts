import * as z from 'zod'
import type { NativeChatPendingSend } from '../native-chat/transcript/pending-sends/native-chat-pending-sends'

export const DURABLE_CHAT_COMPOSER_CAPABILITY = 'terminal.chat-composer.v1' as const

export const DurableChatTranscriptBoundary = z.object({
  sessionId: z.string().min(1),
  afterMessageId: z.string().nullable(),
  afterByteOffset: z.number().int().nonnegative(),
  transcriptPath: z.string().min(1).max(32768),
  fileIdentity: z.string().min(1),
  boundaryFingerprint: z.string().max(128),
  sessionUnverifiedAtSubmit: z.boolean().optional(),
  sessionVerifiedAfterSubmit: z.boolean().optional(),
  submitPtyId: z.string().min(1).optional(),
  empty: z.boolean(),
  submittedAt: z.number().finite()
})

export const DurableChatComposer = z.object({
  reconcileRestoredSession: z.boolean().optional(),
  expectedSessionId: z.string().min(1),
  clearInput: z
    .string()
    .max(128)
    .refine((value) =>
      [...value].every((character) => character === '\x0b' || character === '\x15')
    ),
  imagePaths: z.array(z.string().min(1).max(32768)).max(64),
  expectedIncarnation: z.string().min(1),
  expectedPtyId: z.string().min(1)
})

export const DurableChatPrepare = z.object({
  reconcileRestoredSession: z.boolean().optional(),
  id: z.string().uuid(),
  paneKey: z.string().min(1),
  ptyId: z.string().min(1),
  sessionId: z.string().min(1),
  text: z.string().max(16 * 1024 * 1024),
  imagePaths: z.array(z.string().min(1).max(32768)).max(64),
  clearInput: z
    .string()
    .max(128)
    .refine((value) =>
      [...value].every((character) => character === '\x0b' || character === '\x15')
    ),
  sentAt: z.number().finite(),
  afterMessageId: z.string().nullable(),
  afterMessageTimestamp: z.number().finite().nullable(),
  afterEmptyTranscriptSessionId: z.string().optional(),
  matchingOccurrence: z.number().int().positive().optional()
})

export type DurableChatPrepareArgs = z.infer<typeof DurableChatPrepare>
export const DurableChatRecord = DurableChatPrepare.extend({
  transcriptBoundary: DurableChatTranscriptBoundary.optional(),
  confirmedMessageId: z.string().optional(),
  confirmedMessageOrder: z.number().int().nonnegative().optional(),
  installationId: z.string().optional(),
  terminal: z.string().min(1),
  hostPtyId: z.string().min(1),
  processIncarnation: z.string().min(1),
  environmentId: z.string().nullable(),
  pairingRevision: z.number().optional(),
  runtimeId: z.string().min(1),
  executionHostId: z.string().min(1),
  state: z.enum([
    'prepared',
    'dispatching',
    'input_accepted',
    'unconfirmed',
    'rejected',
    'confirmed'
  ]),
  updatedAt: z.number().finite()
})
export type DurableChatSubmitRecord = z.infer<typeof DurableChatRecord>

export type DurableChatSubmitApi = {
  prepare: (args: DurableChatPrepareArgs) => Promise<DurableChatSubmitRecord>
  dispatch: (id: string) => Promise<void>
  list: (paneKey: string) => Promise<DurableChatSubmitRecord[]>
  query: (id: string) => Promise<void>
  confirm: (paneKey: string, sessionId: string, evidenceJson: string) => Promise<void>
  onChanged: (callback: () => void) => () => void
}

export function durableChatPending(record: DurableChatSubmitRecord): NativeChatPendingSend {
  return {
    ...record,
    ...(record.state === 'rejected' || record.state === 'prepared'
      ? { delivery: 'rejected' as const }
      : record.state === 'unconfirmed'
        ? { delivery: 'unconfirmed' as const }
        : {}),
    writeUnconfirmedAt: record.sentAt
  }
}

export type DurableChatSend = (args: {
  ptyId: string
  text: string
  imagePaths: string[]
  clearInput: string
}) => Promise<void>

export const DurableChatEvidence = z.object({
  id: z.string().min(1),
  transcriptOrder: z.number().int().nonnegative(),
  text: z.string(),
  imageCount: z.number().int().nonnegative()
})
export const DurableChatEvidenceList = z.array(DurableChatEvidence).max(4096)
export type DurableChatUserEvidence = z.infer<typeof DurableChatEvidence>
