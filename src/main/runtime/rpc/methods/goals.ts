import { GoalRpcParams } from '../../../../shared/goals/goal-control-contract'
import type { GoalControlService } from '../../../goals/goal-control-service'
import { GoalFeatureReadinessRegistry } from '../../../goals/goal-feature-readiness'
import { defineMethod } from '../core'
import { routeGoalRequest } from '../../../goals/goal-ssh-routing'

export const goalFeatureReadinessRegistry = new GoalFeatureReadinessRegistry<GoalControlService>()

function service(): GoalControlService {
  return goalFeatureReadinessRegistry.requireService()
}

export const GOAL_METHODS = [
  defineMethod({
    name: 'goals.status',
    params: GoalRpcParams['goals.status'],
    handler: (params, context) =>
      routeGoalRequest('goals.status', params, context, () => goalFeatureReadinessRegistry.status())
  }),
  defineMethod({
    name: 'goals.draftAcceptance',
    params: GoalRpcParams['goals.draftAcceptance'],
    handler: (params, context) =>
      routeGoalRequest('goals.draftAcceptance', params, context, () =>
        service().drafts.start(params)
      )
  }),
  defineMethod({
    name: 'goals.getAcceptanceDraft',
    params: GoalRpcParams['goals.getAcceptanceDraft'],
    handler: (params, context) =>
      routeGoalRequest('goals.getAcceptanceDraft', params, context, () =>
        service().drafts.get(params.draftId)
      )
  }),
  defineMethod({
    name: 'goals.cancelAcceptanceDraft',
    params: GoalRpcParams['goals.cancelAcceptanceDraft'],
    handler: (params, context) =>
      routeGoalRequest('goals.cancelAcceptanceDraft', params, context, () =>
        service().drafts.cancel(params.draftId)
      )
  }),
  defineMethod({
    name: 'goals.listEditorDrafts',
    params: GoalRpcParams['goals.listEditorDrafts'],
    handler: (params, context) =>
      routeGoalRequest('goals.listEditorDrafts', params, context, () =>
        service().editorDrafts.list()
      )
  }),
  defineMethod({
    name: 'goals.getEditorDraft',
    params: GoalRpcParams['goals.getEditorDraft'],
    handler: (params, context) =>
      routeGoalRequest('goals.getEditorDraft', params, context, () =>
        service().editorDrafts.get(params.editorDraftId)
      )
  }),
  defineMethod({
    name: 'goals.saveEditorDraft',
    params: GoalRpcParams['goals.saveEditorDraft'],
    handler: (params, context) =>
      routeGoalRequest('goals.saveEditorDraft', params, context, () =>
        service().editorDrafts.save(params)
      )
  }),
  defineMethod({
    name: 'goals.deleteEditorDraft',
    params: GoalRpcParams['goals.deleteEditorDraft'],
    handler: (params, context) =>
      routeGoalRequest('goals.deleteEditorDraft', params, context, () =>
        service().editorDrafts.delete(params)
      )
  }),
  defineMethod({
    name: 'goals.list',
    params: GoalRpcParams['goals.list'],
    handler: (params, context) =>
      routeGoalRequest('goals.list', params, context, () => service().list(params))
  }),
  defineMethod({
    name: 'goals.get',
    params: GoalRpcParams['goals.get'],
    handler: (params, context) =>
      routeGoalRequest('goals.get', params, context, () => service().get(params.goalId))
  }),
  defineMethod({
    name: 'goals.create',
    params: GoalRpcParams['goals.create'],
    handler: (params, context) =>
      routeGoalRequest('goals.create', params, context, () => service().create(params))
  }),
  defineMethod({
    name: 'goals.control',
    params: GoalRpcParams['goals.control'],
    handler: (params, context) =>
      routeGoalRequest('goals.control', params, context, () => service().control(params))
  }),
  defineMethod({
    name: 'goals.amend',
    params: GoalRpcParams['goals.amend'],
    handler: (params, context) =>
      routeGoalRequest('goals.amend', params, context, () => service().amend(params))
  }),
  defineMethod({
    name: 'goals.rebind',
    params: GoalRpcParams['goals.rebind'],
    handler: (params, context) =>
      routeGoalRequest('goals.rebind', params, context, () => service().rebind(params))
  }),
  defineMethod({
    name: 'goals.archive',
    params: GoalRpcParams['goals.archive'],
    handler: (params, context) =>
      routeGoalRequest('goals.archive', params, context, () => service().archive(params))
  }),
  defineMethod({
    name: 'goals.versions',
    params: GoalRpcParams['goals.versions'],
    handler: (params, context) =>
      routeGoalRequest('goals.versions', params, context, () => service().versions(params.goalId))
  }),
  defineMethod({
    name: 'goals.adoptLegacy',
    params: GoalRpcParams['goals.adoptLegacy'],
    handler: (params, context) =>
      routeGoalRequest('goals.adoptLegacy', params, context, () => service().adoptLegacy(params))
  }),
  defineMethod({
    name: 'goals.operation',
    params: GoalRpcParams['goals.operation'],
    handler: (params, context) =>
      routeGoalRequest('goals.operation', params, context, () =>
        service().operation(params.clientOperationId)
      )
  })
]
