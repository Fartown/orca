import type {
  AuthorityExecutionHostId,
  AuthorityHostPartitionKey,
  IssueAuthorityDescriptor
} from '../../shared/issues/types'
import type { IssueDatabase } from './issue-database'
import { IssueRepositoryError } from './issue-repository-error'

export type IssueAuthorityRoute = {
  hostPartitionKey: AuthorityHostPartitionKey
  authorityExecutionHostId: AuthorityExecutionHostId
}

export type ManagedSshTargetResolver = {
  hasTarget(targetId: string): boolean
}

export function resolveIssueAuthorityRoute(
  authorityExecutionHostId: AuthorityExecutionHostId,
  managedSshTargets?: ManagedSshTargetResolver
): IssueAuthorityRoute {
  if (authorityExecutionHostId === 'local') {
    return { hostPartitionKey: 'local', authorityExecutionHostId: 'local' }
  }
  const encodedTargetId = authorityExecutionHostId.slice('ssh:'.length)
  let targetId: string
  try {
    targetId = decodeURIComponent(encodedTargetId)
  } catch {
    throw invalidRoute(authorityExecutionHostId)
  }
  if (!targetId || (managedSshTargets && !managedSshTargets.hasTarget(targetId))) {
    throw invalidRoute(authorityExecutionHostId)
  }
  return {
    hostPartitionKey: authorityExecutionHostId,
    authorityExecutionHostId
  }
}

export function issueAuthorityDescriptor(
  database: IssueDatabase,
  route: IssueAuthorityRoute,
  profileLabel?: string
): IssueAuthorityDescriptor {
  return {
    authorityId: database.getAuthorityId(),
    hostPartitionKey: route.hostPartitionKey,
    authorityExecutionHostId: route.authorityExecutionHostId,
    ...(profileLabel ? { profileLabel } : {})
  }
}

function invalidRoute(value: string): IssueRepositoryError {
  return new IssueRepositoryError(
    'issue_route_invalid',
    `Issue authority route ${value} is not managed by this runtime.`
  )
}
