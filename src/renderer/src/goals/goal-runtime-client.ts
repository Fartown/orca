import {
  GoalAcceptanceDraftResult,
  type GoalAcceptanceDraft
} from '../../../shared/goals/goal-acceptance-draft-contract'
import type { z } from 'zod'
import type {
  GoalAdoptLegacyParams,
  GoalAmendParams,
  GoalArchiveParams,
  GoalControlParams,
  GoalCreateParams,
  GoalDraftAcceptanceParams,
  GoalDetail,
  GoalListParams,
  GoalOperation,
  GoalRebindParams,
  GoalSpecRevision,
  GoalStatus,
  GoalSummary
} from '../../../shared/goals/goal-control-contract'
import {
  GoalDetailResult,
  GoalListResult,
  GoalOperationResult,
  GoalStatusResult,
  GoalVersionsResult
} from '../../../shared/goals/goal-rpc-results'
import { callRuntimeRpc } from '../runtime/runtime-rpc-client'
import type { RuntimeClientTarget } from '../runtime/runtime-client-target'

export class GoalRuntimeUnsupportedError extends Error {
  readonly code = 'goal_runtime_unsupported'

  constructor(method?: string) {
    super(
      method?.includes('Acceptance')
        ? 'This Orca host version does not support acceptance document generation.'
        : 'This Orca host version does not support Goals.'
    )
    this.name = 'GoalRuntimeUnsupportedError'
  }
}

type HostScopedParams<T> = Omit<T, 'authorityExecutionHostId'>

/**
 * Typed facade over the goals.* RPC, same shape as IssueRuntimeClient. The
 * first delivery only routes to the local execution host.
 */
export class GoalRuntimeClient {
  private readonly target: RuntimeClientTarget = { kind: 'local' }

  status(): Promise<GoalStatus> {
    return this.call('goals.status', {}, GoalStatusResult)
  }

  draftAcceptance(
    params: HostScopedParams<GoalDraftAcceptanceParams>
  ): Promise<GoalAcceptanceDraft> {
    return this.call('goals.draftAcceptance', params, GoalAcceptanceDraftResult)
  }

  getAcceptanceDraft(draftId: string): Promise<GoalAcceptanceDraft | null> {
    return this.call('goals.getAcceptanceDraft', { draftId }, GoalAcceptanceDraftResult.nullable())
  }

  cancelAcceptanceDraft(draftId: string): Promise<GoalAcceptanceDraft | null> {
    return this.call(
      'goals.cancelAcceptanceDraft',
      { draftId },
      GoalAcceptanceDraftResult.nullable()
    )
  }

  list(
    params: HostScopedParams<GoalListParams>
  ): Promise<{ items: GoalSummary[]; observedAt: number }> {
    return this.call('goals.list', params, GoalListResult) as Promise<{
      items: GoalSummary[]
      observedAt: number
    }>
  }

  async get(goalId: string): Promise<GoalDetail | null> {
    const result = await this.callRaw('goals.get', { goalId })
    return result === null ? null : (GoalDetailResult.parse(result) as GoalDetail)
  }

  create(params: HostScopedParams<GoalCreateParams>): Promise<GoalOperation> {
    return this.call('goals.create', params, GoalOperationResult)
  }

  control(params: HostScopedParams<GoalControlParams>): Promise<GoalOperation> {
    return this.call('goals.control', params, GoalOperationResult)
  }

  amend(params: HostScopedParams<GoalAmendParams>): Promise<GoalOperation> {
    return this.call('goals.amend', params, GoalOperationResult)
  }

  rebind(params: HostScopedParams<GoalRebindParams>): Promise<GoalOperation> {
    return this.call('goals.rebind', params, GoalOperationResult)
  }

  archive(params: HostScopedParams<GoalArchiveParams>): Promise<GoalOperation> {
    return this.call('goals.archive', params, GoalOperationResult)
  }

  adoptLegacy(params: HostScopedParams<GoalAdoptLegacyParams>): Promise<GoalOperation> {
    return this.call('goals.adoptLegacy', params, GoalOperationResult)
  }

  async versions(goalId: string): Promise<GoalSpecRevision[]> {
    return (await this.call('goals.versions', { goalId }, GoalVersionsResult)).items
  }

  async operation(clientOperationId: string): Promise<GoalOperation | null> {
    const result = await this.callRaw('goals.operation', { clientOperationId })
    return result === null ? null : GoalOperationResult.parse(result)
  }

  private async call<TSchema extends z.ZodType>(
    method: string,
    params: Record<string, unknown>,
    schema: TSchema
  ): Promise<z.infer<TSchema>> {
    return schema.parse(await this.callRaw(method, params))
  }

  private async callRaw(method: string, params: Record<string, unknown>): Promise<unknown> {
    try {
      return await callRuntimeRpc<unknown>(this.target, method, {
        ...params,
        authorityExecutionHostId: 'local'
      })
    } catch (error) {
      if (isMethodNotFound(error)) {
        throw new GoalRuntimeUnsupportedError(method)
      }
      throw error
    }
  }
}

export const goalRuntimeClient = new GoalRuntimeClient()

function isMethodNotFound(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code
  const message = error instanceof Error ? error.message : ''
  return code === 'method_not_found' || /method[_ ]not[_ ]found|unknown method/i.test(message)
}
