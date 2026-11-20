import type { RuntimeWorktreeRecord } from '../../shared/worktree/catalog/runtime-worktree-contracts'
import type { HandlerContext } from '../dispatch/dispatch'
import { RuntimeClientError } from '../runtime/connection/types'
import {
  getOptionalWorktreeSelector,
  resolveCurrentWorktreeSelector
} from '../workspace-selection/workspace-selector'

export async function currentWorkspace(context: HandlerContext): Promise<RuntimeWorktreeRecord> {
  const { flags, client, cwd } = context
  const explicit = await getOptionalWorktreeSelector(flags, 'worktree', cwd, client)
  if (!explicit && client.isRemote) {
    throw new RuntimeClientError(
      'invalid_argument',
      'orca task current reads this directory’s workspace; on a paired host pass --worktree <selector>.'
    )
  }
  const selector = explicit ?? (await resolveCurrentWorktreeSelector(cwd, client))
  const { result } = await client.call<{ worktree: RuntimeWorktreeRecord }>('worktree.show', {
    worktree: selector
  })
  return result.worktree
}
