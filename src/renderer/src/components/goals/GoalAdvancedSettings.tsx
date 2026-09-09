import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { GoalCriteriaEditor } from './GoalCriteriaEditor'
import type { GoalDraft } from './goal-editor-draft'

export function GoalAdvancedSettings({
  draft,
  update,
  showCriteria
}: {
  showCriteria: boolean
  draft: GoalDraft
  update: <K extends keyof GoalDraft>(key: K, value: GoalDraft[K]) => void
}): React.JSX.Element {
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" size="xs">
          {translate('goals.editor.advanced', 'Advanced settings')}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-3">
        {showCriteria ? (
          <GoalCriteriaEditor
            criteria={draft.criteria}
            onChange={(criteria) => update('criteria', criteria)}
          />
        ) : null}
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            id="goal-max-turns"
            label={translate('goals.editor.maxTurns', 'Max turns')}
            value={draft.maxTurns}
            onChange={(value) => update('maxTurns', value)}
          />
          <NumberField
            id="goal-max-minutes"
            label={translate('goals.editor.maxMinutes', 'Max minutes')}
            value={draft.maxMinutes}
            onChange={(value) => update('maxMinutes', value)}
          />
          <NumberField
            id="goal-check-timeout"
            label={translate('goals.editor.checkTimeout', 'Check timeout (s)')}
            value={draft.checkTimeoutSeconds}
            onChange={(value) => update('checkTimeoutSeconds', value)}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          {translate('goals.editor.zeroMeansUnlimited', '0 turns or minutes means unlimited.')}
        </p>
        <div className="space-y-1">
          <Label htmlFor="goal-extra-checks">
            {translate('goals.editor.extraChecks', 'Extra check commands (one per line)')}
          </Label>
          <Textarea
            id="goal-extra-checks"
            rows={2}
            className="font-mono"
            value={draft.extraChecks}
            onChange={(event) => update('extraChecks', event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {translate(
              'goals.editor.extraChecksHint',
              'Run by the driver in the workspace with a shell. Shown here before submission; nothing is hidden.'
            )}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={draft.checkAll}
            onCheckedChange={(checked) => update('checkAll', checked === true)}
          />
          {translate('goals.editor.checkAll', 'Run all checks even after the first failure')}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={draft.onBlocked === 'verify'}
            onCheckedChange={(checked) => update('onBlocked', checked === true ? 'verify' : 'ask')}
          />
          {translate(
            'goals.editor.verifyWhenBlocked',
            'When the agent says it is blocked, run the checks before asking me'
          )}
        </label>
      </CollapsibleContent>
    </Collapsible>
  )
}

function NumberField({
  id,
  label,
  value,
  onChange
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}): React.JSX.Element {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
