import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { AgentLaunchResult } from '../../../shared/agent-launch-intent'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import type { LocalTaskDispatchReceipt } from './local-task-dispatch-launch'
import {
  chatSessionIds,
  recordLocalTaskSession,
  type LocalTaskSessionTarget
} from './local-task-session-recording'
import { revealLocalTaskSession } from './local-task-session-reveal'
import { linkLocalTaskWorkspace, type LinkableWorkspace } from './local-task-workspace-linking'

type SessionIds = Parameters<typeof recordLocalTaskSession>[1]

/** What a session that already started still needs written down under its task. */
export type LocalTaskDispatchRecord = {
  /** A workspace the launch created that is not linked yet; null once it is. */
  workspace: { worktree: LinkableWorkspace; hostId: ExecutionHostId } | null
  session: LocalTaskSessionTarget
  ids: SessionIds
}

export function dispatchedSessionIds(outcome: AgentLaunchResult['outcome']): SessionIds {
  if (outcome.kind === 'structured') {
    return chatSessionIds(outcome.tabId ?? null, outcome.sessionId)
  }
  return {
    surface: 'terminal',
    paneKey: outcome.paneKey ?? undefined,
    tabId: outcome.paneKey ? parsePaneKey(outcome.paneKey)?.tabId : undefined
  }
}

/** Links the new workspace, then records the session; stops at the first write that fails. */
export async function recordDispatchedWork(
  record: LocalTaskDispatchRecord
): Promise<
  { recorded: true } | { recorded: false; record: LocalTaskDispatchRecord; message: string }
> {
  if (record.workspace) {
    const linked = await linkLocalTaskWorkspace(useAppStore.getState(), {
      taskId: record.session.taskId,
      worktree: record.workspace.worktree,
      hostId: record.workspace.hostId,
      linkedVia: 'start'
    })
    if (!linked) {
      return {
        recorded: false,
        record,
        message: translate(
          'localTasks.dispatch.createdWorkspaceLinkFailed',
          'Workspace created but could not be linked'
        )
      }
    }
  }
  const pending = { ...record, workspace: null }
  if (!(await recordLocalTaskSession(pending.session, pending.ids))) {
    return {
      recorded: false,
      record: pending,
      message: translate(
        'localTasks.dispatch.sessionLinkFailed',
        'Session started but could not be linked'
      )
    }
  }
  return { recorded: true }
}

/** The receipt of a launch that went out: launched once recorded, else what is left to record. */
export async function settleDispatchLaunch(
  receipt: Pick<LocalTaskDispatchReceipt, 'taskId' | 'createdTaskIds' | 'target' | 'text'>,
  result: AgentLaunchResult,
  record: LocalTaskDispatchRecord
): Promise<LocalTaskDispatchReceipt> {
  const launch = {
    hostId: record.session.hostId,
    worktreeId: result.worktreeId,
    outcome: result.outcome
  }
  const recorded = await recordDispatchedWork(record)
  if (!recorded.recorded) {
    return {
      ...receipt,
      kind: 'unrecorded',
      message: recorded.message,
      launch,
      record: recorded.record
    }
  }
  return {
    ...receipt,
    kind: 'launched',
    message:
      result.prompt?.outcome === 'not-delivered'
        ? translate(
            'localTasks.dispatch.promptNotDelivered',
            'Session started but prompt was not delivered'
          )
        : (result.warning ?? null),
    launch
  }
}

/** The receipt once a started session's record is written: Record again never launches again. */
export async function finishLocalTaskDispatchRecord(
  receipt: LocalTaskDispatchReceipt
): Promise<LocalTaskDispatchReceipt> {
  if (receipt.kind !== 'unrecorded' || !receipt.record) {
    return receipt
  }
  const result = await recordDispatchedWork(receipt.record)
  if (!result.recorded) {
    return { ...receipt, record: result.record, message: result.message }
  }
  return {
    kind: 'launched',
    taskId: receipt.taskId,
    createdTaskIds: receipt.createdTaskIds,
    target: receipt.target,
    text: receipt.text,
    message: null,
    ...(receipt.launch ? { launch: receipt.launch } : {})
  }
}

/** Shows the started session though the task does not list it yet. */
export function revealDispatchedSession(receipt: LocalTaskDispatchReceipt): boolean {
  const record = receipt.record
  if (!record) {
    return false
  }
  const link: LocalTaskSessionLink = {
    id: '',
    taskId: record.session.taskId,
    hostId: record.session.hostId,
    worktreeId: record.session.worktreeId,
    instanceId: record.session.instanceId,
    surface: record.ids.surface,
    tabId: record.ids.tabId ?? null,
    paneKey: record.ids.paneKey ?? null,
    sessionId: record.ids.sessionId ?? null,
    providerSession: null,
    agent: record.session.agent,
    linkedVia: record.session.linkedVia,
    openedAt: 0
  }
  return revealLocalTaskSession(link)
}
