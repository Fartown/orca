import { randomV4Uuid } from '../platform/random-v4-uuid'
import type { LocalTaskWriteOutcome } from './local-tasks-api'

/**
 * One `clientOperationId` per user operation, kept across resends of that same operation.
 *
 * The desktop replays its first answer for an id it has seen, so a resend after a dropped answer
 * can never apply a write twice. The id is held only while the outcome leaves room for that doubt:
 * a definite answer (applied or refused) ends the operation, and the next submit is a new one even
 * with the same payload — "Create more" with an unchanged title is two tasks, and a refusal whose
 * cause has since gone away must be asked again rather than replayed.
 */
export type LocalTaskOperationIds = {
  idFor: (payload: unknown) => string
  settle: (payload: unknown, outcome: LocalTaskWriteOutcome<unknown>) => void
}

export function createLocalTaskOperationIds(
  newId: () => string = randomV4Uuid
): LocalTaskOperationIds {
  let held: { key: string; id: string } | null = null
  return {
    idFor(payload) {
      const key = JSON.stringify(payload)
      if (held?.key !== key) {
        // Why a changed payload is a new operation: the desktop would replay the old one's answer.
        held = { key, id: newId() }
      }
      return held.id
    },
    settle(payload, outcome) {
      if (held?.key !== JSON.stringify(payload)) {
        return
      }
      if (outcome.kind === 'ok' || outcome.kind === 'refused') {
        held = null
      }
    }
  }
}

/** Sends `payload` with the operation's id and settles the id with the outcome. */
export async function sendLocalTaskWrite<Payload extends object, Result>(
  ids: LocalTaskOperationIds,
  payload: Payload,
  send: (params: Payload & { clientOperationId: string }) => Promise<LocalTaskWriteOutcome<Result>>
): Promise<LocalTaskWriteOutcome<Result>> {
  const clientOperationId = ids.idFor(payload)
  const outcome = await send({ ...payload, clientOperationId })
  ids.settle(payload, outcome)
  return outcome
}
