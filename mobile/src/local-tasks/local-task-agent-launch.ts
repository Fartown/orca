/**
 * Start and Open-a-session from a task, through the library host's own `agent.launch` (D-008: the
 * library, its workspaces and its sessions are on one Orca). The link is written afterwards, as its
 * own step: when that step is lost, the task simply has no link and the user links the workspace
 * again (PLAN A12). Kept free of React so every outcome tests in node.
 */

import type { AgentLaunchPrompt, AgentLaunchResult } from '../../../src/shared/agent-launch-intent'
import { classifyAgentLaunchReplayRefusal } from '../../../src/shared/agent-launch-replay-refusal'
import { withoutReservedAgentCreateFields } from '../../../src/shared/agent-launch-intent'
import type { LocalTaskSessionSurface } from '../../../src/shared/local-tasks/local-task-link-types'
import { makePaneKey, parsePaneKey } from '../../../src/shared/stable-pane-id'
import type { TuiAgent } from '../../../src/shared/tui-agent'
import {
  launchAgentInExistingWorkspace,
  reserveMobileAgentLaunch,
  type MobileAgentLaunchReservation
} from '../session/mobile-existing-agent-launch'
import { rememberMobileCreatedStructuredSession } from '../session/mobile-created-structured-sessions'
import { structuredSessionOperationId } from '../session/structured-session-operation-id'
import { readAgentLaunchSupport } from '../tasks/agent-launch-request'
import { createWorktreeWithNameRetry } from '../tasks/worktree-create-retry'
import { readNewWorktreeRuntimeCapabilities } from '../tasks/worktree-create-capability'
import { agentLaunchReplayRun } from '../tasks/mobile-workspace-create-operations'
import { sendReplayingAmbiguousDelivery } from '../tasks/replay-on-ambiguous-delivery'
import { WORKTREE_CREATE_TIMEOUT_MS } from '../tasks/workspace-create-timeout'
import type { RpcClient } from '../transport/rpc-client'
import type { LocalTasksApi, LocalTaskWriteOutcome } from './local-tasks-api'
import { sendLocalTaskWrite, type LocalTaskOperationIds } from './local-task-operation-ids'

export type LocalTaskLaunchOutcome =
  /** The agent runs and the task records it; `paneKey` opens its pane. */
  | { kind: 'done'; worktreeId: string; paneKey: string | null }
  /** The workspace is created and linked, with no agent session by choice. */
  | { kind: 'workspace-created'; worktreeId: string }
  /** Nothing started. */
  | { kind: 'failed'; message: string | null; reason: 'update-desktop' | 'refused' }
  /** It may be running; the user looks before trying again. */
  | { kind: 'unconfirmed' }
  /** A workspace-only create may have landed; inspect the workspace list before retrying. */
  | { kind: 'workspace-unconfirmed' }
  /** The workspace exists, the link was not written: no link, no session record. */
  | { kind: 'not-linked'; worktreeId: string; write: LocalTaskWriteOutcome<unknown> }
  /** The agent runs in the linked workspace, but its session is not on the task. */
  | { kind: 'session-not-recorded'; worktreeId: string; paneKey: string | null }

export type LocalTaskLaunchIds = { link: LocalTaskOperationIds; record: LocalTaskOperationIds }

type SessionTask = { taskId: string; hostId: string }

type LaunchedSession = {
  /** The ids written on the task: the host's own, which its route and status keys use too. */
  recorded: {
    surface: LocalTaskSessionSurface
    tabId?: string
    paneKey?: string
    sessionId?: string
  }
  /** The pane the phone's session screen opens on, as the host names it. */
  paneKey: string | null
}

function launchedSession(
  result: AgentLaunchResult,
  reservation: MobileAgentLaunchReservation
): LaunchedSession {
  const outcome = result.outcome
  if (outcome.kind === 'structured') {
    return {
      recorded: {
        surface: 'chat',
        sessionId: outcome.sessionId,
        ...(outcome.tabId ? { tabId: outcome.tabId } : {})
      },
      paneKey: null
    }
  }
  const paneKey = outcome.paneKey ?? makePaneKey(reservation.pane.tabId, reservation.pane.leafId)
  const tabId = parsePaneKey(paneKey)?.tabId ?? reservation.pane.tabId
  return { recorded: { surface: 'terminal', tabId, paneKey }, paneKey }
}

async function recordLaunchedSession(args: {
  api: LocalTasksApi
  ids: LocalTaskOperationIds
  task: SessionTask
  worktreeId: string
  agent: TuiAgent
  result: AgentLaunchResult
  reservation: MobileAgentLaunchReservation
  linkedVia: 'start' | 'manual'
}): Promise<LocalTaskLaunchOutcome> {
  const session = launchedSession(args.result, args.reservation)
  const write = await sendLocalTaskWrite(
    args.ids,
    {
      taskId: args.task.taskId,
      hostId: args.task.hostId,
      worktreeId: args.worktreeId,
      ...session.recorded,
      agent: args.agent,
      linkedVia: args.linkedVia
    },
    args.api.recordSession
  )
  const paneKey = session.paneKey
  return write.kind === 'ok'
    ? { kind: 'done', worktreeId: args.worktreeId, paneKey }
    : { kind: 'session-not-recorded', worktreeId: args.worktreeId, paneKey }
}

/** Start: one `agent.launchReplay` creates the workspace and starts the agent, then the links. */
export async function startLocalTaskInNewWorkspace(args: {
  /** The client for the host the workspace is created on (a server's scoped view for `runtime:`). */
  launchClient: RpcClient
  hostCapabilities: readonly string[]
  api: LocalTasksApi
  ids: LocalTaskLaunchIds
  /** The task the workspace is linked to, and the task the session is opened for. */
  workspaceTaskId: string
  sessionTaskId: string
  /** `hostId` as the library's owner names it, which the link records. */
  setup: { hostId: string; repoId: string; label: string }
  name: string
  /** Null starts no agent: the workspace is created and linked, no session recorded (REQ-009). */
  agent: TuiAgent | null
  prompt: AgentLaunchPrompt
  reservation?: MobileAgentLaunchReservation
}): Promise<LocalTaskLaunchOutcome> {
  if (args.agent === null) {
    return createLocalTaskWorkspaceOnly(args)
  }
  const agent = args.agent
  const support = readAgentLaunchSupport(args.hostCapabilities)
  if (!support || !support.replay) {
    return { kind: 'failed', message: null, reason: 'update-desktop' }
  }
  const reservation = args.reservation ?? reserveMobileAgentLaunch(agent)
  const params = {
    agent,
    operationId: structuredSessionOperationId(),
    target: {
      kind: 'create-worktree' as const,
      create: withoutReservedAgentCreateFields({
        repo: `id:${args.setup.repoId}`,
        name: args.name,
        displayName: args.name,
        displayNameKind: 'user' as const,
        setupDecision: 'inherit' as const
      })
    },
    prompt: args.prompt,
    launchSource: 'local-task',
    paneKey: makePaneKey(reservation.pane.tabId, reservation.pane.leafId),
    ...(reservation.sessionId ? { sessionId: reservation.sessionId } : {})
  }
  let sent
  try {
    sent = await sendReplayingAmbiguousDelivery(
      args.launchClient,
      () =>
        agentLaunchReplayRun.request(args.launchClient, params, {
          timeoutMs: WORKTREE_CREATE_TIMEOUT_MS
        }),
      { kind: 'durable' }
    )
  } catch {
    return { kind: 'unconfirmed' }
  }
  if (!sent.response.ok) {
    const verdict = classifyAgentLaunchReplayRefusal(sent.response.error, sent.replayed)
    if (verdict === 'unknown') {
      return { kind: 'unconfirmed' }
    }
    return verdict === 'unsupported'
      ? { kind: 'failed', message: null, reason: 'update-desktop' }
      : { kind: 'failed', message: sent.response.error.message?.trim() || null, reason: 'refused' }
  }
  let result: AgentLaunchResult
  try {
    result = agentLaunchReplayRun.interpret(sent.response)
  } catch {
    return { kind: 'unconfirmed' }
  }
  if (reservation.sessionId) {
    rememberMobileCreatedStructuredSession(reservation.sessionId, `id:${result.worktreeId}`)
  }
  const link = await sendLocalTaskWrite(
    args.ids.link,
    {
      taskId: args.workspaceTaskId,
      hostId: args.setup.hostId,
      kind: 'git-worktree' as const,
      worktreeId: result.worktreeId,
      repoId: args.setup.repoId,
      nameSnapshot: args.name,
      ...(args.setup.label ? { hostLabelSnapshot: args.setup.label } : {}),
      linkedVia: 'start' as const
    },
    args.api.linkWorkspace
  )
  if (link.kind !== 'ok') {
    return { kind: 'not-linked', worktreeId: result.worktreeId, write: link }
  }
  return recordLaunchedSession({
    api: args.api,
    ids: args.ids.record,
    task: { taskId: args.sessionTaskId, hostId: args.setup.hostId },
    worktreeId: result.worktreeId,
    agent,
    result,
    reservation,
    linkedVia: 'start'
  })
}

/**
 * Creates the workspace with no agent (REQ-009): `worktree.create` seeds a blank workspace, then the
 * task links it. No session is recorded — the user opens one later from the task.
 */
async function createLocalTaskWorkspaceOnly(args: {
  launchClient: RpcClient
  api: LocalTasksApi
  ids: LocalTaskLaunchIds
  workspaceTaskId: string
  setup: { hostId: string; repoId: string; label: string }
  name: string
}): Promise<LocalTaskLaunchOutcome> {
  let created
  try {
    const capabilities = await readNewWorktreeRuntimeCapabilities(args.launchClient)
    created = await createWorktreeWithNameRetry({
      client: args.launchClient,
      baseName: args.name,
      worktreeCreateIdempotency: capabilities.worktreeCreateIdempotency,
      buildParams: (name) => ({
        repo: `id:${args.setup.repoId}`,
        name,
        displayName: name,
        displayNameKind: 'user' as const,
        setupDecision: 'inherit' as const
      })
    })
  } catch {
    return { kind: 'workspace-unconfirmed' }
  }
  if ('error' in created) {
    return { kind: 'failed', message: created.error.trim() || null, reason: 'refused' }
  }
  const link = await sendLocalTaskWrite(
    args.ids.link,
    {
      taskId: args.workspaceTaskId,
      hostId: args.setup.hostId,
      kind: 'git-worktree' as const,
      worktreeId: created.worktreeId,
      repoId: args.setup.repoId,
      nameSnapshot: args.name,
      ...(args.setup.label ? { hostLabelSnapshot: args.setup.label } : {}),
      linkedVia: 'start' as const
    },
    args.api.linkWorkspace
  )
  if (link.kind !== 'ok') {
    return { kind: 'not-linked', worktreeId: created.worktreeId, write: link }
  }
  return { kind: 'workspace-created', worktreeId: created.worktreeId }
}

/** Open a session in the task's linked workspace, then record it on the task. */
export async function openLocalTaskSession(args: {
  launchClient: RpcClient
  hostCapabilities: readonly string[]
  api: LocalTasksApi
  ids: LocalTaskOperationIds
  sessionTaskId: string
  /** `hostId` as the library's owner names it. */
  workspace: { hostId: string; routeId: string }
  agent: TuiAgent
  prompt: AgentLaunchPrompt
}): Promise<LocalTaskLaunchOutcome> {
  const reservation = reserveMobileAgentLaunch(args.agent)
  const launched = await launchAgentInExistingWorkspace({
    client: args.launchClient,
    hostCapabilities: args.hostCapabilities,
    worktreeId: args.workspace.routeId,
    agent: args.agent,
    prompt: args.prompt,
    launchSource: 'local-task',
    reservation
  })
  switch (launched.kind) {
    case 'unsupported':
      return { kind: 'failed', message: null, reason: 'update-desktop' }
    case 'failed':
    case 'tab-closed':
      return { kind: 'failed', message: launched.message, reason: 'refused' }
    case 'unknown':
      return { kind: 'unconfirmed' }
    case 'launched':
      return recordLaunchedSession({
        api: args.api,
        ids: args.ids,
        task: { taskId: args.sessionTaskId, hostId: args.workspace.hostId },
        worktreeId: args.workspace.routeId,
        agent: args.agent,
        result: launched.result,
        reservation,
        linkedVia: 'start'
      })
  }
}
