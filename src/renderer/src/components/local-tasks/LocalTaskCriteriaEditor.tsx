import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { isImeCompositionKeyDown } from '@/lib/ime-composition-keyboard-event'
import { ImeTextarea } from '@/lib/ime-text-field'
import { cn } from '@/lib/utils'
import {
  LOCAL_TASK_CRITERIA_MAX,
  LOCAL_TASK_CRITERION_MAX
} from '../../../../shared/local-tasks/local-task-model'
import { LOCAL_TASK_INLINE_FIELD } from './local-task-inline-field'

/** One criterion while it is being edited; the id only lives in this editing session. */
export type LocalTaskCriterionDraft = { id: string; text: string }

export function newLocalTaskCriterionDraft(text = ''): LocalTaskCriterionDraft {
  return { id: createBrowserUuid(), text }
}

/**
 * Stored criteria as drafts. Ids come from the text and its occurrence, so reading equal criteria
 * twice yields the same ids; once an edit starts, the draft keeps them while the text changes.
 */
export function toLocalTaskCriterionDrafts(criteria: readonly string[]): LocalTaskCriterionDraft[] {
  const seen = new Map<string, number>()
  return criteria.map((text) => {
    const occurrence = seen.get(text) ?? 0
    seen.set(text, occurrence + 1)
    return { id: `saved:${occurrence}:${text}`, text }
  })
}

/** Back to what the library stores: trimmed, non-empty strings in list order. */
export function cleanLocalTaskCriteria(items: readonly LocalTaskCriterionDraft[]): string[] {
  return items.map((item) => item.text.trim()).filter((text) => text.length > 0)
}

/**
 * A plain bulleted list, no checkboxes (REQ-004). Enter adds the next item, Backspace on an empty
 * item removes it. `onLeave` fires when focus leaves the whole list.
 */
export function LocalTaskCriteriaEditor({
  items,
  onItemsChange,
  onLeave,
  disabled
}: {
  items: LocalTaskCriterionDraft[]
  onItemsChange: (items: LocalTaskCriterionDraft[]) => void
  onLeave?: () => void
  disabled?: boolean
}): React.JSX.Element {
  const inputs = useRef(new Map<string, HTMLTextAreaElement>())
  const [focusId, setFocusId] = useState<string | null>(null)
  useEffect(() => {
    if (focusId !== null) {
      inputs.current.get(focusId)?.focus()
      setFocusId(null)
    }
  }, [focusId])
  const insertAfter = (position: number): void => {
    if (items.length >= LOCAL_TASK_CRITERIA_MAX) {
      return
    }
    const added = newLocalTaskCriterionDraft()
    onItemsChange([...items.slice(0, position + 1), added, ...items.slice(position + 1)])
    setFocusId(added.id)
  }
  const remove = (position: number): void => {
    onItemsChange(items.filter((_, index) => index !== position))
    setFocusId(items[Math.max(position - 1, 0)]?.id ?? null)
  }
  return (
    <div
      className="flex flex-col gap-1"
      onBlur={(event) => {
        if (onLeave && !event.currentTarget.contains(event.relatedTarget)) {
          onLeave()
        }
      }}
    >
      {items.map((item, position) => (
        <div key={item.id} className="group/criterion flex items-start gap-2">
          <span
            aria-hidden="true"
            className="w-3 shrink-0 text-center text-[13px] leading-7 text-muted-foreground"
          >
            •
          </span>
          <ImeTextarea
            rows={1}
            ref={(node) => {
              if (node) {
                inputs.current.set(item.id, node)
              } else {
                inputs.current.delete(item.id)
              }
            }}
            value={item.text}
            disabled={disabled}
            maxLength={LOCAL_TASK_CRITERION_MAX}
            onChange={(event) =>
              onItemsChange(
                items.map((current) =>
                  current.id === item.id
                    ? { ...current, text: event.target.value.replace(/\r?\n/g, ' ') }
                    : current
                )
              )
            }
            onKeyDown={(event) => {
              if (isImeCompositionKeyDown(event)) {
                return
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                insertAfter(position)
              } else if (event.key === 'Backspace' && item.text === '') {
                event.preventDefault()
                remove(position)
              }
            }}
            aria-label={translate('localTasks.criteria.item', 'Done criterion {{number}}', {
              number: position + 1
            })}
            // field-sizing:content wraps a long criterion instead of scrolling it out of view.
            className={cn(
              LOCAL_TASK_INLINE_FIELD,
              'block min-h-7 resize-none overflow-hidden py-1 text-[13px] leading-5 text-foreground [field-sizing:content]'
            )}
          />
          <span className="pt-0.5 opacity-0 transition-opacity group-hover/criterion:opacity-100 focus-within:opacity-100">
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={disabled}
              onClick={() => remove(position)}
              aria-label={translate('localTasks.criteria.remove', 'Remove criterion')}
            >
              <X className="size-3" />
            </Button>
          </span>
        </div>
      ))}
      {items.length < LOCAL_TASK_CRITERIA_MAX && !disabled ? (
        <Button
          variant="ghost"
          size="xs"
          className="w-fit"
          onClick={() => insertAfter(items.length - 1)}
        >
          <Plus className="size-3.5" />
          {translate('localTasks.criteria.add', 'Add a criterion')}
        </Button>
      ) : null}
    </div>
  )
}
