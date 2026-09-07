import { Target } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { goalDomainStore } from '@/goals/goals-domain-store'
import type { CmdJQuickAction } from './quick-actions'
import type { CmdJQuickActionContext } from './quick-action-context'

function openGoalsTab(): void {
  const app = useAppStore.getState()
  app.setRightSidebarOpen(true)
  app.setRightSidebarTab('goals')
}

function availability(ctx: CmdJQuickActionContext) {
  if (ctx.runtimeMode !== 'local-desktop') {
    return { available: false, reason: 'client-action-unsupported' } as const
  }
  return { available: true } as const
}

/** Same registration shape as native-chat-split-quick-actions; no fixed keybinding. */
export function getGoalQuickActions(): CmdJQuickAction[] {
  return [
    {
      id: 'goals-new',
      kind: 'action',
      title: translate('goals.quickActions.newGoal', 'Goal: New goal…'),
      description: translate(
        'goals.quickActions.newGoalDescription',
        'Keep an agent session on a goal until it is verified.'
      ),
      icon: Target,
      verbKeywords: [
        translate('goals.quickActions.verbs.newGoal', 'new goal'),
        translate('goals.quickActions.verbs.setGoal', 'set goal')
      ],
      isAvailable: availability,
      run: async (ctx) => {
        if (!availability(ctx).available) {
          return { status: 'unavailable', reason: 'client-action-unsupported' }
        }
        openGoalsTab()
        goalDomainStore.getState().openEditor({ worktreeId: ctx.activeWorktreeId, paneKey: null })
        return { status: 'ok' }
      }
    },
    {
      id: 'goals-view',
      kind: 'action',
      title: translate('goals.quickActions.viewGoals', 'Goal: View goals'),
      description: translate('goals.quickActions.viewGoalsDescription', 'Open the Goals panel.'),
      icon: Target,
      verbKeywords: [
        translate('goals.quickActions.verbs.viewGoals', 'view goals'),
        translate('goals.quickActions.verbs.goals', 'goals')
      ],
      isAvailable: availability,
      run: async (ctx) => {
        if (!availability(ctx).available) {
          return { status: 'unavailable', reason: 'client-action-unsupported' }
        }
        openGoalsTab()
        goalDomainStore.getState().select(null)
        return { status: 'ok' }
      }
    }
  ]
}
