import { ActionSheetModal } from '../components/ActionSheetModal'
import { useMobileSessionContinuationScope } from './use-mobile-session-continuation-scope'
import type { MobileSessionTab } from '../session/mobile-session-route-types'
import { getMobileSessionContinuationActions } from './continuation-actions'

export function useMobileSessionContinuationSheet(
  scope: Parameters<typeof useMobileSessionContinuationScope>[0] & {
    sessionTabs: MobileSessionTab[]
  }
) {
  const {
    continuationTarget,
    continuationActions,
    continuationTitle,
    continuationMessage,
    openContinuation,
    closeContinuation
  } = useMobileSessionContinuationScope(scope)
  return {
    sessionContinuationActions: (terminalHandle: string | null, dismiss: () => void) =>
      getMobileSessionContinuationActions({
        terminalHandle,
        tabs: scope.sessionTabs.filter(
          (tab): tab is Extract<MobileSessionTab, { type: 'terminal' }> => tab.type === 'terminal'
        ),
        onDismiss: dismiss,
        onOpen: openContinuation
      }),
    continuationSheet: (
      <ActionSheetModal
        visible={continuationTarget != null}
        title={continuationTitle}
        message={continuationMessage}
        actions={continuationActions}
        onClose={closeContinuation}
      />
    )
  }
}
