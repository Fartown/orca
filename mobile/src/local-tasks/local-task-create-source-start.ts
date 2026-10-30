/**
 * Create From → Local on the phone's new-workspace sheet: the same Start the task page runs
 * (`startLocalTaskInNewWorkspace`), with the sheet's agent, setup choice and note, the task sent
 * as the agent's first message, and the link written into the library of the Orca that owns the
 * new workspace (D-008), the one "Link to Task…" writes for that workspace too. Free of React so
 * every host case tests in node.
 */

import { getRepoExecutionHostId } from '../../../src/shared/execution-host'
import { buildLocalTaskAgentPrompt } from '../../../src/shared/local-tasks/local-task-agent-prompt'
import { suggestLocalTaskWorkspaceName } from '../../../src/shared/local-tasks/local-task-model'
import { localTaskAncestors } from '../../../src/shared/local-tasks/local-task-tree'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import type { TuiAgent } from '../../../src/shared/tui-agent'
import type { WorkspaceCreateSetupDecision } from '../tasks/workspace-create-params'
import type { WorktreeCreateResult } from '../tasks/worktree-create-retry'
import type { RpcClient } from '../transport/rpc-client'
import { createLocalTasksApi } from './local-tasks-api'
import type { LocalTasksCopy } from './local-tasks-copy'
import { startLocalTaskInNewWorkspace, type LocalTaskLaunchIds } from './local-task-agent-launch'
import {
  localTaskEndpointFor,
  localTaskOwnerHostId,
  type LocalTaskEndpoint
} from './local-task-endpoint'
import { localTaskLaunchMessage } from './local-task-launch-message'

/**
 * Whose library links a repo's new workspace, and the host as that library names it:
 * - the paired Orca's own machine: its library, `local`;
 * - an SSH target it reaches over its relay: still its library, `ssh:{target}`;
 * - a paired server, or an SSH host whose orcad runs it (`runtime:{env}` to the phone): that
 *   Orca's own library, `local`.
 * Null for a repo no library here can own.
 */
export function localTaskCreateOwner(repo: {
  connectionId?: string | null
  executionHostId?: string | null
}): { endpoint: LocalTaskEndpoint; ownerHostId: string } | null {
  const clientHostId = getRepoExecutionHostId(repo)
  const endpoint = localTaskEndpointFor(clientHostId)
  const ownerHostId = localTaskOwnerHostId(endpoint, clientHostId)
  return ownerHostId === null ? null : { endpoint, ownerHostId }
}

/** What the sheet chose, as its own create reads it. */
export type LocalTaskCreateRequest = {
  /** The typed name, trimmed; empty takes the task's suggested name. */
  name: string
  agent: TuiAgent | null
  setupDecision: WorkspaceCreateSetupDecision
  note: string | undefined
}

export type LocalTaskCreateRun = (request: LocalTaskCreateRequest) => Promise<WorktreeCreateResult>

export async function createLocalTaskSourcedWorkspace(args: {
  /** The workspace host's Orca, which also holds the library: the paired one or a server's view. */
  client: RpcClient
  capabilities: readonly string[]
  ids: LocalTaskLaunchIds
  task: LocalTask
  /** The library's tasks when the task was picked, for its ancestors' summary. */
  tasks: readonly LocalTask[]
  repoId: string
  ownerHostId: string
  hostLabel: string
  request: LocalTaskCreateRequest
  copy: LocalTasksCopy
}): Promise<WorktreeCreateResult> {
  const { task, request } = args
  const name = request.name || suggestLocalTaskWorkspaceName(task.ref, task.title)
  const tasksById = new Map(args.tasks.map((candidate) => [candidate.id, candidate]))
  const outcome = await startLocalTaskInNewWorkspace({
    launchClient: args.client,
    hostCapabilities: args.capabilities,
    api: createLocalTasksApi(args.client),
    ids: args.ids,
    workspaceTaskId: task.id,
    sessionTaskId: task.id,
    setup: { hostId: args.ownerHostId, repoId: args.repoId, label: args.hostLabel },
    name,
    agent: request.agent,
    // Why submit, unlike the desktop's draft: a host never delivers a draft (REQ-017, 2026-10-30).
    prompt: {
      text: buildLocalTaskAgentPrompt(task, localTaskAncestors(task, tasksById)),
      delivery: 'submit'
    },
    choices: {
      setupDecision: request.setupDecision,
      ...(request.note ? { comment: request.note } : {})
    }
  })
  const message = localTaskLaunchMessage(args.copy, outcome)
  switch (outcome.kind) {
    case 'workspace-created':
      return { worktreeId: outcome.worktreeId, name }
    case 'done':
    case 'not-linked':
    case 'session-not-recorded':
      // The workspace exists: open it, and say what did not reach the task.
      return { worktreeId: outcome.worktreeId, name, ...(message ? { warning: message } : {}) }
    case 'failed':
    case 'unconfirmed':
    case 'workspace-unconfirmed':
      return { error: message ?? args.copy.failureGeneric('agent.launch') }
  }
}
