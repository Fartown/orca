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
import { openGoalDocument } from '@/goals/open-goal-document'
import { resolveGoalBindingForPane } from '@/goals/goal-session-target'
import { goalDomainStore } from '@/goals/goals-domain-store'
import { useGoalDomainStore } from '@/goals/use-goals-domain-store'
import { GoalAdvancedSettings } from './GoalAdvancedSettings'
import { GoalAcceptanceDocument } from './GoalAcceptanceDocument'
import { useAcceptanceDraft } from './use-acceptance-draft'
import { useGoalEditorDraft } from './use-goal-editor-draft'
import { GoalDraftProgress } from './GoalDraftProgress'
import { goalDraftContext } from '../../../../shared/goals/goal-editor-draft-contract'
import {
  amendGoal,
  bindingFailureMessage,
  budgetFromDraft,
  isNonNegativeNumber,
  isPositiveNumber,
  specFromDraft,
  type GoalDraft
} from './goal-editor-draft'
import { GoalTargetPicker } from './GoalTargetPicker'

// Product names of the judge CLIs; not copy, so they stay out of the catalog.
const JUDGE_CLI_LABELS = { claude: 'Claude Code', codex: 'Codex' } as const

/** The persisted draft and its generation attempt outlive this editor. */
export function GoalEditor(): React.JSX.Element {
  const editor = useGoalDomainStore((s) => s.editor)
  const persistence = useGoalEditorDraft(editor)
  const { session, content } = persistence
  const draft = content.fields
  const target = content.target
  const editingGoalId = content.goalId
  const editing = useGoalDomainStore((s) =>
    editingGoalId ? s.detailsById[editingGoalId] : undefined
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const context = goalDraftContext(draft, target.worktreeId)
  const generation = useAcceptanceDraft(session, content.generation?.draftId ?? null)
  const staleDocument = Boolean(draft.acceptanceDocument && content.documentContext !== context)
  const locked = Boolean(editor.prefill?.paneKey && !editor.prefill?.draftId)
  const candidate =
    generation.result?.status === 'ready' && !content.generation?.applied
      ? generation.result.document
      : null
  const setDocumentContext = (value: string): void =>
    session?.change((current) => ({ ...current, documentContext: value }))
  const setTarget = (value: typeof target): void =>
    session?.change((current) => ({ ...current, target: value }))

  useEffect(() => setError(null), [session?.id])

  const hasCommands =
    draft.criteria.some((criterion) => criterion.command?.trim()) ||
    draft.extraChecks.trim().length > 0
  // Why: a picked judge always adds an independent check — per item, or over the goal text as a whole.
  const verifiable = hasCommands || draft.judge !== 'none'
  const valid =
    Boolean(session) &&
    !persistence.loading &&
    !persistence.error &&
    !candidate &&
    !generation.unresolved &&
    (!editingGoalId || Boolean(editing)) &&
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

  const close = (): void => {
    void (session?.flush() ?? Promise.resolve())
      .then(() => {
        setError(null)
        goalDomainStore.getState().closeEditor()
      })
      .catch((caught) => setError(String(caught)))
  }

  const submit = async (event: React.FormEvent, resumeAfterSave = false): Promise<void> => {
    event.preventDefault()
    if (!valid) {
      return
    }
    setPending(true)
    setError(null)
    try {
      if (editing) {
        await finish(await amendGoal(editing, draft, content.operationId, resumeAfterSave))
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
        clientOperationId: content.operationId,
        payloadFingerprint: await fingerprintPayload(payload)
      })
      await finish(operation)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setPending(false)
    }
  }

  const finish = async (operation: GoalOperation): Promise<void> => {
    if (operation.status === 'rejected') {
      setError(operation.message)
      session?.change((current) => ({ ...current, operationId: newClientOperationId() }))
      return
    }
    if (operation.status === 'accepted') {
      goalDomainStore.getState().trackOperation(operation)
    }
    if (operation.goalId) {
      goalDomainStore.getState().select(operation.goalId)
      requestGoalDetailRefresh(operation.goalId)
    }
    session?.change((current) => ({ ...current, archived: true }))
    await session?.flush()
    close()
  }

  const update = <K extends keyof GoalDraft>(key: K, value: GoalDraft[K]): void =>
    session?.change((current) => ({ ...current, fields: { ...current.fields, [key]: value } }))

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
            disabled={pending || persistence.loading || !session}
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
            <GoalDraftProgress
              result={generation.result}
              error={generation.error}
              generating={generation.generating}
              saving={persistence.saving}
              saveError={persistence.error}
              onRetrySave={() => void session?.flush().catch(() => {})}
            />
            <GoalAcceptanceDocument
              key={session?.id}
              value={draft.acceptanceDocument}
              documentPath={persistence.documentPath}
              candidatePath={
                generation.result?.status === 'ready' ? generation.result.documentPath : undefined
              }
              onOpenDocument={(path) => {
                void (async () => {
                  try {
                    await session?.flush()
                    const currentPath =
                      path === persistence.documentPath
                        ? (session?.getSnapshot().documentPath ?? path)
                        : path
                    if (!target.worktreeId) {
                      return
                    }
                    await openGoalDocument(currentPath, target.worktreeId)
                    goalDomainStore.getState().closeEditor()
                  } catch (caught) {
                    setError(caught instanceof Error ? caught.message : String(caught))
                  }
                })()
              }}
              onChange={(value) => {
                update('acceptanceDocument', value)
                if (!draft.acceptanceDocument) {
                  setDocumentContext(context)
                }
              }}
              generating={generation.generating}
              canGenerate={Boolean(
                draft.objective.trim() && draft.judge !== 'none' && target.worktreeId
              )}
              candidate={candidate}
              onAdopt={() => {
                if (!candidate || !content.generation) {
                  return
                }
                session?.change((current) => ({
                  ...current,
                  fields: { ...current.fields, acceptanceDocument: candidate },
                  documentContext: current.generation!.context,
                  generation: { ...current.generation!, applied: true }
                }))
              }}
              stopping={generation.result?.phase === 'stopping'}
              stale={staleDocument}
              onReview={() => setDocumentContext(context)}
              onCancel={() => void generation.cancel()}
              onGenerate={() => {
                if (draft.judge === 'none') {
                  return
                }
                void generation.generate({
                  objective: draft.objective.trim(),
                  context,
                  worktree: target.worktreeId!,
                  acceptanceContext: composeGoalAcceptanceText({
                    ...specFromDraft(draft),
                    objective: '',
                    acceptanceDocument: undefined,
                    acceptanceText: draft.acceptanceDocument || draft.acceptanceText
                  }),
                  judge: draft.judge
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
            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </fieldset>
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
            <Button type="button" variant="ghost" onClick={close}>
              {translate('goals.editor.close', 'Close')}
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
