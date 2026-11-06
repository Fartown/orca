import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { closeStructuredAgentSession } from '@/runtime/structured-agent-session-close'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import type { RuntimeTerminalClose } from '../../../shared/runtime-terminal-contracts'
import { isLocalTaskHostInContact } from './local-task-host-contact'
import { isLocalTaskRowWritable, localTasksDomainStore } from './local-tasks-domain-store'
import { localTaskEndpointForHost, localTaskEndpointTarget } from './local-task-endpoints'
import { localTasksClient } from './local-tasks-runtime-client'
import type { LocalTaskDispatchReceipt } from './local-task-dispatch-launch'
import type { LocalTaskDispatchBatch } from './local-task-dispatch-multiple'

async function stopLaunchedSession(receipt: LocalTaskDispatchReceipt): Promise<boolean> {
  if (receipt.kind !== 'launched' || !receipt.launch) {
    return false
  }
  const { hostId, worktreeId, outcome } = receipt.launch
  const state = useAppStore.getState()
  const endpoint = localTaskEndpointForHost(hostId)
  if (!endpoint || !isLocalTaskHostInContact(state, hostId)) {
    toast.error(
      translate('localTasks.dispatch.undoOffline', 'Host not connected; dispatch was not undone')
    )
    return false
  }
  const tabId =
    outcome.kind === 'structured'
      ? outcome.tabId
      : outcome.paneKey
        ? parsePaneKey(outcome.paneKey)?.tabId
        : null
  const mirrored = tabId
    ? (state.unifiedTabsByWorktree[worktreeId] ?? []).find((tab) => tab.id === tabId)
    : undefined
  try {
    if (outcome.kind === 'structured') {
      const closed = await closeStructuredAgentSession(
        localTaskEndpointTarget(endpoint),
        outcome.sessionId
      )
      if (closed !== 'closed') {
        return false
      }
    } else {
      const result = await callRuntimeRpc<{ close: RuntimeTerminalClose }>(
        localTaskEndpointTarget(endpoint),
        'terminal.close',
        {
          terminal: outcome.handle
        }
      )
      if (result?.close?.handle !== outcome.handle || result.close.ptyKilled !== true) {
        return false
      }
    }
    if (
      mirrored &&
      (useAppStore.getState().unifiedTabsByWorktree[worktreeId] ?? []).some(
        (tab) => tab.id === mirrored.id
      ) &&
      !useAppStore.getState().closeUnifiedTab(mirrored.id, { terminalRetirementHandled: true })
    ) {
      return false
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
    return false
  }
  return true
}

async function removeCreatedTasks(receipt: LocalTaskDispatchReceipt): Promise<boolean> {
  for (const taskId of receipt.createdTaskIds.toReversed()) {
    if (!isLocalTaskRowWritable(localTasksDomainStore.getState(), taskId)) {
      toast.error(
        translate('localTasks.dispatch.undoOffline', 'Host not connected; dispatch was not undone')
      )
      return false
    }
    const removed = await localTasksClient.removeTask(taskId)
    if (!removed.ok) {
      toast.error(
        translate(
          'localTasks.dispatch.undoFailed',
          'Session stopped, but the task could not be removed'
        )
      )
      return false
    }
  }
  return true
}

export async function undoLocalTaskDispatch(receipt: LocalTaskDispatchReceipt): Promise<boolean> {
  return (await stopLaunchedSession(receipt)) && (await removeCreatedTasks(receipt))
}

export function offerLocalTaskDispatchUndo(receipt: LocalTaskDispatchReceipt): void {
  if (receipt.kind !== 'launched' || !receipt.launch) {
    return
  }
  const deadline = Date.now() + 10_000
  const title = receipt.message
    ? translate('localTasks.dispatch.sessionStarted', 'Session started')
    : translate('localTasks.dispatch.started', 'Task dispatched')
  const options = {
    duration: 10_000,
    ...(receipt.message ? { description: receipt.message } : {}),
    action: {
      label: translate('localTasks.dispatch.undo', 'Undo'),
      onClick: () => {
        if (Date.now() <= deadline) {
          void undoLocalTaskDispatch(receipt)
        }
      }
    }
  }
  if (receipt.message) {
    toast.warning(title, options)
  } else {
    toast.success(title, options)
  }
}

export async function undoLocalTaskDispatchBatch(batch: LocalTaskDispatchBatch): Promise<boolean> {
  if (
    !batch.parentTaskId ||
    batch.receipts.length === 0 ||
    batch.receipts.some((receipt) => receipt.kind !== 'launched')
  ) {
    return false
  }
  for (const receipt of batch.receipts.toReversed()) {
    if (!(await stopLaunchedSession(receipt))) {
      return false
    }
  }
  for (const receipt of batch.receipts.toReversed()) {
    if (!(await removeCreatedTasks(receipt))) {
      return false
    }
  }
  if (!isLocalTaskRowWritable(localTasksDomainStore.getState(), batch.parentTaskId)) {
    return false
  }
  const removed = await localTasksClient.removeTask(batch.parentTaskId)
  return removed.ok
}

export function offerLocalTaskDispatchBatchUndo(batch: LocalTaskDispatchBatch): void {
  if (
    !batch.parentTaskId ||
    batch.receipts.length === 0 ||
    batch.receipts.some((receipt) => receipt.kind !== 'launched')
  ) {
    return
  }
  const deadline = Date.now() + 10_000
  const warning = [
    ...new Set(
      batch.receipts.map((receipt) => receipt.message).filter((message) => message !== null)
    )
  ].join('\n')
  const title = warning
    ? translate('localTasks.dispatch.sessionStarted', 'Session started')
    : translate('localTasks.dispatch.started', 'Task dispatched')
  const options = {
    duration: 10_000,
    ...(warning ? { description: warning } : {}),
    action: {
      label: translate('localTasks.dispatch.undo', 'Undo'),
      onClick: () => {
        if (Date.now() <= deadline) {
          void undoLocalTaskDispatchBatch(batch)
        }
      }
    }
  }
  if (warning) {
    toast.warning(title, options)
  } else {
    toast.success(title, options)
  }
}
