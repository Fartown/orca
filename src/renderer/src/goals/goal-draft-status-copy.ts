import type { GoalAcceptanceDraft } from '../../../shared/goals/goal-acceptance-draft-contract'
import { translate } from '@/i18n/i18n'

export function goalDraftStatusLabel(
  result: Pick<GoalAcceptanceDraft, 'status' | 'phase'> | null,
  generating = false,
  hasDocument = false
): string {
  if (result?.phase === 'unverifiable') {
    return translate('goals.drafts.unverifiable', 'Task status cannot currently be confirmed')
  }
  if (result?.phase === 'stopping') {
    return translate('goals.drafts.stopping', 'Stopping generation…')
  }
  if (result?.phase === 'interrupted') {
    return translate('goals.drafts.interrupted', 'Generation interrupted · retry available')
  }
  if (result?.status === 'generating' || generating) {
    return translate('goals.drafts.generating', 'Generating acceptance document…')
  }
  if (result?.status === 'ready' || (!result && hasDocument)) {
    return translate('goals.drafts.ready', 'Ready for review')
  }
  if (result?.status === 'failed') {
    return translate('goals.drafts.failed', 'Generation failed · retry available')
  }
  if (result?.status === 'cancelled') {
    return translate('goals.drafts.stopped', 'Generation stopped')
  }
  return translate('goals.drafts.draft', 'Draft')
}
