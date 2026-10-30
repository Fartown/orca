import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { translate } from '@/i18n/i18n'

function Hint({ keys, label }: { keys: string[]; label: string }): React.JSX.Element {
  return (
    <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
      <ShortcutKeyCombo
        keys={keys}
        className="gap-0.5"
        keyCapClassName="min-w-4 px-1 py-0 text-3xs"
        separatorClassName="hidden"
      />
      {label}
    </span>
  )
}

/** The page's single keys; they apply only while focus is outside text fields (REQ-007). */
export function LocalTaskKeyHints(): React.JSX.Element {
  return (
    <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground @3xl/local-task-page:flex">
      <Hint keys={['J', 'K']} label={translate('localTasks.keys.move', 'Move')} />
      <Hint keys={['↵']} label={translate('localTasks.keys.open', 'Open')} />
      <Hint keys={['Space']} label={translate('localTasks.keys.preview', 'Preview')} />
      <Hint keys={['X']} label={translate('localTasks.keys.select', 'Select')} />
      <Hint keys={['S']} label={translate('localTasks.keys.status', 'Status')} />
      <Hint keys={['P']} label={translate('localTasks.keys.priority', 'Priority')} />
      <Hint keys={['L']} label={translate('localTasks.keys.labels', 'Labels')} />
      <Hint keys={['V']} label={translate('localTasks.keys.layout', 'List / board')} />
      <Hint keys={['F']} label={translate('localTasks.keys.filter', 'Filter')} />
      <Hint keys={['/']} label={translate('localTasks.keys.search', 'Search')} />
      <Hint keys={['C']} label={translate('localTasks.keys.create', 'New task')} />
    </div>
  )
}
