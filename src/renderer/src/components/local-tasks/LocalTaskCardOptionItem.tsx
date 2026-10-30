import { DropdownMenuCheckboxItem } from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import {
  chooseLocalTaskCardChipShown,
  useLocalTaskCardChipOffered,
  useLocalTaskCardChipShown
} from '@/local-tasks/local-task-card-chip-preference'

/**
 * "Local task" after upstream's property rows in "Show properties" and "Card display": it shows or
 * hides the card's task chip only; the hover card lists the task either way, as upstream does.
 */
export function LocalTaskCardOptionItem(): React.JSX.Element | null {
  const offered = useLocalTaskCardChipOffered()
  const shown = useLocalTaskCardChipShown()
  if (!offered) {
    return null
  }
  return (
    <DropdownMenuCheckboxItem
      checked={shown}
      onCheckedChange={(checked) => chooseLocalTaskCardChipShown(checked === true)}
      onSelect={(event) => event.preventDefault()}
    >
      {translate('localTasks.card.option', 'Local task')}
    </DropdownMenuCheckboxItem>
  )
}
