import { useState } from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
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
        // field-sizing:content wraps a long title onto more lines instead of cutting it off; the
        // negative margin keeps the heading's text flush with the rows under it.
        className={cn(
          LOCAL_TASK_INLINE_FIELD,
          '-mx-1.5 block w-[calc(100%+0.75rem)] cursor-text resize-none overflow-hidden py-0.5 text-xl font-semibold leading-snug text-foreground [field-sizing:content] hover:border-transparent'
        )}
      />
      <FieldConflict field={field} />
    </div>
  )
}

const DESCRIPTION_TEXT = 'whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground'

/** Reads as text; a click opens the editor, which stays while a save or a conflict is pending. */
function DescriptionField({
  task,
  writable
}: {
  task: LocalTask
  writable: boolean
}): React.JSX.Element | null {
  const field = useLocalTaskFieldDraft({
    task,
    stored: task.description,
    read: readDescription,
    same: sameText,
    toPatch: (description) => ({ description })
  })
  const [editing, setEditing] = useState(false)
  const open = writable && (editing || field.conflict || field.value !== task.description)
  if (!open) {
    if (!field.value.trim()) {
      return writable ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3" />
          {translate('localTasks.detail.addDescription', 'Add description')}
        </button>
      ) : null
    }
    return writable ? (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          '-mx-1.5 block w-[calc(100%+0.75rem)] cursor-text rounded-md px-1.5 py-1 text-left hover:bg-accent/40',
          DESCRIPTION_TEXT
        )}
      >
        {field.value}
      </button>
    ) : (
      <p className={DESCRIPTION_TEXT}>{field.value}</p>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <ImeTextarea
        autoFocus
        value={field.value}
        maxLength={LOCAL_TASK_DESCRIPTION_MAX}
        onChange={(event) => field.edit(event.target.value)}
        onBlur={() => {
          setEditing(false)
          void field.commit()
        }}
        placeholder={translate('localTasks.create.descriptionPlaceholder', 'Add a description…')}
        aria-label={translate('localTasks.create.descriptionLabel', 'Description')}
        className={cn(
          LOCAL_TASK_INLINE_FIELD,
          '-mx-1.5 w-[calc(100%+0.75rem)] scrollbar-sleek min-h-20 resize-y border-border/60 py-1 text-sm leading-relaxed text-foreground [field-sizing:content]'
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
}): React.JSX.Element | null {
  return <DescriptionField task={task} writable={writable} />
}
