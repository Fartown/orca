import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { matchesLocalTaskQuery } from '../../../src/shared/local-tasks/local-task-grouping'
import type { RpcSendParams } from '../../../src/shared/rpc-contract/rpc-send-params'
import type { MobileSessionTab } from '../session/tabs/mobile-session-tabs'
import type { SessionTaskReceiptController } from './local-task-session-card-slot'
import { useWorkspaceExecutionHost } from '../navigation/workspace-execution-host'
import { createLocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import { LocalTaskChoiceSheet } from './local-task-choice-sheet'
import { localTaskEndpointFor } from './local-task-endpoint'
import { localTaskWriteMessage } from './local-task-failure-message'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
import { safePaneKey, useLocalTaskSessionStrip } from './use-local-task-session-strip'

export type SessionLinkRequest = {
  hostId: string
  worktreeId: string
  activeSessionTab: MobileSessionTab | null
  workspaceTaskId: string
  record: Omit<
    RpcSendParams<'localTasks.links.recordSession'>,
    'taskId' | 'linkedVia' | 'clientOperationId'
  >
}

function requestedTabPresent(
  request: SessionLinkRequest,
  visibleTabs: readonly MobileSessionTab[]
): boolean {
  const captured = request.activeSessionTab
  if (!captured) {
    return false
  }
  return visibleTabs.some((tab) => {
    if (tab.id !== captured.id || tab.type !== captured.type) {
      return false
    }
    if (tab.type === 'agent-session' && captured.type === 'agent-session') {
      return (
        request.record.surface === 'chat' &&
        tab.sessionId === captured.sessionId &&
        request.record.sessionId === tab.sessionId
      )
    }
    if (tab.type === 'terminal' && captured.type === 'terminal') {
      const tabId = tab.parentTabId ?? tab.id
      const paneKey = tab.leafId ? safePaneKey(tabId, tab.leafId) : null
      return (
        request.record.surface === 'terminal' &&
        tab.parentTabId === captured.parentTabId &&
        tab.leafId === captured.leafId &&
        request.record.tabId === tabId &&
        (request.record.paneKey ?? null) === paneKey
      )
    }
    return false
  })
}

/** The route owns this sheet, so closing the detail card cannot discard a pending choice. */
export function LocalTaskSessionLinkSheet({
  request,
  controller,
  onClose
}: {
  request: SessionLinkRequest | null
  controller: SessionTaskReceiptController
  onClose: (request: SessionLinkRequest) => void
}) {
  const lastRequest = useRef<SessionLinkRequest | null>(null)
  const currentRequest = useRef(request)
  useLayoutEffect(() => {
    currentRequest.current = request
    if (request) {
      lastRequest.current = request
    }
    return () => {
      currentRequest.current = null
    }
  }, [request])
  const shownRequest = request ?? lastRequest.current
  const copy = localTasksCopy()
  const executionHost = useWorkspaceExecutionHost()
  const endpoint = localTaskEndpointFor(executionHost)
  const snapshot = useLocalTaskSessionStrip(request?.hostId, endpoint, {
    worktreeId: request?.worktreeId ?? '',
    activeSessionTab: request?.activeSessionTab ?? null
  })
  const inventoryAuthoritative = controller.connState === 'connected' && controller.terminalsLoaded
  const sameRoute =
    request?.hostId === controller.hostId && request?.worktreeId === controller.worktreeId
  const tabPresent =
    request !== null && sameRoute && requestedTabPresent(request, controller.visibleTabs)
  const tabGone = request !== null && inventoryAuthoritative && !tabPresent
  useEffect(() => {
    if (request && tabGone) {
      onClose(request)
    }
  }, [onClose, request, tabGone])
  const currentLine = snapshot.line
  const writable = Boolean(
    request &&
    inventoryAuthoritative &&
    tabPresent &&
    snapshot.live &&
    snapshot.client &&
    !snapshot.openSession &&
    currentLine?.workspace?.taskId === request.workspaceTaskId &&
    currentLine?.workspace?.hostId === request.record.hostId
  )
  const writableRef = useRef(writable)
  useLayoutEffect(() => {
    writableRef.current = writable
    return () => {
      writableRef.current = false
    }
  }, [writable])
  const choices = writable ? (currentLine?.sessionChoices ?? []) : []
  const operation = useMemo(() => ({ request, ids: createLocalTaskOperationIds() }), [request])
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const shown = choices.filter((entry) => matchesLocalTaskQuery(entry, undefined, query))
  const linkSession = async (taskId: string) => {
    if (
      !request ||
      currentRequest.current !== request ||
      !writableRef.current ||
      !snapshot.client ||
      !choices.some((entry) => entry.id === taskId)
    ) {
      return
    }
    const outcome = await sendLocalTaskWrite(
      operation.ids,
      { ...request.record, taskId, linkedVia: 'manual' as const },
      createLocalTasksApi(snapshot.client).recordSession
    )
    if (outcome.kind === 'ok') {
      snapshot.reload()
    }
    if (currentRequest.current !== request) {
      return
    }
    setError(localTaskWriteMessage(copy, outcome, choices))
    if (outcome.kind === 'ok') {
      onClose(request)
    }
  }
  if (!shownRequest) {
    return null
  }
  return (
    <LocalTaskChoiceSheet
      visible={request !== null && !tabGone}
      title={copy.work.linkSessionTitle}
      error={error}
      message={request && !writable ? copy.work.sessionStates.unverifiable : null}
      search={
        choices.length > 1
          ? { query, placeholder: copy.searchPlaceholder, onChange: setQuery }
          : null
      }
      choices={shown.map((entry) => ({
        key: entry.id,
        label: entry.title,
        subtitle: entry.ref,
        onPress: () => void linkSession(entry.id)
      }))}
      onClose={() => onClose(shownRequest)}
    />
  )
}
