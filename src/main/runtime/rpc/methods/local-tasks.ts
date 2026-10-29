import {
  LocalTasksEventsAddCommentParams,
  LocalTasksEventsEditCommentParams,
  LocalTasksEventsListParams,
  LocalTasksEventsRemoveCommentParams,
  LocalTasksPreferencesGetParams,
  LocalTasksPreferencesSetParams,
  LocalTasksProjectsCreateParams,
  LocalTasksProjectsRemoveParams,
  LocalTasksProjectsUpdateParams,
  LocalTasksStatusesRemoveParams,
  LocalTasksStatusesReorderParams,
  LocalTasksStatusesUpsertParams,
  LocalTasksTasksBatchUpdateParams,
  LocalTasksTasksCreateParams,
  LocalTasksTasksCreateSubtasksParams,
  LocalTasksTasksListParams,
  LocalTasksTasksMoveParams,
  LocalTasksTasksRemoveParams,
  LocalTasksTasksUpdateParams,
  LocalTasksUnsubscribeChangesParams
} from '../../../../shared/local-tasks/local-tasks-rpc-params'
import {
  cancelLocalTaskChanges,
  streamLocalTaskChanges
} from '../../../local-tasks/local-tasks-change-subscription'
import { localTasksReadiness } from '../../../local-tasks/local-tasks-readiness'
import { sourceOf } from '../../../local-tasks/local-tasks-rpc-caller'
import type { LocalTasksService } from '../../../local-tasks/local-tasks-service'
import { defineMethod, defineStreamingMethod } from '../core'
import { LOCAL_TASK_LINK_METHODS } from './local-task-link-methods'

function service(): LocalTasksService {
  return localTasksReadiness.requireService()
}

export const LOCAL_TASK_METHODS = [
  defineStreamingMethod({
    permission: 'workspace',
    name: 'localTasks.subscribeChanges',
    params: null,
    handler: (_params, context, emit) => streamLocalTaskChanges(context, emit)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.unsubscribeChanges',
    params: LocalTasksUnsubscribeChangesParams,
    handler: (params, context) => cancelLocalTaskChanges(context, params.subscriptionId)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.status',
    params: null,
    handler: () => localTasksReadiness.status()
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.projects.list',
    params: null,
    handler: () => service().listProjects()
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.projects.create',
    params: LocalTasksProjectsCreateParams,
    handler: (params) => service().createProject(params)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.projects.update',
    params: LocalTasksProjectsUpdateParams,
    handler: (params) => service().updateProject(params)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.projects.remove',
    params: LocalTasksProjectsRemoveParams,
    handler: (params) => service().removeProject(params)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.statuses.upsert',
    params: LocalTasksStatusesUpsertParams,
    handler: (params) => service().upsertStatus(params)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.statuses.reorder',
    params: LocalTasksStatusesReorderParams,
    handler: (params) => service().reorderStatuses(params)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.statuses.remove',
    params: LocalTasksStatusesRemoveParams,
    handler: (params, context) => service().removeStatus(params, sourceOf(context))
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.tasks.list',
    params: LocalTasksTasksListParams,
    handler: (params) => service().listTasks(params.projectId)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.tasks.create',
    params: LocalTasksTasksCreateParams,
    handler: (params, context) => service().createTask(params, sourceOf(context))
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.tasks.createSubtasks',
    params: LocalTasksTasksCreateSubtasksParams,
    handler: (params, context) => service().createSubtasks(params, sourceOf(context))
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.tasks.update',
    params: LocalTasksTasksUpdateParams,
    handler: (params, context) => service().updateTask(params, sourceOf(context))
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.tasks.batchUpdate',
    params: LocalTasksTasksBatchUpdateParams,
    handler: (params, context) => service().batchUpdateTasks(params, sourceOf(context))
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.tasks.move',
    params: LocalTasksTasksMoveParams,
    handler: (params, context) => service().moveTask(params, sourceOf(context))
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.tasks.remove',
    params: LocalTasksTasksRemoveParams,
    handler: (params) => service().removeTask(params)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.events.list',
    params: LocalTasksEventsListParams,
    handler: (params) => service().listEvents(params.taskId)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.events.addComment',
    params: LocalTasksEventsAddCommentParams,
    handler: (params, context) => service().addComment(params, sourceOf(context))
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.events.editComment',
    params: LocalTasksEventsEditCommentParams,
    handler: (params) => service().editComment(params)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.events.removeComment',
    params: LocalTasksEventsRemoveCommentParams,
    handler: (params) => service().removeComment(params)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.preferences.get',
    params: LocalTasksPreferencesGetParams,
    handler: (params) => service().getPreferences(params.keys)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.preferences.set',
    params: LocalTasksPreferencesSetParams,
    handler: (params) => service().setPreference(params.key, params.value)
  }),
  ...LOCAL_TASK_LINK_METHODS
]
