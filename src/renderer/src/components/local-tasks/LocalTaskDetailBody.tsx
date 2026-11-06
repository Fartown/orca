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
import { LOCAL_TASK_INLINE_FIELD } from './local-task-inline-field'
import { useLocalTaskFieldDraft, type LocalTaskFieldDraft } from './use-local-task-field-draft'

const sameText = (a: string, b: string): boolean => a === b
const readTitle = (task: LocalTask): string => task.title
const readDescription = (task: LocalTask): string => task.description
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

export function LocalTaskDetailTitle({
  task,
  writable
}: {
  task: LocalTask
  writable: boolean
}): React.JSX.Element {
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

export function LocalTaskDetailBody({
  task,
  writable
}: {
  task: LocalTask
  writable: boolean
}): React.JSX.Element {
  return <DescriptionField task={task} writable={writable} />
}
