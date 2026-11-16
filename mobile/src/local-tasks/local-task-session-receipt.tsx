import { useMemo } from 'react'
import { useWorkspaceExecutionHost } from '../navigation/workspace-execution-host'
import type { SessionTaskReceiptController } from './local-task-session-card-slot'
import { localTaskEndpointFor } from './local-task-endpoint'
import { useLocalTaskSessionStrip } from './use-local-task-session-strip'
import { useAcknowledgeOpenSession } from './use-local-task-session-acknowledge'

/** Keep the current session's read receipt active while its detail card is closed. */
export function LocalTaskSessionReceipt({
  controller
}: {
  controller: SessionTaskReceiptController
}) {
  const executionHost = useWorkspaceExecutionHost()
  const endpoint = useMemo(() => localTaskEndpointFor(executionHost), [executionHost])
  const snapshot = useLocalTaskSessionStrip(controller.hostId, endpoint, {
    worktreeId: controller.worktreeId,
    activeSessionTab: controller.activeSessionTab ?? null
  })
  useAcknowledgeOpenSession(
    snapshot.live ? snapshot.client : null,
    snapshot.openSession?.id ?? null,
    snapshot.liveProgress
  )
  return null
}
