import type { TuiAgent } from '../../../shared/tui-agent'
import { translate } from '@/i18n/i18n'
import type { LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import { useAppStore } from '@/store'
import { localTaskEndpointForHost, localTaskIdEndpoint } from './local-task-endpoints'
import { isLocalTaskHostInContact } from './local-task-host-contact'
import { isLocalTaskRowWritable, localTasksDomainStore } from './local-tasks-domain-store'
import { localTasksClient } from './local-tasks-runtime-client'
import { findLocalTaskLinkForWorkspace } from './local-task-link-selectors'
import {
  dispatchLocalTask,
  dispatchTitle,
  type LocalTaskDispatchReceipt
} from './local-task-dispatch-launch'
import type { LocalTaskDispatchCandidate } from './local-task-dispatch-candidates'

export type LocalTaskDispatchBatch = {
  parentTaskId: string | null
  receipts: LocalTaskDispatchReceipt[]
  message: string | null
}

export async function dispatchLocalTaskToWorkspaces(args: {
  targets: readonly Extract<LocalTaskDispatchCandidate, { kind: 'workspace' }>[]
  text: string
  agent: TuiAgent
  project: LocalTaskProject
}): Promise<LocalTaskDispatchBatch> {
  const domain = localTasksDomainStore.getState()
  const state = useAppStore.getState()
  const endpoint = localTaskIdEndpoint(args.project.id)
  // Why read now: a host lost since the pick must refuse before the parent is written.
  if (args.targets.some((target) => !isLocalTaskHostInContact(state, target.hostId))) {
    return {
      parentTaskId: null,
      receipts: [],
      message: translate('localTasks.dispatch.hostNotConnected', 'Host not connected')
    }
  }
  if (
    !isLocalTaskRowWritable(domain, args.project.id) ||
    args.targets.length < 2 ||
    args.targets.some(
      (target) =>
        localTaskEndpointForHost(target.hostId) !== endpoint ||
        findLocalTaskLinkForWorkspace(domain.links, {
          id: target.worktree.id,
          hostId: target.hostId,
          ...(target.worktree.instanceId ? { instanceId: target.worktree.instanceId } : {})
        }) !== null
    )
  ) {
    return {
      parentTaskId: null,
      receipts: [],
      message: translate(
        'localTasks.dispatch.chooseSameLibraryWorkspaces',
        'Choose unlinked workspaces on one task library'
      )
    }
  }
  const created = await localTasksClient.createTask({
    projectId: args.project.id,
    title: dispatchTitle(args.text),
    description: args.text,
    parentId: null
  })
  if (!created.ok) {
    return {
      parentTaskId: null,
      receipts: [],
      message: translate(
        'localTasks.dispatch.createParentTaskFailed',
        'Could not create parent task'
      )
    }
  }
  domain.upsertTasks([created.task], { created: true })
  const receipts: LocalTaskDispatchReceipt[] = []
  for (const target of args.targets) {
    const next = await dispatchLocalTask({
      target,
      text: `${args.text.trim()}\n\n${target.label}`,
      agent: args.agent,
      project: args.project,
      parentTaskId: created.task.id
    })
    receipts.push(next)
  }
  return { parentTaskId: created.task.id, receipts, message: null }
}
