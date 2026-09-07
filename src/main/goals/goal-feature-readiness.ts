import type { GoalStatus } from '../../shared/goals/goal-control-contract'

export const GOAL_FEATURE_UNAVAILABLE_CODE = 'goal_feature_unavailable'

export type GoalFeatureReadinessInput = {
  driverEntry: 'ready' | 'missing'
  hookEvidence: 'ready' | 'disabled' | 'failed'
}

export class GoalFeatureUnavailableError extends Error {
  readonly code = GOAL_FEATURE_UNAVAILABLE_CODE

  constructor(readonly status: GoalStatus) {
    super('Goal feature is unavailable.')
    this.name = 'GoalFeatureUnavailableError'
  }
}

/**
 * Same shape as the Issues readiness registry: `goals.status` stays answerable
 * while the service is absent, and every other method fails with one code.
 */
export class GoalFeatureReadinessRegistry<TService> {
  private service: TService | null = null
  private current: GoalStatus = unavailable('service-not-started')

  register(service: TService, input: GoalFeatureReadinessInput): () => void {
    this.service = service
    this.current = readinessFor(input)
    return () => {
      if (this.service === service) {
        this.service = null
        this.current = unavailable('service-stopped')
      }
    }
  }

  setUnavailable(reason: string): void {
    this.service = null
    this.current = unavailable(reason)
  }

  status(): GoalStatus {
    return this.current
  }

  requireService(): TService {
    if (!this.service || this.current.status === 'unavailable') {
      throw new GoalFeatureUnavailableError(this.current)
    }
    return this.service
  }
}

function readinessFor(input: GoalFeatureReadinessInput): GoalStatus {
  if (input.driverEntry === 'missing') {
    return unavailable('driver-bundle-missing')
  }
  return {
    status: input.hookEvidence === 'ready' ? 'ready' : 'degraded',
    reason:
      input.hookEvidence === 'ready'
        ? null
        : input.hookEvidence === 'disabled'
          ? 'hook-disabled'
          : 'hook-start-failed',
    supports: SUPPORTS
  }
}

function unavailable(reason: string): GoalStatus {
  return { status: 'unavailable', reason, supports: SUPPORTS }
}

// First delivery: local interactive terminals only.
const SUPPORTS: GoalStatus['supports'] = {
  localTerminal: true,
  structured: false,
  ssh: false,
  wsl: false
}
