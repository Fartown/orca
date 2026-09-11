import type {
  AiVaultSessionTitle,
  AiVaultSessionTitlesResult
} from '../../../shared/ai-vault-session-title'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { projectSessionNameSlot } from '../../../shared/session-names/session-name-slot'

export type SessionNameRequest = {
  executionHostId: ExecutionHostId
  agent: AiVaultSessionTitle['agent']
  sessionId: string
  transcriptPath?: string
}
export type PendingSessionNameRead = SessionNameRequest & {
  done: () => void
  promise: Promise<void>
  epoch: number
  result: Promise<AiVaultSessionTitlesResult>
  settleResult: (result: AiVaultSessionTitlesResult) => void
}

export function createPendingSessionNameRead(
  request: SessionNameRequest,
  epoch: number
): PendingSessionNameRead {
  let done!: () => void
  const promise = new Promise<void>((resolve) => {
    done = resolve
  })
  let settleResult!: PendingSessionNameRead['settleResult']
  const result = new Promise<AiVaultSessionTitlesResult>((resolve) => {
    settleResult = resolve
  })
  return { ...request, epoch, done, promise, result, settleResult }
}

export function createSessionNameReadSnapshot(dependencies: {
  getEpoch: () => number
  getRecord: (request: SessionNameRequest) => AiVaultSessionTitle | undefined
  getInFlight: (request: SessionNameRequest) => PendingSessionNameRead | undefined
  read: (requests: readonly SessionNameRequest[]) => Promise<void>
}) {
  return async function readSnapshot(
    request: SessionNameRequest
  ): Promise<AiVaultSessionTitle | undefined> {
    const existing = dependencies.getInFlight(request)
    const startedEpoch = dependencies.getEpoch()
    if (existing && request.transcriptPath && existing.transcriptPath !== request.transcriptPath) {
      await existing.promise
      return startedEpoch === dependencies.getEpoch() ? readSnapshot(request) : undefined
    }
    const previous = dependencies.getRecord(request)
    void dependencies.read([request])
    const active = dependencies.getInFlight(request)
    if (!active) {
      return previous
    }
    // Event snapshots own the read result, not a later pane's cache projection.
    const result = await active.result
    if (startedEpoch !== dependencies.getEpoch()) {
      return undefined
    }
    return (
      projectSessionNameSlot({
        agent: request.agent,
        sessionId: request.sessionId,
        previous,
        title: result.titles.find(
          (item) => item.agent === request.agent && item.sessionId === request.sessionId
        ),
        evidence: result.nameEvidence?.find(
          (item) => item.agent === request.agent && item.sessionId === request.sessionId
        ),
        manualTitle: null
      }) ?? undefined
    )
  }
}
