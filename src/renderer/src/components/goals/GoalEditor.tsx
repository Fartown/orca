import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { composeGoalAcceptanceText } from '../../../../shared/goals/goal-judge-contract'
import type { GoalOperation } from '../../../../shared/goals/goal-control-contract'
import { requestGoalDetailRefresh } from '@/goals/GoalDomainSyncGate'
import { fingerprintPayload, newClientOperationId } from '@/goals/goal-client-operation'
import { goalRuntimeClient } from '@/goals/goal-runtime-client'
import { resolveGoalBindingForPane } from '@/goals/goal-session-target'
import { goalDomainStore } from '@/goals/goals-domain-store'
import { useGoalDomainStore } from '@/goals/use-goals-domain-store'
import { GoalAdvancedSettings } from './GoalAdvancedSettings'
import { GoalAcceptanceDocument } from './GoalAcceptanceDocument'
import { useAcceptanceDraft } from './use-acceptance-draft'
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

// Product names of the judge CLIs; not copy, so they stay out of the catalog.
const JUDGE_CLI_LABELS = { claude: 'Claude Code', codex: 'Codex' } as const

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
  const [documentContext, setDocumentContext] = useState<string | null>(null)
  const context = JSON.stringify([
    draft.objective.trim(),
    draft.judge,
    editing?.binding.worktree ?? target.worktreeId,
    editing?.binding.terminal ?? target.paneKey
  ])
  const generation = useAcceptanceDraft(editor.open, context)
  const staleDocument = Boolean(draft.acceptanceDocument && documentContext !== context)
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
      setDocumentContext(
        JSON.stringify([
          saved.spec.objective.trim(),
          saved.spec.judge ?? 'none',
          saved.binding.worktree,
          saved.binding.terminal
        ])
      )
    }
  }, [editingGoalId, editingRevision, editor.open, editor.prefill])

  const hasCommands =
    draft.criteria.some((criterion) => criterion.command?.trim()) ||
    draft.extraChecks.trim().length > 0
  // Why: a picked judge always adds an independent check — per item, or over the goal text as a whole.
  const verifiable = hasCommands || draft.judge !== 'none'
  const valid =
    draft.objective.trim().length > 0 &&
    draft.objective.length <= 32_000 &&
    (editingGoalId !== null || Boolean(draft.acceptanceDocument.trim())) &&
    draft.acceptanceDocument.length <= 32_000 &&
    (!draft.acceptanceDocument || draft.judge !== 'none') &&
    !staleDocument &&
    !generation.generating &&
    (editingGoalId !== null || Boolean(target.worktreeId && target.paneKey)) &&
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
        // Why: the host never gates on this; it records that the unverified notice was shown.
        acknowledgeUnverifiedCompletion: !verifiable
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
        <form
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          onSubmit={(event) => void submit(event)}
        >
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
                    'Write your goal, generate and review its acceptance document, then start. The guard checks the result against this document.'
                  )}
            </SheetDescription>
          </SheetHeader>
          <fieldset
            disabled={pending}
            className="scrollbar-sleek min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto px-4 py-3"
          >
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
            {editing ? null : (
              <GoalTargetPicker value={target} locked={locked} onChange={setTarget} />
            )}
            <div className="space-y-1">
              <Label htmlFor="goal-judge">{translate('goals.editor.guard', 'Guard')}</Label>
              <Select
                value={draft.judge}
                onValueChange={(value) => update('judge', value as GoalDraft['judge'])}
              >
                <SelectTrigger id="goal-judge">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {editing && !draft.acceptanceDocument ? (
                    <SelectItem value="none">
                      {translate('goals.editor.judgeNone', 'None: only commands verify this goal')}
                    </SelectItem>
                  ) : null}
                  <SelectItem value="codex">{JUDGE_CLI_LABELS.codex}</SelectItem>
                  <SelectItem value="claude">{JUDGE_CLI_LABELS.claude}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'goals.editor.guardHint',
                  'The guard reads the workspace and referenced materials to draft the document, then independently checks the work during execution. Its CLI must be installed and signed in.'
                )}
              </p>
            </div>
            <GoalAcceptanceDocument
              value={draft.acceptanceDocument}
              onChange={(value) => {
                update('acceptanceDocument', value)
                if (!draft.acceptanceDocument) {
                  setDocumentContext(context)
                }
              }}
              generating={generation.generating}
              canGenerate={Boolean(
                draft.objective.trim() &&
                draft.judge !== 'none' &&
                (editing || (target.worktreeId && target.paneKey))
              )}
              stale={staleDocument}
              onReview={() => setDocumentContext(context)}
              onCancel={() => void generation.cancel()}
              onGenerate={() => {
                if (draft.judge === 'none') {
                  return
                }
                void generation.generate({
                  objective: draft.objective.trim(),
                  acceptanceContext: composeGoalAcceptanceText({
                    ...specFromDraft(draft),
                    objective: '',
                    acceptanceDocument: undefined,
                    acceptanceText: draft.acceptanceDocument || draft.acceptanceText
                  }),
                  judge: draft.judge,
                  resolveBinding: async () => {
                    if (editing) {
                      return editing.binding
                    }
                    const resolved = await resolveGoalBindingForPane(
                      target.worktreeId!,
                      target.paneKey!
                    )
                    if (!resolved.ok) {
                      throw new Error(bindingFailureMessage(resolved.reason))
                    }
                    return resolved.binding
                  },
                  onDocument: (document) => {
                    update('acceptanceDocument', document)
                    setDocumentContext(context)
                  }
                })
              }}
            />
            {editing && !draft.acceptanceDocument ? (
              <div className="space-y-1">
                <Label htmlFor="goal-acceptance-text">
                  {translate('goals.editor.acceptanceText', 'Acceptance notes')}
                </Label>
                <Textarea
                  id="goal-acceptance-text"
                  value={draft.acceptanceText}
                  onChange={(event) => update('acceptanceText', event.target.value)}
                />
              </div>
            ) : null}
            <GoalAdvancedSettings
              draft={draft}
              update={update}
              showCriteria={Boolean(editing && !draft.acceptanceDocument)}
            />
            {!verifiable ? (
              <p className="text-xs text-muted-foreground" role="note">
                {translate(
                  'goals.editor.unverifiedNotice',
                  'No check command and no judge: the goal completes when the agent says so, and the panel marks it as not independently verified.'
                )}
              </p>
            ) : null}
            {error || generation.error ? (
              <p className="text-xs text-destructive" role="alert">
                {error || generation.error}
              </p>
            ) : null}
          </fieldset>
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
              <Button type="submit" disabled={!valid || pending}>
                {pending
                  ? translate('goals.editor.starting', 'Starting…')
                  : translate('goals.editor.reviewAndStart', 'Start with this document')}
              </Button>
            )}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
