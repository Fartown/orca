import type { AuthorityExecutionHostId, AuthorityHostPartitionKey } from '../../shared/issues/types'

export function hostPartitionForExecutionHost(
  executionHostId: AuthorityExecutionHostId
): AuthorityHostPartitionKey {
  if (executionHostId === 'local' || executionHostId.startsWith('ssh:')) {
    return executionHostId
  }
  throw new Error(`Invalid authority execution host id: ${executionHostId}`)
}
