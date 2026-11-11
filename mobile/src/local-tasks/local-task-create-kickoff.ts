/**
 * New task's 开工 (m8), run once the task exists and before the form hands it to its detail: link
 * the picked workspace (unless its task takes the new one as a subtask) or create a new one, then
 * open the session there, all on the library's own host (D-008). Nothing navigates away, so the
 * phone stays on the task. Free of React so every host case tests in node.
 */

import { buildLocalTaskAgentPrompt } from '../../../src/shared/local-tasks/local-task-agent-prompt'
import { localTaskKickoffPromptText } from '../../../src/shared/local-tasks/local-task-create-plan'
import type { LocalTaskWorkspaceLink } from '../../../src/shared/local-tasks/local-task-link-types'
import { suggestLocalTaskWorkspaceName } from '../../../src/shared/local-tasks/local-task-model'
import { localTaskAncestors } from '../../../src/shared/local-tasks/local-task-tree'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import type { TuiAgent } from '../../../src/shared/tui-agent'
import type { RpcClient } from '../transport/rpc-client'
import type { LocalTasksApi } from './local-tasks-api'
import type { LocalTasksCopy } from './local-tasks-copy'
import {
  openLocalTaskSession,
  startLocalTaskInNewWorkspace,
  type LocalTaskLaunchIds
} from './local-task-agent-launch'
import type { LocalTaskCreateCopy } from './local-task-create-copy'
import type { LocalTaskEndpoint } from './local-task-endpoint'
import { localTaskWriteMessage } from './local-task-failure-message'
import { readLocalTaskHostContact } from './local-task-host-contact'
import { localTaskLaunchMessage } from './local-task-launch-message'
import { sendLocalTaskWrite } from './local-task-operation-ids'
import {
  localTaskLinkParamsFor,
  type LocalTaskWorkspaceCandidate
} from './local-task-workspace-candidates'
import { localTaskWorkspaceRouteId } from './local-task-work-navigation'

/** Where the new task works; host ids are owner-relative, labels as the user knows the host. */
export type LocalTaskCreateKickoffTarget =
  | {
      kind: 'existing'
      candidate: LocalTaskWorkspaceCandidate
      /** The link of the task already working there: the session opens in it, no new link. */
      holder: LocalTaskWorkspaceLink | null
      hostLabel: string
    }
  | {
      kind: 'new'
      ownerHostId: string
      repoId: string
      /** Trimmed; empty takes the task's suggested name. */
      name: string
      hostLabel: string
    }

export type LocalTaskCreateKickoff = {
  target: LocalTaskCreateKickoffTarget
  /** Null opens no session: the workspace is linked or created, nothing else. */
  agent: TuiAgent | null
  firstLine: string
}

type Words = { copy: LocalTasksCopy; create: LocalTaskCreateCopy }

function targetHost(target: LocalTaskCreateKickoffTarget): string {
  if (target.kind === 'new') {
    return target.ownerHostId
  }
  return target.holder?.hostId ?? target.candidate.hostId
}

/**
 * Asked before the task is created: a host out of contact creates nothing, so the user can pick
 * another place or 稍后再定 instead of being left with half of what they asked for.
 */
export async function localTaskCreateKickoffBlocked(args: {
  client: RpcClient | null
  endpoint: LocalTaskEndpoint
  kickoff: LocalTaskCreateKickoff
  words: Words
}): Promise<string | null> {
  const contact = await readLocalTaskHostContact(
    args.client,
    args.endpoint,
    targetHost(args.kickoff.target)
  )
  if (contact.kind === 'in-contact') {
    return null
  }
  const { copy, create } = args.words
  return create.nothingCreated(
    contact.kind === 'out-of-contact'
      ? copy.work.hostOffline(args.kickoff.target.hostLabel)
      : copy.work.hostUnknown
  )
}

/** Runs the kickoff for a created task; what to tell the user, or null when it all went through. */
export async function kickOffCreatedLocalTask(args: {
  client: RpcClient
  capabilities: readonly string[]
  api: LocalTasksApi
  ids: LocalTaskLaunchIds
  task: LocalTask
  /** The library's tasks, for the summary of the new task's ancestors. */
  tasks: readonly LocalTask[]
  brief: boolean
  kickoff: LocalTaskCreateKickoff
  words: Words
}): Promise<string | null> {
  const { task, kickoff } = args
  const { copy, create } = args.words
  const tasksById = new Map(args.tasks.map((entry) => [entry.id, entry]))
  const prompt = {
    text: localTaskKickoffPromptText(
      kickoff.firstLine,
      buildLocalTaskAgentPrompt(task, localTaskAncestors(task, tasksById), { brief: args.brief })
    ),
    // Why always sent: a host never delivers a draft the phone started.
    delivery: 'submit' as const
  }
  const failed = (reason: string | null) =>
    reason ? create.createdNotStarted(task.ref, reason) : null
  const { target } = kickoff
  if (target.kind === 'new') {
    const outcome = await startLocalTaskInNewWorkspace({
      launchClient: args.client,
      hostCapabilities: args.capabilities,
      api: args.api,
      ids: args.ids,
      workspaceTaskId: task.id,
      sessionTaskId: task.id,
      setup: { hostId: target.ownerHostId, repoId: target.repoId, label: target.hostLabel },
      name: target.name || suggestLocalTaskWorkspaceName(task.ref, task.title),
      agent: kickoff.agent,
      prompt
    })
    return failed(localTaskLaunchMessage(copy, outcome))
  }
  let link = target.holder
  if (!link) {
    const linked = await sendLocalTaskWrite(
      args.ids.link,
      {
        taskId: task.id,
        ...localTaskLinkParamsFor(target.candidate, target.hostLabel),
        linkedVia: 'manual' as const
      },
      args.api.linkWorkspace
    )
    if (linked.kind !== 'ok') {
      return create
        .createdNotLinked(
          task.ref,
          target.candidate.displayName,
          localTaskWriteMessage(copy, linked, args.tasks) ?? ''
        )
        .trim()
    }
    link = linked.value.workspace
  }
  if (!kickoff.agent) {
    return null
  }
  const outcome = await openLocalTaskSession({
    launchClient: args.client,
    hostCapabilities: args.capabilities,
    api: args.api,
    ids: args.ids.record,
    sessionTaskId: task.id,
    workspace: { hostId: link.hostId, routeId: localTaskWorkspaceRouteId(link) ?? '' },
    agent: kickoff.agent,
    prompt
  })
  return failed(localTaskLaunchMessage(copy, outcome))
}
