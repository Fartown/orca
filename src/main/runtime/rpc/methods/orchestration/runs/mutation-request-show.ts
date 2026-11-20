import { reconcileDurableChatMutationReceipt } from '../../../../../native-chat-view-recovery/durable-chat-transcript-verification'
import {
  describeMutationRequestState,
  type OrchestrationMutationRequestShowResult
} from '../../../../../../shared/orchestration/orchestration-mutation-request'
import { defineOrchestrationMethod } from '../access/orchestration-method-access'
import { RequestShowParams } from '../../../../../../shared/rpc-contract/orchestration/orchestration-runs-mutation-request-show-params'

export const ORCHESTRATION_MUTATION_REQUEST_METHODS = [
  defineOrchestrationMethod({
    name: 'orchestration.requestShow',
    access: { kind: 'reads', server: 'on', targets: { request: 'request' } },
    permission: 'workspace',
    params: RequestShowParams,
    // Observe the original request only; a verified restored-session proof may be checkpointed without sending input.
    handler: async (
      params,
      { runtime, authenticatedCallerFingerprint }
    ): Promise<OrchestrationMutationRequestShowResult> => {
      const db = runtime.getOrchestrationDb()
      // Receipt caller keys come from the paired fingerprint or the local mutation identity.
      const callerFingerprint =
        authenticatedCallerFingerprint ?? db.getOrCreateLocalMutationCallerFingerprint()
      const row = db.getMutationReceipt(callerFingerprint, params.request)
      if (!row) {
        return {
          requestId: params.request,
          state: 'absent',
          interpretation: describeMutationRequestState({
            requestId: params.request,
            state: 'absent'
          })
        }
      }
      const verification = params.verifyChatTranscript
        ? await reconcileDurableChatMutationReceipt(runtime, callerFingerprint, params.request)
        : null
      return {
        ...(params.verifyChatTranscript
          ? {
              chatTranscriptVerified: verification?.verified === true
            }
          : {}),
        requestId: params.request,
        state: row.state,
        method: row.method,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        ...(row.receipt ? { receipt: verification?.receipt ?? parseReceipt(row.receipt) } : {}),
        interpretation: describeMutationRequestState({
          requestId: params.request,
          state: row.state,
          method: row.method
        })
      }
    }
  })
]

function parseReceipt(receipt: string): unknown {
  try {
    return JSON.parse(receipt)
  } catch {
    return undefined
  }
}
