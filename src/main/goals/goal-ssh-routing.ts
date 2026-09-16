import { z } from 'zod'
import type { GoalRpcResults } from '../../shared/goals/goal-control-contract'
import { GoalRpcResultSchemas } from '../../shared/goals/goal-rpc-results'
import { GoalHostFactsRequest } from '../../shared/goals/goal-host-facts'
import type { RpcContext } from '../runtime/rpc/core'
import { InvalidArgumentError } from '../runtime/rpc/core'
import { getActiveMultiplexer } from '../ssh/ssh-target-registry'
import { resolveGoalDraftWorkspace } from './goal-draft-workspace'

const resultSchemas: { [K in keyof GoalRpcResults]: z.ZodType<GoalRpcResults[K]> } =
  GoalRpcResultSchemas

export function routeGoalRequest<T extends keyof GoalRpcResults>(
  method: T,
  params: { authorityExecutionHostId: string },
  context: RpcContext,
  local: () => GoalRpcResults[T] | Promise<GoalRpcResults[T]>
): GoalRpcResults[T] | Promise<GoalRpcResults[T]> {
  if (params.authorityExecutionHostId === 'local') {
    return local()
  }
  if (context.clientKind === 'runtime' && context.pairedDeviceId !== undefined) {
    throw new InvalidArgumentError('A paired runtime cannot route Goals through a second SSH host.')
  }
  const authority = z
    .string()
    .regex(/^ssh:[^\s]+$/)
    .parse(params.authorityExecutionHostId)
  const mux = getActiveMultiplexer(authority.slice(4))
  if (!mux) {
    throw new Error('The Goal execution host is disconnected; its work is unverifiable.')
  }
  // Re-resolve on every call: a reconnected provider has a different multiplexer.
  mux.onRequest('goals.hostFacts', async (raw) => {
    const request = GoalHostFactsRequest.parse(raw)
    if (request.kind === 'terminal') {
      const terminal = await context.runtime.showTerminal(request.handle)
      if (terminal.executionHostId !== authority) {
        throw new InvalidArgumentError('The terminal belongs to another execution host.')
      }
      return terminal
    }
    return resolveGoalDraftWorkspace(request.selector, {
      executionHostId: authority,
      checkDirectory: false,
      getFolderWorkspaces: () => context.runtime.listFolderWorkspaces(),
      getRepos: () => context.runtime.listRepos(),
      getProjectGroups: () => context.runtime.listProjectGroups(),
      showWorktree: (selector) => context.runtime.showManagedWorktree(selector)
    })
  })
  return mux.request(method, params).then((result) => resultSchemas[method].parse(result))
}
