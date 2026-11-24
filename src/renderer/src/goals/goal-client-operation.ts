import { createNonSecureContextUuid as createBrowserUuid } from '../../../shared/identifiers/non-secure-context-uuid'
import {
  canonicalJson,
  fingerprintPayload as fingerprint
} from '../../../shared/goals/goal-payload-fingerprint'

export { canonicalJson }

/**
 * Every mutation carries a client-minted id plus a sha256 fingerprint of its
 * payload, mirroring MutationEnvelope: a retry with the same id replays the
 * receipt, a different payload under the same id is refused.
 */
export function newClientOperationId(): string {
  return createBrowserUuid()
}

export async function fingerprintPayload(payload: unknown): Promise<string> {
  return fingerprint(payload)
}
