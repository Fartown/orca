import type { LocalTaskFailure } from '../../../../shared/local-tasks/local-task-types'
import {
  LocalTasksAttentionAcknowledgeParams,
  LocalTasksAttentionGetParams,
  LocalTasksAttentionSnoozeParams,
  LocalTasksLinksLinkWorkspaceParams,
  LocalTasksLinksListParams,
  LocalTasksLinksRecordSessionParams,
  LocalTasksLinksResolveWorkspaceParams,
  LocalTasksLinksUnlinkSessionParams,
  LocalTasksLinksUnlinkWorkspaceParams,
  LocalTasksRulesApplyPrMergedParams
} from '../../../../shared/local-tasks/local-tasks-link-rpc-params'
import type { LocalTaskExecutionService } from '../../../local-tasks/local-task-execution-service'
import { localTasksReadiness } from '../../../local-tasks/local-tasks-readiness'
import { isDesktopClientCaller, sourceOf } from '../../../local-tasks/local-tasks-rpc-caller'
import { defineMethod } from '../core'

const DESKTOP_ONLY: LocalTaskFailure = { ok: false, code: 'desktop_only' }

/**
 * Fed by what a desktop client sees (its worktree catalog, its Git platform's PR state); a phone
 * reads neither, so it never speaks for them. Any desktop, local or paired, may.
 */
export const LOCAL_TASK_DESKTOP_ONLY_METHODS: readonly string[] = [
  'localTasks.links.resolveWorkspace',
  'localTasks.rules.applyPrMerged'
]

function execution(): LocalTaskExecutionService {
  return localTasksReadiness.requireService().execution
}

export const LOCAL_TASK_LINK_METHODS = [
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.links.list',
    params: LocalTasksLinksListParams,
    handler: () => execution().listLinks()
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.links.linkWorkspace',
    params: LocalTasksLinksLinkWorkspaceParams,
    handler: (params, context) => execution().linkWorkspace(params, sourceOf(context))
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.links.resolveWorkspace',
    params: LocalTasksLinksResolveWorkspaceParams,
    handler: (params, context) =>
      isDesktopClientCaller(context)
        ? execution().resolveWorkspace(params, sourceOf(context))
        : DESKTOP_ONLY
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.links.unlinkWorkspace',
    params: LocalTasksLinksUnlinkWorkspaceParams,
    handler: (params, context) => execution().unlinkWorkspace(params, sourceOf(context))
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.links.recordSession',
    params: LocalTasksLinksRecordSessionParams,
    handler: (params, context) => execution().recordSession(params, sourceOf(context))
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.links.unlinkSession',
    params: LocalTasksLinksUnlinkSessionParams,
    handler: (params, context) => execution().unlinkSession(params, sourceOf(context))
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.attention.get',
    params: LocalTasksAttentionGetParams,
    handler: () => execution().getProgress()
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.attention.acknowledge',
    params: LocalTasksAttentionAcknowledgeParams,
    handler: (params) => execution().acknowledge(params)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.attention.snooze',
    params: LocalTasksAttentionSnoozeParams,
    handler: (params) => execution().snooze(params)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.rules.applyPrMerged',
    params: LocalTasksRulesApplyPrMergedParams,
    handler: (params, context) =>
      isDesktopClientCaller(context) ? execution().applyPrMerged(params) : DESKTOP_ONLY
  })
]
