import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import type { GoalCriterion } from '../../../../shared/goals/goal-control-contract'

/** User-declared acceptance items; only an item with a command is verified independently. */
export function GoalCriteriaEditor({
  criteria,
  onChange
}: {
  criteria: GoalCriterion[]
  onChange: (criteria: GoalCriterion[]) => void
}): React.JSX.Element {
  const add = (): void =>
    onChange([...criteria, { id: crypto.randomUUID(), description: '', command: undefined }])
  const patch = (id: string, changes: Partial<GoalCriterion>): void =>
    onChange(
      criteria.map((criterion) => (criterion.id === id ? { ...criterion, ...changes } : criterion))
    )
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label>{translate('goals.editor.criteria', 'Acceptance criteria')}</Label>
        <Button type="button" variant="ghost" size="xs" onClick={add}>
          <Plus />
          {translate('goals.editor.addCriterion', 'Add item')}
        </Button>
      </div>
      {criteria.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'goals.editor.criteriaHint',
            'Each item can carry a command; only items with a command are verified independently.'
          )}
        </p>
      ) : null}
      <ul className="space-y-2">
        {criteria.map((criterion, index) => (
          <li key={criterion.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-1">
            <div className="space-y-1">
              <Input
                value={criterion.description}
                aria-label={translate('goals.editor.criterionDescription', 'Criterion {{value0}}', {
                  value0: index + 1
                })}
                placeholder={translate('goals.editor.criterionPlaceholder', 'What must hold')}
                onChange={(event) => patch(criterion.id, { description: event.target.value })}
              />
              <Input
                value={criterion.command ?? ''}
                className="font-mono"
                aria-label={translate(
                  'goals.editor.criterionCommand',
                  'Command for criterion {{value0}}',
                  { value0: index + 1 }
                )}
                placeholder={translate(
                  'goals.editor.criterionCommandPlaceholder',
                  'Optional command; exit 0 passes, exit 3 means undecided'
                )}
                onChange={(event) =>
                  patch(criterion.id, { command: event.target.value || undefined })
                }
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={translate('goals.editor.removeCriterion', 'Remove criterion')}
              onClick={() => onChange(criteria.filter((item) => item.id !== criterion.id))}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
