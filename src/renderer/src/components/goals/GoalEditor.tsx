import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import type { GoalOperation } from '../../../../shared/goals/goal-control-contract'
import { requestGoalDetailRefresh } from '@/goals/GoalDomainSyncGate'
import { fingerprintPayload, newClientOperationId } from '@/goals/goal-client-operation'
import { goalRuntimeClient } from '@/goals/goal-runtime-client'
import { resolveGoalBindingForPane } from '@/goals/goal-session-target'
import { goalDomainStore } from '@/goals/goals-domain-store'
import { useGoalDomainStore } from '@/goals/use-goals-domain-store'
import { GoalCriteriaEditor } from './GoalCriteriaEditor'
import {
  EMPTY_GOAL_DRAFT,
  amendGoal,
  bindingFailureMessage,
  budgetFromDraft,
  draftFromDetail,
  isNonNegativeNumber,
  isPositiveNumber,
  specFromDraft,
  targetFromPrefill,
  type GoalDraft
} from './goal-editor-draft'
import { GoalTargetPicker, type GoalTargetSelection } from './GoalTargetPicker'

/**
 * Create form in a right Sheet. The draft survives a cancel so a failed launch
 * never costs the user their input; only a successful create clears it.
 */
export function GoalEditor(): React.JSX.Element {
  const editor = useGoalDomainStore((s) => s.editor)
  const editing = useGoalDomainStore((s) =>
    s.editor.prefill?.goalId ? s.detailsById[s.editor.prefill.goalId] : undefined
  )
  const editingGoalId = editor.prefill?.goalId ?? null
  const editingRevision = editing?.specRevision ?? null
  const [draft, setDraft] = useState<GoalDraft>(EMPTY_GOAL_DRAFT)
  const [target, setTarget] = useState<GoalTargetSelection>({ worktreeId: null, paneKey: null })
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [operationId, setOperationId] = useState<string>(() => newClientOperationId())
  const locked = Boolean(editor.prefill?.paneKey)

  useEffect(() => {
    if (!editor.open) {
      return
    }
    setTarget(targetFromPrefill(editor.prefill))
    setError(null)
    // Why keyed on id + revision, not the detail object: the 5s poll stores a fresh detail each
    // time, and reloading the draft on every poll would wipe edits in progress.
    const saved = editingGoalId ? goalDomainStore.getState().detailsById[editingGoalId] : undefined
    if (saved) {
      setDraft(draftFromDetail(saved))
    }
  }, [editingGoalId, editingRevision, editor.open, editor.prefill])

  const hasCommands =
    draft.criteria.some((criterion) => criterion.command?.trim()) ||
    draft.extraChecks.trim().length > 0
  const valid =
    draft.objective.trim().length > 0 &&
    (editingGoalId !== null || Boolean(target.worktreeId && target.paneKey)) &&
    (hasCommands || draft.acknowledgeUnverified) &&
    isNonNegativeNumber(draft.maxTurns) &&
    isNonNegativeNumber(draft.maxMinutes) &&
    isPositiveNumber(draft.checkTimeoutSeconds)

  const close = (): void => goalDomainStore.getState().closeEditor()

  const submit = async (event: React.FormEvent, resumeAfterSave = false): Promise<void> => {
    event.preventDefault()
    if (!valid) {
      return
    }
    setPending(true)
    setError(null)
    try {
      if (editing) {
        finish(await amendGoal(editing, draft, operationId, resumeAfterSave))
        return
      }
      if (!target.worktreeId || !target.paneKey) {
        return
      }
      const resolved = await resolveGoalBindingForPane(target.worktreeId, target.paneKey)
      if (!resolved.ok) {
        setError(bindingFailureMessage(resolved.reason))
        return
      }
      const payload = {
        binding: resolved.binding,
        spec: specFromDraft(draft),
        budget: budgetFromDraft(draft),
        acknowledgeUnverifiedCompletion: !hasCommands
      }
      // Why: the same id retries into the same receipt; a fresh one is minted only after the host answers.
      const operation = await goalRuntimeClient.create({
        ...payload,
        clientOperationId: operationId,
        payloadFingerprint: await fingerprintPayload(payload)
      })
      finish(operation)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setPending(false)
    }
  }

  const finish = (operation: GoalOperation): void => {
    setOperationId(newClientOperationId())
    if (operation.status === 'rejected') {
      setError(operation.message)
      return
    }
    if (operation.status === 'accepted') {
      goalDomainStore.getState().trackOperation(operation)
    }
    if (operation.goalId) {
      goalDomainStore.getState().select(operation.goalId)
      requestGoalDetailRefresh(operation.goalId)
    }
    setDraft(EMPTY_GOAL_DRAFT)
    close()
  }

  const update = <K extends keyof GoalDraft>(key: K, value: GoalDraft[K]): void =>
    setDraft((current) => ({ ...current, [key]: value }))

  return (
    <Sheet open={editor.open} onOpenChange={(open) => (open ? undefined : close())}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-[640px]">
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void submit(event)}>
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle>
              {editing
                ? translate('goals.editor.editTitle', 'Edit goal')
                : translate('goals.editor.title', 'New goal')}
            </SheetTitle>
            <SheetDescription>
              {editing
                ? translate(
                    'goals.editor.editDescription',
                    'Changing the goal or acceptance starts a new definition revision; earlier evidence no longer counts. Changing only the budget keeps it.'
                  )
                : translate(
                    'goals.editor.description',
                    'The driver keeps injecting into the chosen session until the acceptance passes or the budget runs out.'
                  )}
            </SheetDescription>
          </SheetHeader>
          <div className="scrollbar-sleek min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
            <div className="space-y-1">
              <Label htmlFor="goal-objective">{translate('goals.editor.objective', 'Goal')}</Label>
              <Textarea
                id="goal-objective"
                autoFocus
                rows={4}
                value={draft.objective}
                onChange={(event) => update('objective', event.target.value)}
                placeholder={translate(
                  'goals.editor.objectivePlaceholder',
                  'What must be true when this is done?'
                )}
              />
            </div>
            <GoalCriteriaEditor
              criteria={draft.criteria}
              onChange={(criteria) => update('criteria', criteria)}
            />
            <div className="space-y-1">
              <Label htmlFor="goal-acceptance-text">
                {translate('goals.editor.acceptanceText', 'Acceptance notes')}
              </Label>
              <Textarea
                id="goal-acceptance-text"
                rows={2}
                value={draft.acceptanceText}
                onChange={(event) => update('acceptanceText', event.target.value)}
              />
            </div>
            {editing ? null : (
              <GoalTargetPicker value={target} locked={locked} onChange={setTarget} />
            )}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="xs">
                  {translate('goals.editor.advanced', 'Advanced settings')}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-3">
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
                  {translate(
                    'goals.editor.zeroMeansUnlimited',
                    '0 turns or minutes means unlimited.'
                  )}
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
                  {translate(
                    'goals.editor.checkAll',
                    'Run all checks even after the first failure'
                  )}
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={draft.onBlocked === 'verify'}
                    onCheckedChange={(checked) =>
                      update('onBlocked', checked === true ? 'verify' : 'ask')
                    }
                  />
                  {translate(
                    'goals.editor.verifyWhenBlocked',
                    'When the agent says it is blocked, run the checks before asking me'
                  )}
                </label>
              </CollapsibleContent>
            </Collapsible>
            {!hasCommands ? (
              <label className="flex items-start gap-2 text-xs">
                <Checkbox
                  checked={draft.acknowledgeUnverified}
                  onCheckedChange={(checked) => update('acknowledgeUnverified', checked === true)}
                />
                <span>
                  {translate(
                    'goals.editor.acknowledgeUnverified',
                    'No acceptance commands: completion will be taken from the agent without independent verification.'
                  )}
                </span>
              </label>
            ) : null}
            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
            <Button type="button" variant="ghost" onClick={close}>
              {translate('goals.editor.cancel', 'Cancel')}
            </Button>
            {editing ? (
              <>
                <Button type="submit" variant="outline" disabled={!valid || pending}>
                  {translate('goals.editor.save', 'Save')}
                </Button>
                <Button
                  type="button"
                  disabled={!valid || pending}
                  onClick={(event) => void submit(event, true)}
                >
                  {translate('goals.editor.saveAndResume', 'Save and resume')}
                </Button>
              </>
            ) : (
              <Button type="submit" disabled={!valid || pending} className="w-36">
                {pending
                  ? translate('goals.editor.starting', 'Starting…')
                  : translate('goals.editor.createAndStart', 'Create and start')}
              </Button>
            )}
          </div>
        </form>
      </SheetContent>
    </Sheet>
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
