import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { GoalListFilter } from '../../../../shared/goals/goal-control-contract'
import { goalDomainStore, type GoalScope } from '@/goals/goals-domain-store'
import { goalRouteStatusMessage } from '@/goals/goal-status-copy'
import { useGoalDomainStore } from '@/goals/use-goals-domain-store'
import { GoalDetail } from './GoalDetail'
import { GoalEditor } from './GoalEditor'
import { GoalList } from './GoalList'
import { GoalRebindDialog } from './GoalRebindDialog'

const FILTERS: GoalListFilter[] = ['all', 'running', 'attention', 'history']

export default function GoalsPanel(): React.JSX.Element {
  const status = useGoalDomainStore((s) => s.status)
  const statusReason = useGoalDomainStore((s) => s.statusReason)
  const selectedGoalId = useGoalDomainStore((s) => s.selectedGoalId)
  const scope = useGoalDomainStore((s) => s.scope)
  const filter = useGoalDomainStore((s) => s.filter)
  const query = useGoalDomainStore((s) => s.query)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const statusMessage = goalRouteStatusMessage(status, statusReason)
  const canCreate = status === 'ready' || status === 'degraded'

  const openCreate = (): void => {
    goalDomainStore.getState().openEditor({ worktreeId: activeWorktreeId ?? null, paneKey: null })
  }

  return (
    <div className="flex h-full min-h-0 flex-col @container/goals">
      <div className="shrink-0 border-b border-sidebar-border px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-foreground">
              {translate('goals.panel.title', 'Goals')}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {statusMessage ??
                translate(
                  'goals.panel.subtitle',
                  'Keep an agent session on a goal until it is verified'
                )}
            </div>
          </div>
          {/* Why: the create entry stays visible in every state; a running goal must never hide it. */}
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={!canCreate}
            onClick={openCreate}
            aria-label={translate('goals.panel.newGoal', 'New goal')}
          >
            <Plus />
            {translate('goals.panel.newGoal', 'New goal')}
          </Button>
        </div>
        {selectedGoalId ? null : (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-1">
              <ScopeToggle scope={scope} />
              <div className="ml-auto flex items-center gap-0.5">
                {FILTERS.map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="xs"
                    variant={filter === value ? 'secondary' : 'ghost'}
                    aria-pressed={filter === value}
                    onClick={() => goalDomainStore.getState().setFilter(value)}
                  >
                    {filterLabel(value)}
                  </Button>
                ))}
              </div>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => goalDomainStore.getState().setQuery(event.target.value)}
                className="h-7 pl-6 text-xs"
                placeholder={translate('goals.panel.searchPlaceholder', 'Search goals')}
                aria-label={translate('goals.panel.searchGoals', 'Search goals')}
              />
            </div>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {selectedGoalId ? <GoalDetail goalId={selectedGoalId} /> : <GoalList />}
      </div>
      <GoalEditor />
      <GoalRebindDialog />
    </div>
  )
}

function ScopeToggle({ scope }: { scope: GoalScope }): React.JSX.Element {
  const options: { value: GoalScope; label: string }[] = [
    { value: 'workspace', label: translate('goals.scope.workspace', 'This workspace') },
    { value: 'all', label: translate('goals.scope.all', 'All') }
  ]
  return (
    <div
      className="flex items-center gap-0.5"
      role="group"
      aria-label={translate('goals.scope.label', 'Scope')}
    >
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="xs"
          variant={scope === option.value ? 'secondary' : 'ghost'}
          aria-pressed={scope === option.value}
          onClick={() => goalDomainStore.getState().setScope(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}

function filterLabel(filter: GoalListFilter): string {
  switch (filter) {
    case 'all':
      return translate('goals.filter.all', 'All')
    case 'running':
      return translate('goals.filter.running', 'Running')
    case 'attention':
      return translate('goals.filter.attention', 'Needs attention')
    case 'history':
      return translate('goals.filter.history', 'History')
  }
}
