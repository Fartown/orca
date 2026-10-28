import { translate } from '@/i18n/i18n'
import type { LocalTaskAttentionKind } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTaskSnoozePreset } from '../../../shared/local-tasks/local-task-snooze-presets'

export function localTaskAttentionKindLabel(kind: LocalTaskAttentionKind): string {
  switch (kind) {
    case 'approval':
      return translate('localTasks.needsYou.kind.approval', 'Waiting for your approval')
    case 'question':
      return translate('localTasks.needsYou.kind.question', 'Waiting for your answer')
    case 'blocked':
      return translate('localTasks.needsYou.kind.blocked', 'Blocked')
    case 'unread-done':
      return translate('localTasks.needsYou.kind.unreadDone', 'Finished a turn you have not seen')
  }
}

export function localTaskSnoozePresetLabel(preset: LocalTaskSnoozePreset): string {
  switch (preset) {
    case 'hour':
      return translate('localTasks.needsYou.snooze.hour', 'For 1 hour')
    case 'tonight':
      return translate('localTasks.needsYou.snooze.tonight', 'Until tonight')
    case 'tomorrow':
      return translate('localTasks.needsYou.snooze.tomorrow', 'Until tomorrow')
    case 'next-week':
      return translate('localTasks.needsYou.snooze.nextWeek', 'Until next week')
  }
}
