import { GoalRpcParams } from '../../../../shared/goals/goal-control-contract'
import type { GoalControlService } from '../../../goals/goal-control-service'
import { GoalFeatureReadinessRegistry } from '../../../goals/goal-feature-readiness'
import { defineMethod, InvalidArgumentError, type RpcContext } from '../core'

export const goalFeatureReadinessRegistry = new GoalFeatureReadinessRegistry<GoalControlService>()

function service(): GoalControlService {
  return goalFeatureReadinessRegistry.requireService()
}

// First delivery: the local execution host is the only one with a driver adapter, so the
// paired-runtime second-hop rule from issues.ts is subsumed; `context` stays for when SSH hosts land.
function admitSelector(authorityExecutionHostId: string, _context: RpcContext): void {
  if (authorityExecutionHostId !== 'local') {
    throw new InvalidArgumentError('Goals are only supported on the local execution host.')
  }
}

export const GOAL_METHODS = [
  defineMethod({
    name: 'goals.status',
    params: GoalRpcParams['goals.status'],
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return goalFeatureReadinessRegistry.status()
    }
  }),
  defineMethod({
    name: 'goals.draftAcceptance',
    params: GoalRpcParams['goals.draftAcceptance'],
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().drafts.start(params)
    }
  }),
  defineMethod({
    name: 'goals.getAcceptanceDraft',
    params: GoalRpcParams['goals.getAcceptanceDraft'],
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().drafts.get(params.draftId)
    }
  }),
  defineMethod({
    name: 'goals.cancelAcceptanceDraft',
    params: GoalRpcParams['goals.cancelAcceptanceDraft'],
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().drafts.cancel(params.draftId)
    }
  }),
  defineMethod({
    name: 'goals.listEditorDrafts',
    params: GoalRpcParams['goals.listEditorDrafts'],
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().editorDrafts.list()
    }
  }),
  defineMethod({
    name: 'goals.getEditorDraft',
    params: GoalRpcParams['goals.getEditorDraft'],
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().editorDrafts.get(params.editorDraftId)
    }
  }),
  defineMethod({
    name: 'goals.saveEditorDraft',
    params: GoalRpcParams['goals.saveEditorDraft'],
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().editorDrafts.save(params)
    }
  }),
  defineMethod({
    name: 'goals.list',
    params: GoalRpcParams['goals.list'],
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().list(params)
    }
  }),
  defineMethod({
    name: 'goals.get',
    params: GoalRpcParams['goals.get'],
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().get(params.goalId)
    }
  }),
  defineMethod({
    name: 'goals.create',
    params: GoalRpcParams['goals.create'],
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().create(params)
    }
  }),
  defineMethod({
    name: 'goals.control',
    params: GoalRpcParams['goals.control'],
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().control(params)
    }
  }),
  defineMethod({
    name: 'goals.amend',
    params: GoalRpcParams['goals.amend'],
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().amend(params)
    }
  }),
  defineMethod({
    name: 'goals.rebind',
    params: GoalRpcParams['goals.rebind'],
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().rebind(params)
    }
  }),
  defineMethod({
    name: 'goals.archive',
    params: GoalRpcParams['goals.archive'],
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().archive(params)
    }
  }),
  defineMethod({
    name: 'goals.versions',
    params: GoalRpcParams['goals.versions'],
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().versions(params.goalId)
    }
  }),
  defineMethod({
    name: 'goals.adoptLegacy',
    params: GoalRpcParams['goals.adoptLegacy'],
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().adoptLegacy(params)
    }
  }),
  defineMethod({
    name: 'goals.operation',
    params: GoalRpcParams['goals.operation'],
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().operation(params.clientOperationId)
    }
  })
]
