import AgentCombobox from '@/components/agent/AgentCombobox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import {
  localTaskProposalEditFields,
  localTaskProposalPicksProject,
  type LocalTaskProposalEditField,
  type LocalTaskProposalItemDraft
} from '@/local-tasks/local-task-proposal-edits'
import { useLocalTaskLaunchAgents } from '@/local-tasks/use-local-task-launch-agents'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import type { LocalTaskProposalItem } from '../../../../shared/local-tasks/local-task-dispatcher-rpc-params'

/** The draft an editor starts from: the item's current words for every field it may change. */
export function localTaskProposalDraftOf(item: LocalTaskProposalItem): LocalTaskProposalItemDraft {
  const draft: LocalTaskProposalItemDraft = {}
  for (const field of localTaskProposalEditFields(item)) {
    const value = (item as Partial<Record<LocalTaskProposalEditField, string>>)[field]
    if (value !== undefined) {
      draft[field] = value
    }
  }
  // Why: saving applies the draft to the item as proposed, so a picked project has to ride along.
  if (localTaskProposalPicksProject(item) && item.project) {
    draft.project = item.project
  }
  return draft
}

function fieldLabel(field: LocalTaskProposalEditField): string {
  switch (field) {
    case 'title':
      return translate('localTasks.dispatcher.field.title', 'Title')
    case 'prompt':
      return translate('localTasks.dispatcher.field.prompt', 'First line')
    case 'agent':
      return translate('localTasks.dispatcher.field.agent', 'Agent')
    case 'text':
      return translate('localTasks.dispatcher.field.text', 'Append')
    case 'reason':
      return translate('localTasks.dispatcher.field.reason', 'Reason')
  }
}

/**
 * The fields of one proposal item the person may change before confirming (REQ-030). Enter in a
 * one-line field, or Cmd/Ctrl+Enter in a longer one, saves; Esc leaves the item as it was.
 */
export function LocalTaskProposalItemEditor({
  item,
  draft,
  onChange,
  onSave,
  onCancel
}: {
  item: LocalTaskProposalItem
  draft: LocalTaskProposalItemDraft
  onChange: (draft: LocalTaskProposalItemDraft) => void
  onSave: () => void
  onCancel: () => void
}): React.JSX.Element {
  const launch = useLocalTaskLaunchAgents(null)
  const set = (field: LocalTaskProposalEditField, value: string): void =>
    onChange({ ...draft, [field]: value })
  const onKeyDown = (event: React.KeyboardEvent, multiline: boolean): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onCancel()
      return
    }
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      if (!multiline || event.metaKey || event.ctrlKey) {
        event.preventDefault()
        onSave()
      }
    }
  }
  const agent = isTuiAgent(draft.agent) ? draft.agent : launch.preferred
  return (
    <div className="flex flex-col gap-1.5 pt-0.5">
      {localTaskProposalEditFields(item).map((field) => {
        const label = fieldLabel(field)
        const multiline = field === 'prompt' || field === 'text'
        return (
          <div
            key={field}
            className="flex min-w-0 items-start gap-2 text-2xs text-muted-foreground"
          >
            <span className="w-12 shrink-0 pt-1.5" aria-hidden>
              {label}
            </span>
            {field === 'agent' ? (
              launch.agents.length > 0 && agent ? (
                <AgentCombobox
                  agents={launch.agents}
                  value={agent}
                  defaultAgent={launch.defaultAgent}
                  onValueChange={(next) => set('agent', next)}
                  allowNarrowTrigger
                  triggerClassName="h-7 w-auto px-2 text-xs"
                />
              ) : (
                <span className="pt-1.5">{launch.unavailableReason}</span>
              )
            ) : multiline ? (
              <Textarea
                aria-label={label}
                value={draft[field] ?? ''}
                rows={2}
                onChange={(event) => set(field, event.target.value)}
                onKeyDown={(event) => onKeyDown(event, true)}
                className="min-h-0 px-2 py-1 text-xs md:text-xs"
              />
            ) : (
              <Input
                aria-label={label}
                value={draft[field] ?? ''}
                density="compact"
                onChange={(event) => set(field, event.target.value)}
                onKeyDown={(event) => onKeyDown(event, false)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
