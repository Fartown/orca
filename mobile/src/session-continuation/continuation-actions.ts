import { MessageSquarePlus } from 'lucide-react-native'
import type { ActionSheetAction } from '../components/ActionSheetModal'
import { CONTINUATION_COPY } from './continuation-copy'
import { resolveMobileContinuationSource, type MobileContinuationTab } from './continuation-source'

type ContinuationMenuTab = MobileContinuationTab & { id: string; terminal: string | null }

/** Builds the continuation entry for a terminal's long-press menu. Absent — not disabled —
 *  whenever the session cannot be continued, so the menu never offers a dead end. */
export function getMobileSessionContinuationActions<Tab extends ContinuationMenuTab>(args: {
  terminalHandle: string | null
  tabs: readonly Tab[]
  onDismiss: () => void
  onOpen: (tab: Tab) => void
}): ActionSheetAction[] {
  const tab = args.terminalHandle
    ? args.tabs.find((candidate) => candidate.terminal === args.terminalHandle)
    : undefined
  if (!tab || !resolveMobileContinuationSource(tab).eligible) {
    return []
  }
  return [
    {
      label: CONTINUATION_COPY.menuLabel,
      icon: MessageSquarePlus,
      closeBeforePress: true,
      onPress: () => {
        args.onDismiss()
        args.onOpen(tab)
      }
    }
  ]
}
