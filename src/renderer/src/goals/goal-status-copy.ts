import type { GoalPhase, GoalSummary } from '../../../shared/goals/goal-control-contract'
import { translate } from '@/i18n/i18n'
import type { GoalRouteStatus } from './goals-domain-store'

export type GoalPhaseBadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive'

export function goalPhaseLabel(phase: GoalPhase): string {
  switch (phase) {
    case 'starting':
      return translate('goals.phase.starting', 'Starting')
    case 'executing':
      return translate('goals.phase.executing', 'Running')
    case 'verifying':
      return translate('goals.phase.verifying', 'Verifying')
    case 'waiting_user':
      return translate('goals.phase.waitingUser', 'Needs you')
    case 'idle':
      return translate('goals.phase.idle', 'Paused')
    case 'complete':
      return translate('goals.phase.complete', 'Complete')
    case 'budget_exhausted':
      return translate('goals.phase.budgetExhausted', 'Budget exhausted')
    case 'interrupted':
      return translate('goals.phase.interrupted', 'Interrupted')
  }
}

export function goalPhaseBadgeVariant(phase: GoalPhase): GoalPhaseBadgeVariant {
  switch (phase) {
    case 'complete':
      return 'default'
    case 'starting':
    case 'executing':
    case 'verifying':
      return 'secondary'
    case 'interrupted':
    case 'budget_exhausted':
      return 'destructive'
    case 'waiting_user':
    case 'idle':
      return 'outline'
  }
}

export function goalCompletionLabel(summary: Pick<GoalSummary, 'completion'>): string | null {
  switch (summary.completion) {
    case 'verified':
      return translate('goals.completion.verified', 'Independently verified')
    case 'unverified':
      return translate('goals.completion.unverified', 'Agent claimed completion; not verified')
    case 'claimed':
      return translate('goals.completion.claimed', 'Completion claimed; verifying')
    case 'not_complete':
      return null
  }
}

export function goalRouteStatusMessage(
  status: GoalRouteStatus,
  reason: string | null
): string | null {
  switch (status) {
    case 'unsupported':
      return translate('goals.status.unsupported', 'This Orca host version does not support Goals.')
    case 'offline':
      return translate('goals.status.offline', 'The host is offline.')
    case 'unavailable':
      return reason === 'driver-bundle-missing'
        ? translate(
            'goals.status.driverMissing',
            'The goal driver is not bundled with this build (run pnpm build:goal-driver).'
          )
        : translate('goals.status.unavailable', 'Goals are unavailable on this host.')
    case 'degraded':
      return translate(
        'goals.status.degraded',
        'Agent hook evidence is unavailable; turn status will be unknown.'
      )
    case 'idle':
    case 'loading':
      return translate('goals.status.checking', 'Checking Goal availability…')
    case 'ready':
      return null
  }
}

export function formatActiveMinutes(activeMs: number): string {
  return translate('goals.stats.activeMinutes', '{{value0}} min', {
    value0: Math.round(activeMs / 60_000)
  })
}
