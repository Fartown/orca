import { z } from 'zod'
import { parseProviderNameEvidence } from './session-name-contract'

/** Naming evidence carried beside the legacy slot fields; every boundary that copies a slot keeps it. */
export const sessionNameSlotEvidenceFields = {
  source: z.enum(['provider', 'conversation-override']).optional().catch(undefined),
  providerName: z
    .unknown()
    .transform((value) => parseProviderNameEvidence(value) ?? { kind: 'unavailable' as const })
    .optional(),
  generatedTitle: z.string().max(512).nullable().optional().catch(undefined),
  manualTitle: z.string().nullable().optional().catch(undefined)
}

export const sessionNameSlotSchema = z
  .object({
    agent: z.enum(['claude', 'codex']),
    sessionId: z.string(),
    title: z.string(),
    kind: z.enum(['named', 'fallback']).optional().catch(undefined),
    ...sessionNameSlotEvidenceFields
  })
  .nullable()
  .optional()
  .catch(undefined)
