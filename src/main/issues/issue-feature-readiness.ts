import type {
  AuthorityExecutionHostId,
  IssueAuthorityDescriptor,
  IssueFeatureReadiness
} from '../../shared/issues/types'

export type IssueRuntimeServiceContract = {
  authorityDescriptor(executionHostId: AuthorityExecutionHostId): IssueAuthorityDescriptor
}

export type IssueFeatureStatus = IssueFeatureReadiness & {
  authority: IssueAuthorityDescriptor | null
}

export const ISSUE_FEATURE_UNAVAILABLE_CODE = 'issue_feature_unavailable'

type ReadyRegistration = {
  service: IssueRuntimeServiceContract
  readiness: IssueFeatureReadiness
}

export class IssueFeatureUnavailableError extends Error {
  readonly code = ISSUE_FEATURE_UNAVAILABLE_CODE

  constructor(readonly readiness: IssueFeatureReadiness) {
    super('Issue feature storage is unavailable.')
    this.name = 'IssueFeatureUnavailableError'
  }
}

export class IssueFeatureReadinessRegistry {
  private registration: ReadyRegistration | null = null
  private readiness: IssueFeatureReadiness = unavailableReadiness('storage-open-failed')

  register(
    service: IssueRuntimeServiceContract,
    hookEvidence: 'ready' | 'disabled' | 'failed'
  ): () => void {
    const readiness: IssueFeatureReadiness =
      hookEvidence === 'ready'
        ? { status: 'ready', storage: 'ready', hookEvidence, reason: null }
        : {
            status: 'degraded',
            storage: 'ready',
            hookEvidence,
            reason: hookEvidence === 'disabled' ? 'hook-disabled' : 'hook-start-failed'
          }
    const registration: ReadyRegistration = { service, readiness }
    this.registration = registration
    this.readiness = readiness
    return () => {
      if (this.registration === registration) {
        this.registration = null
        this.readiness = unavailableReadiness('storage-open-failed')
      }
    }
  }

  setUnavailable(
    reason: 'storage-open-failed' | 'storage-migration-failed',
    hookEvidence: IssueFeatureReadiness['hookEvidence'] = 'failed'
  ): void {
    this.registration = null
    this.readiness = unavailableReadiness(reason, hookEvidence)
  }

  status(executionHostId: AuthorityExecutionHostId): IssueFeatureStatus {
    return {
      ...this.readiness,
      authority: this.registration?.service.authorityDescriptor(executionHostId) ?? null
    }
  }

  requireService(): IssueRuntimeServiceContract {
    if (!this.registration) {
      throw new IssueFeatureUnavailableError(this.readiness)
    }
    return this.registration.service
  }
}

function unavailableReadiness(
  reason: 'storage-open-failed' | 'storage-migration-failed',
  hookEvidence: IssueFeatureReadiness['hookEvidence'] = 'failed'
): IssueFeatureReadiness {
  return {
    status: 'unavailable',
    storage: 'failed',
    hookEvidence,
    reason
  }
}

export const issueFeatureReadinessRegistry = new IssueFeatureReadinessRegistry()
