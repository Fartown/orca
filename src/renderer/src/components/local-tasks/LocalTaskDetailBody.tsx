import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { isImeCompositionKeyDown } from '@/lib/ime-composition-keyboard-event'
import { ImeTextarea } from '@/lib/ime-text-field'
import { cn } from '@/lib/utils'
import {
  LOCAL_TASK_DESCRIPTION_MAX,
  LOCAL_TASK_TITLE_MAX
} from '../../../../shared/local-tasks/local-task-model'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import {
  cleanLocalTaskCriteria,
  LocalTaskCriteriaEditor,
  newLocalTaskCriterionDraft,
  toLocalTaskCriterionDrafts,
  type LocalTaskCriterionDraft
} from './LocalTaskCriteriaEditor'
import { LOCAL_TASK_INLINE_FIELD } from './local-task-inline-field'
import { useLocalTaskFieldDraft, type LocalTaskFieldDraft } from './use-local-task-field-draft'

const sameText = (a: string, b: string): boolean => a === b
const readTitle = (task: LocalTask): string => task.title
const readDescription = (task: LocalTask): string => task.description
const readCriteria = (task: LocalTask): LocalTaskCriterionDraft[] =>
  toLocalTaskCriterionDrafts(task.criteria)

function sameCriteria(a: LocalTaskCriterionDraft[], b: LocalTaskCriterionDraft[]): boolean {
  const left = cleanLocalTaskCriteria(a)
  const right = cleanLocalTaskCriteria(b)
  return left.length === right.length && left.every((text, index) => text === right[index])
}

/** Shown when the field was changed elsewhere while this edit was open. */
function FieldConflict<E>({ field }: { field: LocalTaskFieldDraft<E> }): React.JSX.Element | null {
  if (!field.conflict) {
    return null
  }
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 px-1.5 text-xs text-muted-foreground"
    >
      <AlertTriangle className="size-3.5 shrink-0" />
      <span>
        {translate(
          'localTasks.detail.conflict',
          'Changed on another device while you were editing. Your text is kept here.'
        )}
      </span>
      <Button
        variant="outline"
        size="xs"
        disabled={field.saving}
        onClick={() => void field.overwrite()}
      >
        {translate('localTasks.detail.conflictOverwrite', 'Overwrite with mine')}
      </Button>
      <Button variant="ghost" size="xs" disabled={field.saving} onClick={field.discard}>
        {translate('localTasks.detail.conflictDiscard', 'Discard mine')}
      </Button>
    </div>
  )
}

function TitleField({ task, writable }: { task: LocalTask; writable: boolean }): React.JSX.Element {
  const field = useLocalTaskFieldDraft({
    task,
    stored: task.title,
    read: readTitle,
    same: sameText,
    toPatch: (title) => ({ title: title.trim() })
  })
  return (
    <div className="flex flex-col gap-1">
      <ImeTextarea
        value={field.value}
        readOnly={!writable}
        rows={1}
        maxLength={LOCAL_TASK_TITLE_MAX}
        // Why: a title is one line of text; a pasted newline would only be stripped on save.
        onChange={(event) => field.edit(event.target.value.replace(/\r?\n/g, ' '))}
        onBlur={() => {
          // Why: an emptied title is not saved; the stored one comes back.
          if (field.value.trim()) {
            void field.commit()
          } else {
            field.discard()
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !isImeCompositionKeyDown(event)) {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }}
        aria-label={translate('localTasks.create.titleLabel', 'Title')}
        // field-sizing:content wraps a long title onto more lines instead of cutting it off.
        className={cn(
          LOCAL_TASK_INLINE_FIELD,
          'block resize-none overflow-hidden py-1 text-xl font-semibold leading-snug text-foreground [field-sizing:content]'
        )}
      />
      <FieldConflict field={field} />
    </div>
  )
}

function DescriptionField({
  task,
  writable
}: {
  task: LocalTask
  writable: boolean
}): React.JSX.Element {
  const field = useLocalTaskFieldDraft({
    task,
    stored: task.description,
    read: readDescription,
    same: sameText,
    toPatch: (description) => ({ description })
  })
  return (
    <div className="flex flex-col gap-1">
      <ImeTextarea
        value={field.value}
        readOnly={!writable}
        maxLength={LOCAL_TASK_DESCRIPTION_MAX}
        onChange={(event) => field.edit(event.target.value)}
        onBlur={() => void field.commit()}
        placeholder={translate('localTasks.create.descriptionPlaceholder', 'Add a description…')}
        aria-label={translate('localTasks.create.descriptionLabel', 'Description')}
        className={cn(
          LOCAL_TASK_INLINE_FIELD,
          'scrollbar-sleek min-h-20 resize-y py-1.5 text-sm leading-relaxed text-foreground'
        )}
      />
      <FieldConflict field={field} />
    </div>
  )
}

function CriteriaField({
  task,
  writable
}: {
  task: LocalTask
  writable: boolean
}): React.JSX.Element {
  // Why: ids come from the text, so a re-read with equal criteria keeps the same rows mounted.
  const stored = useMemo(() => toLocalTaskCriterionDrafts(task.criteria), [task.criteria])
  const field = useLocalTaskFieldDraft({
    task,
    stored,
    read: readCriteria,
    same: sameCriteria,
    toPatch: (criteria) => ({ criteria: cleanLocalTaskCriteria(criteria) })
  })
  if (field.value.length === 0) {
    return (
      <button
        type="button"
        disabled={!writable}
        onClick={() => field.edit([newLocalTaskCriterionDraft()])}
        className="w-fit text-left text-xs text-muted-foreground hover:text-foreground disabled:pointer-events-none"
      >
        {translate('localTasks.criteria.add', 'Add a criterion')}
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <LocalTaskCriteriaEditor
        items={field.value}
        onItemsChange={(items) => {
          field.edit(items)
          if (items.length === 0) {
            void field.commitValue(items)
          }
        }}
        disabled={!writable}
        onLeave={() => void field.commit()}
      />
      <FieldConflict field={field} />
    </div>
  )
}

/** Title, description and done criteria (a plain list, REQ-004); each saves when left. */
export function LocalTaskDetailBody({
  task,
  writable
}: {
  task: LocalTask
  writable: boolean
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <TitleField task={task} writable={writable} />
      <DescriptionField task={task} writable={writable} />
      <section className="flex flex-col gap-1.5">
        <h3 className="text-xs font-medium text-muted-foreground">
          {translate('localTasks.detail.criteria', 'Done criteria')}
        </h3>
        <CriteriaField task={task} writable={writable} />
      </section>
    </div>
  )
}
