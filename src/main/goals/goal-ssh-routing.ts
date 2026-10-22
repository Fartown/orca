import type { GoalRpcResults } from '../../shared/goals/goal-control-contract'
import type { RpcContext } from '../runtime/rpc/core'
import { InvalidArgumentError } from '../runtime/rpc/core'

/** The selected runtime owns the workspace, terminals and Goal files, including SSH deployments. */
export function routeGoalRequest<T extends keyof GoalRpcResults>(
  _method: T,
  params: { authorityExecutionHostId: string },
  _context: RpcContext,
  local: () => GoalRpcResults[T] | Promise<GoalRpcResults[T]>
): GoalRpcResults[T] | Promise<GoalRpcResults[T]> {
  if (params.authorityExecutionHostId !== 'local') {
    throw new InvalidArgumentError(
      'Select the Goal host’s Orca Server connection before continuing.'
    )
  }
  return local()
}
