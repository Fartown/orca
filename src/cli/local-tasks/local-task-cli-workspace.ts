import type { RuntimeWorktreeRecord } from '../../shared/runtime-types'
import type { HandlerContext } from '../dispatch'
import { RuntimeClientError } from '../runtime/types'
import { getOptionalWorktreeSelector, resolveCurrentWorktreeSelector } from '../selectors'

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
