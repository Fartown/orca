import { z } from 'zod'
import { defineRpcOperation } from '../transport/rpc-operation'
import { rpcResultVariant } from '../transport/rpc-operation-result-reader'

/** Why `object-result-or-null` for both: a refusal is a legitimate answer here — the host may
 *  have closed the terminal between the create and the wait — and the delivery turns it into a
 *  reported outcome rather than a thrown error. */

const WaitSchema = z.object({
  wait: z
    .object({
      satisfied: z.boolean().optional(),
      status: z.string().optional(),
      blockedReason: z.string().optional()
    })
    .optional()
})

const SendSchema = z.object({
  send: z.object({ accepted: z.boolean().optional() }).optional()
})

export const continuationTerminalWaitOperation = defineRpcOperation({
  name: 'sessionContinuation.waitForTuiIdle',
  method: 'terminal.wait',
  acceptance: 'object-result-or-null',
  // The delivery reads this reply before it sends, so it cannot be parked behind another
  // request's barrier.
  barrier: 'on-settle',
  read: rpcResultVariant('wait', WaitSchema)
})

export const continuationTerminalSendOperation = defineRpcOperation({
  name: 'sessionContinuation.sendHandoffPrompt',
  method: 'terminal.send',
  acceptance: 'object-result-or-null',
  barrier: 'on-settle',
  read: rpcResultVariant('send', SendSchema)
})
